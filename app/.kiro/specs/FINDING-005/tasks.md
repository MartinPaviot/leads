# FINDING-005 -- Tasks: LLM Judge Grader Implementation

All tasks are eval-first: write the test/assertion before the implementation.

---

## Task 1: Implement async `gradeLLMJudge` function
**Estimate:** 1.5h
**Eval:** Unit test `llm-judge.test.ts` -- asserts that:
- `gradeLLMJudge` with a mock LLM returning "SCORE: 0.85" produces `{ score: 0.85, passed: true }`
- `gradeLLMJudge` with a mock LLM returning garbage produces `{ score: 0.0, passed: false }`
- `gradeLLMJudge` with API failure produces `{ score: 0.0, detail: "LLM judge error: ..." }`
- `gradeLLMJudge` uses the agent's `llmJudgePrompt` when provided
- `gradeLLMJudge` falls back to generic rubric when no prompt provided
- Output is truncated to 2000 chars before sending to LLM

**Implementation:**
1. Create `apps/web/src/lib/evals/llm-judge.ts`
2. Export `gradeLLMJudge(input, expectedOutput, actualOutput, judgePrompt, judgeModel): Promise<GraderResult>`
3. Build prompt from `judgePrompt` or generic rubric template
4. Call LLM via `generateText` from `ai` SDK with the appropriate model
5. Parse `SCORE: X.XX` from response, clamp to [0.0, 1.0]
6. Return GraderResult with `type: "llm_judge"`, extracted score, and reasoning
7. On any error: return `{ passed: false, score: 0.0, detail: error message }`
8. Write test at `apps/web/src/__tests__/llm-judge.test.ts` with mocked AI SDK

**Verify:** `pnpm vitest run llm-judge`

---

## Task 2: Implement async `gradeFaithfulness` function
**Estimate:** 1h
**Eval:** Unit test `faithfulness-grader.test.ts` -- asserts that:
- With mock LLM returning "SCORE: 0.90", produces grounded score
- With empty context, returns `{ score: 0.0, detail: "No context provided..." }`
- With API failure, returns `{ score: 0.0, passed: false }`
- Prompt includes both context and output in structured tags

**Implementation:**
1. Add `gradeFaithfulness(output, context, judgeModel): Promise<GraderResult>` to `llm-judge.ts`
2. Build faithfulness-specific prompt with `<context>` and `<output>` tags
3. If context is empty/undefined, return immediate 0.0 (cannot measure faithfulness without context)
4. Parse score, return GraderResult with `type: "faithfulness"`
5. Write test at `apps/web/src/__tests__/faithfulness-grader.test.ts`

**Verify:** `pnpm vitest run faithfulness-grader`

---

## Task 3: Make `runGrader` async and wire LLM graders
**Estimate:** 1.5h
**Eval:** Unit test `run-grader-async.test.ts` -- asserts that:
- `runGrader` with `type: "llm_judge"` calls `gradeLLMJudge` and returns its result (not 0.5)
- `runGrader` with `type: "faithfulness"` calls `gradeFaithfulness` and returns its result
- `runGrader` with `type: "pattern_match"` still works synchronously (wrapped in Promise)
- `runGrader` with `type: "outcome_contains_data"` dispatches to `runOutcomeGrader`
- `runGrader` with `type: "outcome_answers_question"` dispatches to `runOutcomeGrader`
- No grader type returns hardcoded 0.5

**Implementation:**
1. In `apps/web/src/lib/evals/agent-evals.ts`, change `runGrader` signature to `async function runGrader(...): Promise<GraderResult>`
2. Add required parameters: `input`, `expectedOutput`, `judgePrompt`, `judgeModel` (passed from the eval case/config)
3. Replace the `llm_judge`/`faithfulness` stub case with actual calls to `gradeLLMJudge` and `gradeFaithfulness`
4. Add outcome grader dispatch: recognize `outcome_*` types and call `runOutcomeGrader`
5. Update `computeCompositeScore` call sites to await all grader results first
6. Ensure existing deterministic graders (pattern_match, tool_used, etc.) still return synchronously wrapped in a resolved promise

**Verify:** `pnpm vitest run run-grader-async`

---

## Task 4: Wire dimension judges into eval-runner pipeline
**Estimate:** 1.5h
**Eval:** Integration test `eval-runner-dimensions.test.ts` -- asserts that:
- When running an eval for agent type "chat" (which has conversational dimensions), dimension judge results appear in the eval result metadata
- When running an eval for an agent type with no dimensions defined, no dimension judge is called
- Dimension scores are stored alongside the main composite score
- If dimension judge fails, the main eval still completes with a warning

**Implementation:**
1. In `apps/web/src/lib/eval-runner.ts`, after the main grading loop for each case:
   - Look up `JUDGE_DIMENSIONS` for the agent's category (conversational, generation, extraction, classification)
   - If dimensions exist, call `runDimensionJudges(input, output, context, dimensions, judgeModel)`
   - Store dimension results in `evalResults.metadata.dimensionScores`
2. Add agent-to-category mapping (derive from agent config or add field to `AgentEvalConfig`)
3. Wrap dimension judge call in try/catch so it never blocks the main eval
4. Write test at `apps/web/src/__tests__/eval-runner-dimensions.test.ts`

**Verify:** `pnpm vitest run eval-runner-dimensions`

---

## Task 5: Update eval-runner to use per-case graders
**Estimate:** 2h
**Eval:** Integration test `eval-runner-graders.test.ts` -- asserts that:
- Eval runner calls `runGrader` for each grader defined on the eval case
- Composite score is computed from actual grader results, not just the single `gradeWithLLM` call
- Cases with `llm_judge` graders get real LLM scores (mocked)
- Cases with `faithfulness` graders get groundedness scores (mocked)
- Cases with mixed grader types (deterministic + LLM) produce correct weighted composite
- Backward compatible: cases with no per-case graders fall back to single `gradeWithLLM`

**Implementation:**
1. In `eval-runner.ts` `runEval()`, after getting agent output for each case:
   - If `evalCase.graders` is defined and non-empty (from agent-evals config), run each grader via `runGrader`
   - Compute composite score via `computeCompositeScore`
   - Use composite as the case score instead of the single `gradeWithLLM` result
2. If no per-case graders defined, fall back to existing `gradeWithLLM` behavior
3. Store per-grader results in `evalResults.metadata.graderResults`
4. Resolve the disconnect: `eval-runner.ts` should import from `agent-evals.ts` to get the case grader configs
5. Write test at `apps/web/src/__tests__/eval-runner-graders.test.ts`

**Verify:** `pnpm vitest run eval-runner-graders`

---

## Task 6: Dead code cleanup and score integrity verification
**Estimate:** 1h
**Eval:** Static analysis test `eval-dead-code.test.ts` -- asserts that:
- Every exported function in `agent-evals.ts` is imported somewhere in the codebase
- No grader case in `runGrader` returns a hardcoded 0.5
- No `detail` field contains "Requires async LLM grading"
- `runOutcomeGrader` is called from `runGrader` (not standalone only)
- `runDimensionJudges` is called from `eval-runner.ts`

**Implementation:**
1. Grep for any remaining hardcoded 0.5 scores in agent-evals.ts grader cases
2. Remove the old stub comment "These are handled separately via async LLM calls"
3. Verify `runOutcomeGrader` is reachable from `runGrader` via the outcome_* dispatch
4. Verify `runDimensionJudges` is called from `eval-runner.ts`
5. If any exported function is truly dead (unreachable from any call path), remove it
6. Update JSDoc comments to reflect the new async behavior
7. Write verification test at `apps/web/src/__tests__/eval-dead-code.test.ts`

**Verify:** `pnpm vitest run eval-dead-code`

---

## Task 7: End-to-end eval pipeline smoke test
**Estimate:** 1h
**Eval:** Integration test `eval-e2e-smoke.test.ts` -- asserts that:
- A minimal eval run with 2 cases (one with llm_judge, one with pattern_match + faithfulness) completes without error
- llm_judge case score is NOT 0.5 (comes from mocked LLM)
- faithfulness case score is NOT 0.5
- Composite scores are mathematically correct given grader weights
- Dimension scores appear in metadata for conversational agent type
- Regression detection still works (compare to a mocked previous run)

**Implementation:**
1. Write comprehensive smoke test at `apps/web/src/__tests__/eval-e2e-smoke.test.ts`
2. Mock database, LLM API, and agent output
3. Create 2 test eval cases with known grader configs from AGENT_EVAL_CONFIGS
4. Run through the full pipeline: `runEval` -> graders -> composite -> dimension judges -> summary
5. Assert all scores, no stubs, correct metadata structure
6. Assert regression detection logic still triggers correctly

**Verify:** `pnpm vitest run eval-e2e-smoke`
