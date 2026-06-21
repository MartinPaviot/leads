# B5 — inbox-ask-agent — Tasks

**Total estimate: ~7.5 dev-days (15 half-days)** · 13 tasks.
Each task: action · verify step · test to write · requirement refs.
Order is executable: pure helpers + offline floor first, then the loop, then the
route + UI, then the gate. Branch `feat/inbox-ask-agent`. No DB migration.

Tags: `[NEW]` code · `[REUSE]` wire existing · `[TEST]` test-only · `[CFG]` config ·
`[BLOCKED-ON F1]` design-checklist sign-off deferred to F1.

---

## Phase 1 — Pure offline core (no LLM, the deterministic floor)

### B5.1 `[NEW]` Verifier `ask-agent-verify.ts` — 1 half-day
- **Action:** add `verifyAnswer(raw, evidence)` (design section 4): drop citations whose key is
  not in `evidence.keysSeen`, drop `messageIdx` out of `[0, threadMsgCount[key])`, collapse to
  `answered=false` when zero valid citations survive, fail-closed on throw.
- **Verify:** `pnpm tsc` clean; `pnpm test ask-agent-verify` green.
- **Test:** `lib/inbox/__tests__/ask-agent-verify.test.ts` — (a) fabricated key dropped,
  (b) out-of-range messageIdx dropped (the clamp), (c) all-citations-dropped -> answered=false,
  (d) valid citation survives + answered=true, (e) throw -> NOT_FOUND/answered=false.
- **Refs:** R1.4, R2.4, R2.6, R5.2.

### B5.2 `[NEW]` Tools `ask-agent-tools.ts` — 1.5 half-days
- **Action:** `buildAskAgentTools(corpus)` returning three `makeTool()`s (design section 3):
  `search_inbox` (-> `selectRelevantThreads`, limit cap 12), `read_thread` (corpus lookup,
  sliced messages, "not in your inbox" on miss), `summarize_thread` (-> `summarizeThread`).
  Every `execute` is pure over the in-memory corpus; NO DB import.
- **Verify:** grep the file shows no `@/db` import; `pnpm test ask-agent-tools` green.
- **Test:** `lib/inbox/__tests__/ask-agent-tools.test.ts` — (a) search returns indexed candidates,
  empty query/no-hit -> `[]`; (b) read_thread on a key NOT in corpus -> error (R2.3 tenancy);
  (c) read_thread slices long bodies; (d) summarize_thread clamps citations in-range;
  (e) limit hard-capped at 12.
- **Refs:** R1.2, R2.2, R2.3, R4.1, R4.2, R4.3, R5.1, R6.4.

### B5.3 `[NEW]` Metrics in `inbox-metrics.ts` — 1 half-day
- **Action:** add pure `retrievalRecall(cases)`, `abstentionCorrectness(cases)`,
  `groundedAnswerRate(cases)`, `citationInRange(citations, corpus)` (design section 8), matching
  the vacuous-1/support style of `replyWorthyPR`/`noiseMetrics` already in the file.
- **Verify:** `pnpm test inbox-metrics` green; functions exported.
- **Test:** extend `lib/evals/__tests__/inbox-metrics.test.ts` (or new) — perfect agreement scores
  1; a missed gold key drops recall; one hallucinated negative makes abstention != 1.0; an
  out-of-range citation fails `citationInRange`; empty denominators score vacuous-1 with support.
- **Refs:** R8.6, R8.2.

---

## Phase 2 — The agent loop (model-injectable)

### B5.4 `[NEW]` `runInboxAgent(corpus, question, opts)` loop — 2 half-days
- **Action:** add `ask-agent.ts` (design section 2): `tracedGenerateText` + `buildAskAgentTools` +
  `stopWhen: stepCountIs(opts.maxSteps ?? 6)`; collect evidence (keysSeen + threadMsgCount) from
  the tool results across `steps`; parse the final structured answer; run `verifyAnswer`; resolve
  citations to `{ key, subject }`. Model is INJECTABLE (default `anthropic("claude-haiku-4-5")`,
  matching `ask-inbox.ts:144`); lazy-import the AI SDK like `ask-inbox.ts:139`.
- **Verify:** unit run with a scripted injected model exercises retrieve->verify->act and the
  step cap, with NO real key; `pnpm tsc` clean.
- **Test:** `lib/inbox/__tests__/ask-agent.test.ts` (injected scripted generator) —
  (a) happy path: search->read->answer with valid citation -> answered=true, refs resolved;
  (b) negative: search returns nothing -> answered=false (R3.2), no answer step;
  (c) model cites a thread it never read -> citation dropped -> answered=false (R2.6);
  (d) loop hits maxSteps with no verified answer -> answered=false (R1.7);
  (e) a tool throws -> fail-closed answered=false (R1 edge);
  (f) summarize-style question prefers `summarize_thread` (R5.3).
- **Refs:** R1.1, R1.2, R1.3, R1.4, R1.5, R1.7, R3.1, R3.2, R4.4, R4.5, R5.3.

### B5.5 `[NEW]` Action-proposal staging (read-only contract) — 1 half-day
- **Action:** when the final answer carries a proposed action (draft/book), wrap it as a STAGED
  `proposal` and route through `resolveAutonomy(autonomy, "send")` (`autonomy.ts:33`) so
  `perform` is always false; the draft BODY is requested from the B1 engine, not re-implemented.
- **Verify:** unit shows `proposal.perform === false` and no send/book/mutate is called.
- **Test:** `ask-agent.test.ts` adds — a proposal is staged (`perform:false`), never executed;
  the loop exposes NO write tool (assert tool names are a subset of the three read tools).
- **Refs:** R6.1, R6.2, R6.3, R6.4.

---

## Phase 3 — Route wiring (gate + rate-limit + honest degrade)

### B5.6 `[REUSE]` Route upgrade `ask-inbox/route.ts` — 1 half-day
- **Action:** keep the existing shell (auth `:19`, `aiEnabled` gate `:32`, scope+corpus `:39-47`).
  Add `rateLimitLLM(userId)` -> `rateLimitResponse` on breach (R7.2). When a model key is present,
  call `runInboxAgent(corpus, question)`; else fall back to the existing single-pass `askInbox`
  path (R1.6). Return `{ result: { answer, answered, citations, proposal? } }` (same shape).
- **Verify:** `pnpm tsc` clean; manual: POST a question, get cited answer; POST a not-in-inbox
  question, get `answered:false`; over-limit POST -> 429.
- **Test:** `app/api/inbox/ask-inbox/__tests__/route.test.ts` — 401 unauth; `aiEnabled=false` ->
  off non-answer (R7.1); over-limit -> 429 (R7.2); no-key env -> single-pass fallback returns a
  result (R1.6); a member never sees another user's thread (scope assertion, R2.1).
- **Refs:** R1.6, R2.1, R2.5, R7.1, R7.2, R7.3, R7.4.

### B5.7 `[TEST]` Tenancy regression on the agent corpus — 0.5 half-day
- **Action:** add a focused test that the agent corpus is exactly
  `scopeConversationRows(...)` output and that `read_thread`/`summarize_thread` reject any key
  outside it (the structural tenancy guarantee).
- **Verify:** test green; mutating scope to empty yields zero retrievable threads.
- **Test:** `lib/inbox/__tests__/ask-agent-scope.test.ts` — two users, user B's thread key is
  rejected by user A's tool corpus; empty scope -> search returns `[]` -> answered=false.
- **Refs:** R2.1, R2.2, R2.3, R3.2.

---

## Phase 4 — The C1 eval gate (the DoD)

### B5.8 `[NEW]` Golden fixture `inbox-ask.golden.jsonl` — 1.5 half-days
- **Action:** author >= 15 hand-labeled cases (>= 4 negatives) in the design-section-8 shape:
  each has a small `corpus`, a `question`, and `expected { answered, relevantKeys, requiredFacts }`.
  Cover: single-thread answer, multi-thread synthesis, summarize-style, and 4+ "answer absent"
  negatives (the abstention cardinal cases). Ids unique, taxonomy valid.
- **Verify:** a fixture-integrity test (mirrors `inbox-reply-worthy-gate.test.ts:44-75`) passes:
  >= 15 cases, >= 4 negatives, unique ids, well-formed lines.
- **Test:** integrity block inside the gate test (below).
- **Refs:** R8.1, R3.4.

### B5.9 `[NEW]` Eval suite `suites/inbox-ask.eval.ts` — 1 half-day
- **Action:** export an `EvalSuite` (deterministic generator over the fixture corpus, reusing the
  injected-model seam from B5.4) + `aggregateMetrics` returning `retrieval_recall`,
  `abstention_correctness`, `grounded_answer_rate` (+ citation-in-range), conforming to the C1
  harness (`runEvalSuite`).
- **Verify:** `runEvalSuite(inboxAskEvalSuite)` returns the three metrics; deterministic run is
  reproducible.
- **Test:** covered by the gate test (B5.10).
- **Refs:** R8.1, R8.6.

### B5.10 `[NEW]` Gate test + `eval:run` wiring — 1 half-day
- **Action:** add `__tests__/inbox-ask-agent-gate.test.ts` (mirrors `inbox-reply-worthy-gate.test.ts`):
  fixture integrity + DETERMINISTIC FLOOR assertions (`retrieval_recall >= 0.90`,
  `abstention_correctness == 1.0`, every citation in-range) running with NO key; an
  `if (HAS_LLM)` block for `grounded_answer_rate >= 0.85`. Print a report card. Add the file to
  `package.json:12` `eval:run`.
- **Verify:** `pnpm eval:run` green locally with NO key (floor only); the gate exits non-zero if
  any floor bar is breached (prove by temporarily injecting a hallucinating fixture, then revert).
- **Test:** this IS the gate test; assert each bar + a printed report card.
- **Refs:** R8.1, R8.2, R8.3, R8.5, R3.3, R3.4.

### B5.11 `[REUSE]` Keep `inbox-summary` green — 0.5 half-day
- **Action:** re-run the existing `inbox-summary` suite (B5 reuses `summarizeThread`) and confirm
  `faithfulness` / `citation_accuracy` bars still pass; if the summarize prompt is touched, re-run.
- **Verify:** `inbox-summary` bars green in `eval:run`.
- **Test:** existing `inbox-summary` suite (no new test; assert it is in `eval:run`).
- **Refs:** R8.4, R5.1.

---

## Phase 5 — UI surface (G-design)

### B5.12 `[NEW]` Whole-inbox ask panel `_inbox-ask.tsx` — 1 half-day
- **Action:** add the whole-inbox ask panel reusing `SourceLink` (`@/components/ai-ui`, as in
  `_thread-ask.tsx:13`): question box, cited answer with chips deep-linking
  `/inbox?conversation=<key>`, explicit `answered=false` "couldn't find that" state, and a staged
  action-proposal affordance (approve/dismiss; never auto-acts).
- **Verify:** local app: ask a question, see cited answer + working deep-links; ask a not-in-inbox
  question, see the honest empty state; a proposal renders as approve/dismiss, not auto-sent.
- **Test:** `__tests__/inbox-ask-panel.test.tsx` (Testing Library) — renders citations as links;
  `answered=false` renders the honest state, not a blank box; proposal needs explicit approval.
- **Refs:** R9.1, R9.2, R6.2.

### B5.13 `[BLOCKED-ON F1]` G-design checklist sign-off — 0.5 half-day
- **Action:** run the new ask UI against the F1 12-item design checklist
  (`_specs/inbox-design-system/design.md` section 8) once F1 ships; until then reuse the existing
  `_thread-ask.tsx` tokens/components so the panel is on-design by inheritance.
- **Verify:** `/design-review` of the ask panel vs F1 tokens (deferred to F1 sign-off).
- **Test:** design-review checklist (manual, F1-gated).
- **Refs:** R9.3.

---

## Definition of Done (B5)

1. `pnpm eval:run` GREEN: `inbox-ask` floor (`retrieval_recall >= 0.90`,
   `abstention_correctness == 1.0`, citation-in-range) + `inbox-summary` bars (R8).
2. The agent is a bounded AI-SDK tool loop (`stopWhen: stepCountIs`), model-injectable, with the
   verify step; no hand-rolled loop, no unbounded loop (R1, R4).
3. Every retrieval owner+tenant scoped; tools never hit the DB; citations in-range (R2).
4. Abstains rather than hallucinates on every negative fixture (R3).
5. Read-only: no write tool; action proposals staged via `resolveAutonomy` (R6).
6. Gated (`aiEnabled`) + rate-limited (`rateLimitLLM`) + budget-enforced on every call (R7).
7. No new dependency, no new provider, no DB migration (N2, N3, N6).
