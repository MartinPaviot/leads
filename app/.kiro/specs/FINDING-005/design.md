# FINDING-005 -- Design: LLM Judge Grader Implementation

## System context

The eval framework has two layers:
1. **`agent-evals.ts`** -- defines grader types, per-agent eval configs, and
   the `runGrader()` function that scores individual graders.
2. **`eval-runner.ts`** -- orchestrates full eval runs: iterates cases, calls
   the agent, grades output via `gradeWithLLM()`, stores results.

The problem is that these two layers are disconnected for LLM-based grading.
`eval-runner.ts` has a working `gradeWithLLM()` but `agent-evals.ts` stubs
out its own `llm_judge`/`faithfulness` graders.

## Architecture: before and after

```mermaid
graph LR
    subgraph "BEFORE (broken)"
        RC1[runGrader<br/>llm_judge] -->|hardcoded 0.5| CS1[compositeScore]
        RC2[runGrader<br/>faithfulness] -->|hardcoded 0.5| CS1
        OG[runOutcomeGrader] -.->|never called| DEAD1[dead code]
        DJ[runDimensionJudges] -.->|never called| DEAD2[dead code]
        ER[eval-runner<br/>gradeWithLLM] -->|works but separate| DB[(evalResults)]
    end
```

```mermaid
graph LR
    subgraph "AFTER (wired)"
        RC1[runGrader<br/>llm_judge] -->|async LLM call| LLM[Claude/GPT-4o-mini]
        RC2[runGrader<br/>faithfulness] -->|async LLM call| LLM
        RC3[runGrader<br/>outcome_*] --> OG[runOutcomeGrader]
        LLM --> CS[compositeScore]
        OG --> CS
        DJ[runDimensionJudges] --> META[result metadata]
        CS --> DB[(evalResults)]
        META --> DB
    end
```

## Key design decision: make `runGrader` async

Currently `runGrader()` is synchronous. LLM calls are inherently async.
Two options:

| Option | Pros | Cons |
|--------|------|------|
| A. Make `runGrader` async | Clean, single code path | Breaking change to all callers |
| B. Post-process LLM graders separately | No signature change | Two grading passes, complex |

**Decision: Option A.** `runGrader` becomes `async`. The function is only
called from `computeCompositeScore` which is only called from within the eval
pipeline -- a controlled surface area. The eval pipeline is already async.

## Component design

```mermaid
classDiagram
    class RunGrader {
        +runGrader(grader, output, context, ...): Promise~GraderResult~
    }

    class LLMJudge {
        +gradeLLMJudge(input, expected, actual, prompt): Promise~GraderResult~
        +gradeFaithfulness(output, context): Promise~GraderResult~
    }

    class OutcomeGrader {
        +runOutcomeGrader(grader, output, context, env): GraderResult
    }

    class DimensionJudges {
        +runDimensionJudges(input, output, context, dims, model): Promise~DimensionResult~
    }

    class EvalRunner {
        +runEval(runId, datasetId, tenantId): Promise~EvalSummary~
        -runCaseGraders(case, output): Promise~GraderResult[]~
    }

    RunGrader --> LLMJudge : llm_judge / faithfulness
    RunGrader --> OutcomeGrader : outcome_*
    EvalRunner --> RunGrader
    EvalRunner --> DimensionJudges
```

## Data flow for a single eval case

```mermaid
sequenceDiagram
    participant ER as EvalRunner
    participant AG as Agent (chat API)
    participant RG as runGrader
    participant LLM as LLM Judge
    participant DJ as DimensionJudges
    participant DB as Database

    ER->>AG: getAgentOutput(input, context)
    AG-->>ER: output, toolCalls, latencyMs

    loop For each grader in case.graders
        ER->>RG: runGrader(grader, output, ...)
        alt type = llm_judge
            RG->>LLM: gradeLLMJudge(input, expected, output, prompt)
            LLM-->>RG: {score, reasoning}
        else type = faithfulness
            RG->>LLM: gradeFaithfulness(output, context)
            LLM-->>RG: {score, reasoning}
        else type = outcome_*
            RG->>RG: runOutcomeGrader(...)
        else deterministic
            RG->>RG: regex/schema/tool check
        end
        RG-->>ER: GraderResult
    end

    ER->>ER: computeCompositeScore(results)

    opt Agent type has JUDGE_DIMENSIONS
        ER->>DJ: runDimensionJudges(input, output, context, dims)
        DJ-->>ER: per-dimension scores
    end

    ER->>DB: INSERT evalResults (score, graderResults, dimensionScores)
```

## LLM judge implementation detail

### `gradeLLMJudge`

```typescript
async function gradeLLMJudge(
  input: string,
  expectedOutput: string,
  actualOutput: string,
  judgePrompt: string | undefined,
  judgeModel: string,
): Promise<GraderResult>
```

- Uses the agent config's `llmJudgePrompt` if provided; otherwise a generic
  rubric.
- Truncates `actualOutput` to 2000 chars to control cost.
- Extracts score via `SCORE: X.XX` pattern (same as existing `gradeWithLLM`).
- On API failure: returns `{ passed: false, score: 0.0, detail: "LLM judge
  error: ..." }`.

### `gradeFaithfulness`

Dedicated prompt measuring groundedness:

```
You are a faithfulness evaluator. Given the CONTEXT and the AGENT OUTPUT,
score how grounded the output is in the provided context.

0.0 = completely hallucinated, no basis in context
0.5 = partially grounded, some claims unsupported
1.0 = fully grounded, every claim traceable to context

<context>...</context>
<output>...</output>

SCORE: X.XX
```

### Model selection for judges

- Primary: `gpt-4o-mini` (cheap, fast, good for grading)
- Fallback: `claude-haiku-4-5-20251001` via EU Anthropic client
- Never use the same model that generated the output (cross-model principle)

## Cost impact

| Grader type    | Calls per case | ~tokens/call | ~cost/call  |
|----------------|----------------|--------------|-------------|
| llm_judge      | 1              | ~800         | $0.0002     |
| faithfulness   | 1              | ~600         | $0.00015    |
| dimension (5x) | 5              | ~500 each    | $0.00075    |

For a 50-case eval run with all graders active: ~$0.05 total.

## Failure handling

- LLM API timeout: 10s per grader call, return score 0.0 on timeout.
- LLM returns unparseable response: score 0.0, detail includes raw response
  snippet.
- All LLM graders fail: composite score computed from deterministic graders
  only, with a warning flag in the eval result.
- Rate limiting: eval runner already processes cases sequentially; no
  parallel LLM calls needed per case.

## Backward compatibility

- `runGrader` signature changes from sync to async. All callers must be
  updated.
- `computeCompositeScore` remains sync (operates on resolved GraderResults).
- Existing eval results in the database are unaffected (they store the final
  score, not intermediate grader results).
- Eval results will now have meaningful llm_judge scores where they
  previously had 0.5 -- this may cause some evals to "fail" that previously
  "passed" due to inflated scores. This is correct behavior.
