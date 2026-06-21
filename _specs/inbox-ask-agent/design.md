# B5 — inbox-ask-agent — Design

Anchored on real files (file:line). Reuse-first, no migration, bounded multi-step,
offline-testable retrieval + abstention floor.

## 0. Ground-truth confirmation (what exists today)

| Concern | Exists today | Verdict for B5 |
|---|---|---|
| Whole-inbox ask | `POST /api/inbox/ask-inbox` + `askInbox` (`ask-inbox.ts:163`) | **SINGLE-PASS RAG**: one `selectRelevantThreads` then one `tracedGenerateObject`. B5 wraps it in a tool loop. |
| Retrieval | `selectRelevantThreads` keyword scorer (`ask-inbox.ts:62-82`) | REUSE as `search_inbox` tool body. |
| Thread read | `askThread` (`ask-thread.ts:105`) | REUSE as `read_thread` tool body. |
| Summarize | `summarizeThread` (`summarize-thread.ts:82`) | REUSE as `summarize_thread` tool body. |
| Tenancy | `getInboxScope` + `scopeConversationRows` (`user-scope.ts:95,158`) | REUSE verbatim as the corpus boundary. |
| Corpus + B1/B3/B4 signals | `buildConversations` (`conversations.ts:253`; `replyWorthy:120`, `split:127`, `noise:131`) | CONSUME, do not compute. |
| Tool-loop primitive | `generateText({ tools, stopWhen: stepCountIs(n) })` (`api/eval/route.ts:243-266`, `api/chat/route.ts:744,831`) | REUSE the pattern via `tracedGenerateText`. |
| Tool definition | `makeTool`/`tool()` + `inputSchema`/`execute` (`chat/tools/knowledge.ts:23-32`) | REUSE the helper. |
| Citation clamps | `ask-inbox.ts:176`, `summarize-thread.ts:92` | PRESERVE + guard by eval. |
| AI gate / rate-limit | `aiEnabled` (`ai-profile.ts:39`), `rateLimitLLM` (`infra/rate-limit.ts:37`) | REUSE. |
| Never-auto-send | `resolveAutonomy(..., "send")` -> `perform:false` (`autonomy.ts:32-35`) | REUSE for action proposals. |
| Eval gate | `inbox-metrics.ts` + `inbox-reply-worthy-gate.test.ts` + `eval:run` (`package.json:12`) | EXTEND with `inbox-ask` floor. |

## 1. Architecture diff vs existing

**Already there (no change):** the route shell (auth, AI gate, scope, corpus build,
`ask-inbox/route.ts:18-47`), the keyword scorer, the single-pass answerer, the
summarizer, the thread reader, the tenancy module, the trace wrapper, the
never-auto-send guard, `inbox-metrics.ts`.

**Added (all `[NEW]` unless noted):**

```
app/apps/web/src/lib/inbox/
  ask-agent.ts            [NEW]  runInboxAgent(corpus, question, opts) — the bounded
                                 retrieve->verify->act loop; model-injectable; reuses
                                 selectRelevantThreads / read / summarizeThread.
  ask-agent-tools.ts      [NEW]  buildAskAgentTools(corpus) — search_inbox / read_thread /
                                 summarize_thread as makeTool()s, each closed over the SCOPED
                                 corpus (no DB access inside execute).
  ask-agent-verify.ts     [NEW]  pure verifier: clamp citations in-range, drop fabricated keys,
                                 collapse to answered=false when zero valid citations remain.
app/apps/web/src/lib/evals/
  inbox-metrics.ts        [EDIT] + retrievalRecall / abstentionCorrectness /
                                 groundedAnswerRate / citationInRange (pure, no LLM).
  suites/inbox-ask.eval.ts        [NEW]  EvalSuite (deterministic generator) + aggregateMetrics.
  fixtures/inbox/inbox-ask.golden.jsonl  [NEW]  >=15 cases, >=4 negatives.
app/apps/web/src/app/api/inbox/ask-inbox/
  route.ts                [EDIT] add rateLimitLLM gate; call runInboxAgent when a model key is
                                 present, else fall back to the existing askInbox path.
app/apps/web/src/__tests__/
  inbox-ask-agent-gate.test.ts    [NEW]  C1 floor gate, wired into eval:run.
  (unit) lib/inbox/__tests__/ask-agent.test.ts, ask-agent-tools.test.ts, ask-agent-verify.test.ts
app/apps/web/src/app/(dashboard)/inbox/
  _inbox-ask.tsx          [NEW]  whole-inbox ask panel (reuses SourceLink); answered=false state.
                                 [BLOCKED-ON F1] for the section-8 design checklist sign-off.
```

**Not added:** no new route path (the agent upgrades the existing `ask-inbox` route),
no embedding index, no new provider/dep, no DB migration, no draft engine.

## 2. The agent loop (retrieve -> verify -> act)

`runInboxAgent(corpus: AgentCorpus, question: string, opts)` where
`AgentCorpus = { threads: InboxThread[] }` is the ALREADY-SCOPED conversation set
(built once in the route via `scopeConversationRows` + `buildConversations`, same as
`ask-inbox/route.ts:39-47`). `opts = { model?, maxSteps = 6, instructions = "" }`.

Loop (AI SDK, NOT hand-rolled):

```
const { steps, text } = await tracedGenerateText({
  model,                                   // injected; default anthropic("claude-haiku-4-5")
  system: AGENT_SYSTEM + instructions,     // instructions = memory prompt (ai-memory.ts)
  messages: [{ role: "user", content: question }],
  tools: buildAskAgentTools(corpus),       // search_inbox / read_thread / summarize_thread
  stopWhen: stepCountIs(maxSteps),         // R1.3 — bounded; mirrors api/chat/route.ts:744
  _trace: { agentId: "inbox-ask-agent", tenantId, inputPreview: question.slice(0,200) },
});
```

- **Retrieve:** the model calls `search_inbox` (and optionally `read_thread`/
  `summarize_thread` on the top candidates). Each tool returns indexed evidence blocks.
- **Verify:** after the loop, the final assistant turn produces a structured
  `{ answer, answered, citations }` (the agent is instructed to call NO tool on its last
  step and emit JSON). `ask-agent-verify.ts` re-validates every citation against the
  evidence the tools actually returned (not what the model claims it read).
- **Act:** answer with cited refs, OR (R6) a STAGED action proposal. No write side effects.

Final shape mirrors the existing `InboxAnswer` (`ask-inbox.ts:30-35`):
`{ answer; answered; citations: { key; subject }[]; proposal?: ActionProposal }`.

**Why AI SDK tool-loop, not hand-rolled (Layer-1, decision):** the repo already runs
`generateText({ tools, stopWhen: stepCountIs(n) })` in two production routes
(`api/eval/route.ts:265`, `api/chat/route.ts:744`); `tracedGenerateText` records steps +
toolCalls for free (`traced-ai.ts:109`). A hand-rolled while-loop would re-implement stop
conditions, tracing, and step accounting — rejected.

## 3. The three tools (`buildAskAgentTools(corpus)`)

Each is `makeTool({ description, inputSchema, execute })` (the `chat/tools/knowledge.ts:23`
shape) closed over the in-memory scoped `corpus`. **execute never touches the DB**, so
tenancy is structurally guaranteed (R2.2) and every tool is unit-testable with a fixture.

| Tool | inputSchema | execute (reuses) | Returns | Guards |
|---|---|---|---|---|
| `search_inbox` | `{ query, limit? }` | `selectRelevantThreads(corpus.threads, query, min(limit ?? 6, 12))` | `[{ idx, key, subject, snippet }]` | empty -> `[]` (drives R3.2 abstain) |
| `read_thread` | `{ key }` | `corpus.threads.find(key)`; messages sliced like `ask-thread.ts:61` | `{ key, messages: [{ idx, who, body }] }` or error | key absent -> error (R2.3) |
| `summarize_thread` | `{ key }` | `summarizeThread(thread.messages)` (`summarize-thread.ts:82`) | `{ key, tldr, keyPoints, citations }` (clamped `:92`) | key absent -> error (R2.3) |

No `send`/`book`/`label` tool exists in the loop (R6.4). An action PROPOSAL, if the model
requests one, is emitted as part of the final structured answer and routed through
`resolveAutonomy(..., "send")` which returns `perform:false` (`autonomy.ts:33`) — staged,
never executed (R6.2).

## 4. The verifier (`ask-agent-verify.ts`, pure, the heart of the offline floor)

```
verifyAnswer(
  raw: { answer; answered; citations: CiteRef[] },   // CiteRef = { key } | { key, messageIdx }
  evidence: { keysSeen: Set<string>; threadMsgCount: Map<string, number> },
): InboxAnswer
```

Rules (each a unit test):
1. Drop any citation whose `key` is not in `evidence.keysSeen` (model cited a thread it
   never retrieved) — guards fabricated keys (R2.6).
2. Drop any `messageIdx` outside `[0, threadMsgCount.get(key))` — the in-range clamp,
   mirroring `summarize-thread.ts:92` / `ask-inbox.ts:176` (R2.4, R5.2).
3. `answered = Boolean(raw.answered) && answer.trim().length > 0 && validCitations.length > 0`
   — an answer with zero surviving citations collapses to `answered=false` (R1.4, R2.6).
4. On any thrown error -> `{ answer: NOT_FOUND, citations: [], answered: false }` (fail-closed,
   mirrors `ask-inbox.ts:180`).

This function plus `selectRelevantThreads` is the entire deterministic floor — both run
with NO LLM key.

## 5. Data model diff

**None.** No Drizzle `CREATE`/`ALTER`. The agent reads the existing read-model
(`loadConversationRows` -> `buildConversations`), the AI profile lives in
`user_preferences` JSONB (`ai-profile.ts:47-48`, no migration), traces persist via the
existing `recordTrace` path (`traced-ai.ts:100`). (R8 / N6.)

## 6. Orchestration (Inngest)

**No new Inngest function.** The agent runs synchronously inside the request (like the
existing ask route) and in CI via `pnpm eval:run`. OPTIONAL (out of scope, tracked under
observability, same note as `inbox-quality-evals/design.md:82-86`): register
`inbox-ask.eval` in the weekly eval cron so `eval_runs` gets a production timeline — zero
new wiring since the suite already conforms to `EvalSuite`.

## 7. Integrations — vs the locked stack

- Model: Anthropic Haiku/Sonnet via the AI SDK (`anthropic(...)`), same default as
  `ask-inbox.ts:144`. `[LOCKED]` — no new provider.
- Tool loop: AI SDK `generateText` + `stopWhen: stepCountIs` via `tracedGenerateText`.
  `[LOCKED]` — already in `api/eval` + `api/chat`.
- Judge (prose tier): Anthropic via `runGrader` (`inbox-quality-evals/design.md:91`). `[LOCKED]`.
- Runner: Vitest. Persistence: `eval_runs`/`eval_case_runs` via `runEvalSuite`. `[LOCKED]`.
- No new npm dependency (the metric fns are ~15-line pure functions in `inbox-metrics.ts`).

## 8. The eval gate (C1 surface `inbox-ask` + `inbox-summary`)

Two tiers, mirroring `golden-eval-gate.test.ts:44` `HAS_LLM` split:

**Deterministic floor (always runs, gates CI without a key):**
- `retrieval_recall >= 0.90` — for each case, run `selectRelevantThreads` over the case
  corpus; recall = fraction of cases whose gold-relevant thread key appears in the top-N
  selection. `retrievalRecall(cases)` in `inbox-metrics.ts`.
- `abstention_correctness == 1.0` — on every negative case (answer not in corpus), the
  agent (with the scripted/deterministic generator) returns `answered=false`.
  `abstentionCorrectness(cases)` — hard-fails the suite on a single miss.
- citation-in-range — every emitted citation validated by `citationInRange(citations, corpus)`;
  any out-of-range index fails (guards the clamps).

**LLM tier (`WHERE ANTHROPIC_API_KEY is set`):**
- `grounded_answer_rate >= 0.85` — `contains_all`(requiredFacts) AND citation-in-range on
  positive cases. `groundedAnswerRate(cases)`.
- summary `faithfulness` / `citation_accuracy` carried by the existing `inbox-summary` suite
  (`inbox-quality-evals/design.md:117`) — re-run since B5 reuses `summarizeThread`.

Fixture `inbox-ask.golden.jsonl` line shape (mirrors `inbox-reply-worthy.golden.jsonl`):
```
{ "id":"ask-001", "scenario":"...", "corpus":[{ "key":"t1","subject":"...","messages":[...] }],
  "question":"...", "expected":{ "answered":true, "relevantKeys":["t1"], "requiredFacts":["40k"] } }
{ "id":"ask-neg-001","scenario":"answer absent","corpus":[...],"question":"...",
  "expected":{ "answered":false, "relevantKeys":[], "requiredFacts":[] } }
```

## 9. Guardrails (one line each)

- Tenancy structural: tools close over the scoped in-memory corpus; no tool hits the DB (R2.2).
- Bounded loop: `stopWhen: stepCountIs(MAX_STEPS=6)`; never hand-rolled (R1.3, N4).
- Abstention beats fabrication: zero valid citations -> `answered=false`; `==1.0` on negatives (R3).
- Citation-in-range: the verifier re-validates against evidence actually returned, not model claims (R2.4).
- Fail-closed: any tool/model error -> `answered=false`, never partial/hallucinated (R1 edge).
- Honest degrade: no LLM key -> single-pass `askInbox` fallback, never a guess (R1.6).
- Read-only: no write tool in the loop; action proposals staged via `resolveAutonomy` (R6).
- Gated + limited: `aiEnabled` + `rateLimitLLM` + `enforceLlmBudget` on every call (R7).
- Offline floor: retrieval recall + abstention + citation-in-range computable with NO key (R8.2).
- No new dep / no migration / no embedding index (N2, N3, N6).
