# FINDING-005 -- LLM Judge Graders Are Stubs (Hardcoded 0.5)

## Audit pillar
4.7 Evaluations + Golden traces

## Problem statement
The eval framework in `apps/web/src/lib/evals/agent-evals.ts` defines 13
grader types including `llm_judge` and `faithfulness`. However, the
`runGrader()` function (lines 161-164) returns a hardcoded score of 0.5 for
both:

```typescript
case "llm_judge":
case "faithfulness":
  // These are handled separately via async LLM calls
  return { type, passed: true, score: 0.5, weight, detail: "Requires async LLM grading" };
```

This means every eval case that includes an `llm_judge` or `faithfulness`
grader (which is most of them -- chat, deal-coaching, email generation, etc.)
receives a meaningless 0.5 score for its semantic quality dimension.

Additionally:
- **Outcome graders** (lines 895-976): `runOutcomeGrader()` is defined but
  never called from `runGrader()` or `eval-runner.ts`.
- **Dimension judges** (lines 1069-1152): `runDimensionJudges()` is defined
  with full implementation but never called from the eval pipeline.
- **`eval-runner.ts`** has its own `gradeWithLLM()` (line 238) that IS
  implemented and calls the Anthropic/OpenAI API, but this is not connected
  to the per-grader `llm_judge` type in `agent-evals.ts`.

The result: the eval framework gives false confidence. Composite scores are
inflated by the 0.5 stub, and semantic quality is never actually measured
at the per-grader level.

## Acceptance criteria (EARS notation)

### AC-1: llm_judge grader produces real LLM scores
WHEN `runGrader()` is called with `type: "llm_judge"`,
the grader SHALL invoke an LLM (Claude or GPT-4o-mini) with the eval case
input, expected output, actual output, and the agent's `llmJudgePrompt`,
and SHALL return the LLM's numeric score (0.0-1.0) extracted from the
response.

### AC-2: faithfulness grader measures groundedness
WHEN `runGrader()` is called with `type: "faithfulness"`,
the grader SHALL invoke an LLM with the agent output and the provided
context, and SHALL return a score reflecting how grounded the output is in
the context (0.0 = hallucinated, 1.0 = fully grounded).

### AC-3: Dimension judges are wired into the pipeline
WHEN an eval run executes for an agent type that has dimension judges
defined in `JUDGE_DIMENSIONS`,
the eval pipeline SHALL call `runDimensionJudges()` and include the
per-dimension scores in the eval result metadata.

### AC-4: Outcome graders are callable from the pipeline
WHEN an eval case includes an outcome-type grader,
the `runGrader()` switch statement SHALL dispatch to `runOutcomeGrader()`
instead of falling through to the default "unknown grader" branch.

### AC-5: Dead code audit
IF `runOutcomeGrader` or `runDimensionJudges` remain unused after wiring,
the dead code SHALL be removed. No exported function in `agent-evals.ts`
SHALL be uncalled from the eval pipeline.

### AC-6: Score integrity
WHEN all graders are functional,
the composite score for an eval case SHALL NOT contain any hardcoded 0.5
values from stub graders, and the `detail` field SHALL contain actual
grading reasoning, not "Requires async LLM grading".

## Edge cases
- LLM API is unavailable during eval: grader must return score 0.0 with
  `detail: "LLM grading failed: <error>"`, not silently pass with 0.5.
- Agent's `llmJudgePrompt` is undefined: fall back to a generic quality
  rubric.
- Eval case has no `expectedOutput`: faithfulness grader must use `context`
  field; llm_judge must grade on general quality only.
- Cost control: LLM judge calls add cost per eval run. Must use the cheapest
  viable model (gpt-4o-mini or claude-haiku) and cap prompt length.

## Out of scope
- Adding new eval cases or golden datasets.
- Changing the eval UI in the admin dashboard.
- Multi-trial (pass@k) integration (already implemented, separate concern).
