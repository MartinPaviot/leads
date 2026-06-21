# B5 — inbox-ask-agent — Requirements (EARS)

Feature ID: `inbox-ask-agent` (Track B, Upstream-parity intelligence, Prio P1).
Deps: **C1** `inbox-quality-evals` (eval gate). Consumes B1/B3/B4 signals (does NOT
re-spec them). Source: `_research/upstream/` (CORE-VALUE: the "ask-inbox agent" loop;
QUALITY-BENCH: agent correctness + grounded/cited answers + abstention).

## Ground-truth verdict (verified 2026-06-19)

**The existing ask-inbox is SINGLE-PASS RAG, not multi-step.** Today
`POST /api/inbox/ask-inbox` (`route.ts:49-58`) does exactly one retrieval
(`selectRelevantThreads`, keyword scoring, `ask-inbox.ts:62-82`) then ONE
`tracedGenerateObject` call (`ask-inbox.ts:163-184`, default generator `:150`).
There is no verify step and no tool loop. B5 upgrades this surface to a bounded
multi-step agent (retrieve -> verify -> act) using the AI SDK tool-calling pattern
already in the repo (`api/eval/route.ts:243-266`, `api/chat/route.ts:744`:
`generateText({ tools, stopWhen: stepCountIs(n) })`; `chat/tools/knowledge.ts:23`:
`makeTool`/`tool()` with `inputSchema` + `execute`), preserving the in-range
citation clamps (`ask-inbox.ts:176`, `summarize-thread.ts:92`) and the
fail-closed `answered=false` contract.

## Status tags

- `[DONE]` already shipped, do NOT re-spec
- `[NEW]` real gap, needs code
- `[REUSE]` existing helper wired into the new loop (no rewrite)
- `[LOCKED]` stack decision, do NOT reopen
- `[HORS SCOPE]` tracked elsewhere

## Already shipped (DO NOT re-spec, B5 reuses)

- `[DONE]` Keyword retrieval `selectRelevantThreads(threads, question, limit)`
  (`ask-inbox.ts:62-82`) + `tokenize` (`:49`). B5 reuses as the `search` tool body.
- `[DONE]` Single-pass grounded answer `askInbox` with in-range citation clamp
  (`ask-inbox.ts:163-184`, clamp `:176`). B5 keeps it as the final answer step
  and as the deterministic-floor fallback when no LLM key is present.
- `[DONE]` Thread-scoped Q&A `askThread` (`ask-thread.ts:105`) + route
  (`api/inbox/conversations/ask/route.ts`). B5 reuses as the `read_thread` tool body.
- `[DONE]` Retrieval-grounded summarization `summarizeThread` with in-range citation
  clamp (`summarize-thread.ts:82-98`, clamp `:92`) + route
  (`api/inbox/conversations/summarize/route.ts`). B5 reuses as the `summarize_thread` tool.
- `[DONE]` Owner+tenant scoping `getInboxScope` / `scopeConversationRows`
  (`user-scope.ts:95,158`). Every retrieval goes through this, no exceptions.
- `[DONE]` Retrievable corpus `buildConversations` (`conversations.ts:253`): carries
  messages, `intelligence`, and the B1/B3/B4 signals `replyWorthy` (`:120`), `split` (`:127`),
  `noise` (`:131`). B5 consumes these signals; it does not compute them.
- `[DONE]` AI gate `aiEnabled(getAiProfile(userId))` (`ai-profile.ts:39,50`).
- `[DONE]` Per-user LLM rate-limit `rateLimitLLM(userId)` (`infra/rate-limit.ts:37`) +
  `rateLimitResponse` (`:21`).
- `[DONE]` Tracing wrapper `tracedGenerateText` / `tracedGenerateObject` (`traced-ai.ts:73,145`):
  records steps + toolCalls (`:109`). B5 tool loop uses `tracedGenerateText`.
- `[DONE]` Never-auto-send hard guard `resolveAutonomy(..., "send")` -> `perform:false`
  (`autonomy.ts:32-35`). B5 act-step proposals obey this contract.
- `[DONE]` Memory prompt `getInboxMemory`/`buildMemoryPrompt` (`ai-memory.ts`): already
  threaded into the existing ask routes; B5 carries it into the agent system prompt.
- `[LOCKED]` Runner Vitest; judge Anthropic via `runGrader`; tool-loop = AI SDK
  `generateText` + `stopWhen: stepCountIs(n)`; no new dependency/provider.

---

## R1 — The bounded multi-step agent (retrieve -> verify -> act)

- **R1.1** `[NEW]` THE SYSTEM SHALL answer a whole-inbox question by running a bounded
  multi-step tool loop (`tracedGenerateText` + `tools` + `stopWhen: stepCountIs(MAX_STEPS)`),
  NOT a single retrieval-then-answer call.
- **R1.2** `[NEW]` THE SYSTEM SHALL expose exactly these tools to the agent, each
  owner+tenant scoped: `search_inbox(query)` (ranked thread candidates),
  `read_thread(key)` (full grounded thread), `summarize_thread(key)` (cited TL;DR).
- **R1.3** `[NEW]` THE SYSTEM SHALL bound the loop at `MAX_STEPS` (default 6) via
  `stopWhen: stepCountIs(MAX_STEPS)`; the loop SHALL NOT be a hand-rolled while-loop.
- **R1.4** `[NEW]` GIVEN the agent has gathered evidence, WHEN it produces a final
  answer, THE SYSTEM SHALL require a VERIFY pass: the answer is emitted only if at
  least one cited thread/message index is present AND in range, otherwise it abstains.
- **R1.5** `[NEW]` THE SYSTEM SHALL be model-injectable: the agent runner accepts an
  injected model/generator so the verify + tool-router + abstention logic is unit-testable
  offline with NO LLM key (mirrors the `ask-inbox.ts:166` / `summarize-thread.ts:84` seams).
- **R1.6** `[NEW]` WHEN no `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` is present at runtime,
  THE SYSTEM SHALL fall back to the existing single-pass `askInbox` path (honest degrade),
  never returning a fabricated answer.
- **R1.7** `[NEW]` IF the loop reaches `MAX_STEPS` without a verified grounded answer,
  THEN THE SYSTEM SHALL return `answered=false` with the not-found message, never a guess.
- **Edge** empty question / question > 500 chars: reuse the existing route guards
  (`route.ts:29-30`); empty -> 400, long -> truncated to 500.
- **Edge** loop step throws (tool error, model error): the agent SHALL fail closed to
  `answered=false`, never surface a partial/hallucinated answer (mirrors `ask-inbox.ts:180`).

## R2 — Grounded + scoped retrieval (the tenancy + citation invariant)

- **R2.1** `[NEW]` THE SYSTEM SHALL build the agent corpus ONLY from
  `scopeConversationRows(loadConversationRows(tenantId), getInboxScope(tenantId, userId))`:
  a member SHALL never retrieve another user's mail (mirrors `route.ts:39-40`).
- **R2.2** `[NEW]` THE SYSTEM SHALL pass the scoped corpus to every tool; no tool SHALL
  re-query the DB outside that scope or accept a thread key not present in it.
- **R2.3** `[NEW]` WHEN a tool is asked to `read_thread(key)`/`summarize_thread(key)`
  for a key absent from the scoped corpus, THE SYSTEM SHALL return a "not in your inbox"
  tool result (404-equivalent), never load the thread (mirrors `conversations/ask/route.ts:44`).
- **R2.4** `[NEW]` THE SYSTEM SHALL ground every claim in a retrieved thread/message and
  emit citations as thread/message indices; every emitted citation SHALL be validated
  in-range before it is returned (guards `ask-inbox.ts:176` / `summarize-thread.ts:92`
  clamps against regression).
- **R2.5** `[NEW]` THE SYSTEM SHALL resolve final answer citations to linkable refs
  `{ key, subject }` for the UI deep-link `/inbox?conversation=<key>` (mirrors `route.ts:53-56`).
- **R2.6** `[NEW]` THE SYSTEM SHALL NOT invent thread keys, message indices, names, dates,
  or commitments; an out-of-range or non-existent citation SHALL be dropped, and if dropping
  it leaves zero citations the answer SHALL become `answered=false`.

## R3 — Abstention (the cardinal bar: `abstention_correctness == 1.0`)

- **R3.1** `[NEW]` WHERE the scoped inbox does not contain the answer, THE SYSTEM SHALL
  return `answered=false` with an honest not-found message; it SHALL NOT hallucinate.
- **R3.2** `[NEW]` WHEN `search_inbox` returns zero candidate threads, THE SYSTEM SHALL
  abstain (`answered=false`) without calling the answer step (mirrors the `askInbox` empty
  short-circuit `ask-inbox.ts:170`).
- **R3.3** `[NEW]` THE SYSTEM SHALL treat `answered=false` as a first-class success outcome
  (not an error, not pass-by-default); the eval grades it as correct on negative fixtures.
- **R3.4** `[NEW]` On the `inbox-ask.golden.jsonl` negative fixtures (>= 4),
  `abstention_correctness` SHALL == 1.0: the agent abstains on EVERY case whose answer is
  not in the corpus. This is the cardinal gate; a single hallucinated answer fails the suite.
- **R3.5** `[NEW]` THE SYSTEM SHALL NOT lower its abstention rate by widening retrieval
  past the scoped corpus (e.g. inventing a thread); abstention beats fabrication.

## R4 — Tool use (AI SDK tools, scoped, unit-testable router)

- **R4.1** `[NEW]` THE SYSTEM SHALL define each agent step as an AI SDK tool
  (`makeTool`/`tool()` with `inputSchema` + `execute`), reusing the repo pattern
  (`chat/tools/knowledge.ts:23`); the model selects tools, no hand-rolled dispatch.
- **R4.2** `[NEW]` Each tool `execute` SHALL be a pure function of (scoped corpus, input)
  + an existing reused helper (`search_inbox`->`selectRelevantThreads`,
  `read_thread`->`askThread`/raw messages, `summarize_thread`->`summarizeThread`), so each is
  unit-testable with a fixture corpus and NO LLM.
- **R4.3** `[NEW]` THE SYSTEM SHALL cap `search_inbox` results at a configurable `limit`
  (default 6, hard cap 12) and `read_thread`/`summarize_thread` body slices at the existing
  caps, so the loop context stays bounded.
- **R4.4** `[NEW]` THE SYSTEM SHALL expose a pure tool-router/verifier function
  (`runInboxAgent(corpus, question, { model, maxSteps })`) whose abstention, citation-in-range,
  and step-bounding logic is asserted by unit tests with an injected scripted model.
- **R4.5** `[NEW]` THE SYSTEM SHALL record the agent run via `tracedGenerateText` so step
  count + tool calls land in the trace (`traced-ai.ts:109`) for the observability flywheel.

## R5 — Retrieval-grounded summarization reuse

- **R5.1** `[REUSE]` THE SYSTEM SHALL satisfy the `summarize_thread` tool by calling the
  existing `summarizeThread` (`summarize-thread.ts:82`); no new summarizer.
- **R5.2** `[NEW]` THE SYSTEM SHALL clamp summary citations to in-range message indices via
  the existing clamp (`summarize-thread.ts:92`); the agent SHALL NOT emit a summary citation
  outside the thread message count.
- **R5.3** `[NEW]` WHEN the agent answers a "summarize / status of <thread>" style
  question, THE SYSTEM SHALL prefer `summarize_thread` over `read_thread` for that thread, and
  the answer SHALL carry that thread's cited indices.

## R6 — Never auto-acts (approval-gated proposals, B1 contract)

- **R6.1** `[NEW]` THE SYSTEM SHALL NOT send email, book a meeting, or mutate any record
  as a side effect of answering. The agent is read-only by default.
- **R6.2** `[NEW]` WHERE the agent proposes an action (draft a reply, book a slot), THE
  SYSTEM SHALL return it as a STAGED proposal for human approval, reusing the never-auto-send
  contract (`autonomy.ts:32-35` -> `perform:false` for `action: "send"`); it SHALL NOT execute it.
- **R6.3** `[NEW]` THE SYSTEM SHALL produce the draft body itself via the B1 engine (it does
  NOT re-implement drafting); B5 only proposes-and-routes, B1 owns the prose.
- **R6.4** `[NEW]` THE SYSTEM SHALL NOT expose a tool that performs a write
  (send/book/archive/label) inside the agent loop; only read/search/summarize tools.

## R7 — Gating, rate-limit, fail-closed (every call)

- **R7.1** `[REUSE]` IF `aiEnabled(getAiProfile(userId))` is false, THEN THE SYSTEM SHALL
  return the "AI features are turned off" non-answer (`answered=false`) without invoking the
  agent (mirrors `route.ts:32-36`).
- **R7.2** `[NEW]` THE SYSTEM SHALL rate-limit the agent endpoint per user via
  `rateLimitLLM(userId)` and return `rateLimitResponse` (429) when exceeded: the agent loop
  can spend multiple model calls, so it MUST be limited (the existing single-pass route is not).
- **R7.3** `[REUSE]` IF the request is unauthenticated, THEN THE SYSTEM SHALL return 401
  (mirrors `route.ts:19-20`).
- **R7.4** `[NEW]` THE SYSTEM SHALL enforce the per-tenant LLM budget transitively via
  `tracedGenerateText` (`traced-ai.ts:84` `enforceLlmBudget`); a budget breach surfaces the
  cap reason, never a silent empty answer.

## R8 — The C1 eval gate (the DoD, G-eval)

- **R8.1** `[NEW]` THE SYSTEM SHALL ship an `inbox-ask` eval suite + golden fixture
  `inbox-ask.golden.jsonl` (>= 15 cases, >= 4 negatives) per C1
  (`inbox-quality-evals/design.md:71-73`), gating `retrieval_recall >= 0.90`,
  `abstention_correctness == 1.0`, `grounded_answer_rate >= 0.85`.
- **R8.2** `[NEW]` THE SYSTEM SHALL ship the deterministic FLOOR (retrieval recall,
  abstention on negatives, and citation-in-range) runnable with NO LLM key (mirrors the
  `HAS_LLM` split, `inbox-quality-evals/design.md:75-78`); CI gates on the floor.
- **R8.3** `[NEW]` THE SYSTEM SHALL gate the answer-quality (prose/faithfulness) tier ONLY
  `WHERE ANTHROPIC_API_KEY is set`; its absence is reported as skipped, never a silent pass.
- **R8.4** `[REUSE]` THE SYSTEM SHALL keep the `inbox-summary` suite green
  (`faithfulness`, `citation_accuracy`) since B5 reuses summarization
  (`inbox-quality-evals/design.md:117`).
- **R8.5** `[NEW]` THE SYSTEM SHALL add the new gate test to `pnpm eval:run`
  (`package.json:12`) alongside the existing inbox gates; the gate prints a report card and
  exits non-zero on any breach (mirrors `inbox-reply-worthy-gate.test.ts`).
- **R8.6** `[NEW]` THE SYSTEM SHALL implement `retrievalRecall`, `abstentionCorrectness`,
  `groundedAnswerRate`, and `citationInRange` as pure metric fns in
  `evals/inbox-metrics.ts` (the file that already holds `replyWorthyPR`/`noiseMetrics`),
  each independently unit-tested.

## R9 — UI surface (G-design)

- **R9.1** `[NEW]` THE SYSTEM SHALL render the agent answer with inline citation chips that
  deep-link to `/inbox?conversation=<key>` (reuse `SourceLink` from `@/components/ai-ui`,
  already used in `_thread-ask.tsx:13`).
- **R9.2** `[NEW]` WHEN `answered=false`, THE SYSTEM SHALL render the honest "couldn't find
  that" state (no fabricated answer, no empty silent box).
- **R9.3** `[NEW][G-design]` Any new ask-agent UI SHALL pass the F1 12-item design checklist
  (`_specs/inbox-design-system/design.md` section 8). NOTE: F1 spec dir does not exist yet;
  this is a forward dependency. Until F1 lands, the UI reuses the existing `_thread-ask.tsx`
  components and the checklist acceptance is deferred to F1 sign-off, tracked as `[BLOCKED-ON F1]`.

## Non-goals (explicit)

- **N1** THE SYSTEM SHALL NOT implement the draft engine (B1), writing style/voice (B2),
  splits (B3), or the noise classifier (B4): B5 CONSUMES their persisted signals via
  `buildConversations` (`conversations.ts:120,127,131`).
- **N2** THE SYSTEM SHALL NOT add a new provider, model SDK, or npm dependency: it uses the
  AI SDK tool-loop + Anthropic already in the stack (`[LOCKED]`).
- **N3** THE SYSTEM SHALL NOT add an embedding/vector index; retrieval stays keyword
  (`selectRelevantThreads`), consistent with the honest "no vector index" note (`ask-inbox.ts:1-12`).
- **N4** THE SYSTEM SHALL NOT run an unbounded agent loop; `MAX_STEPS` is hard-capped.
- **N5** THE SYSTEM SHALL NOT auto-send, auto-book, or mutate records (R6).
- **N6** THE SYSTEM SHALL NOT require a DB migration (no new table/column).
