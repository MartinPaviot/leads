# C1 — inbox-quality-evals — Design

## Architecture diff vs existing

What is already there (REUSE, do not rebuild):

- `runEvalSuite` + `EvalSuite`/`EvalCase`/`aggregateMetrics` harness, with
  `eval_runs`/`eval_case_runs` persistence (`src/lib/evals/harness.ts:112`).
- `runGrader` graders + `computeCompositeScore` + `computeClassificationMetrics`
  (`src/lib/evals/agent-evals.ts:68,337,1015`), `computeMultiTrialMetrics`
  (`:1163`), `classifyEvalCase` / `EVAL_SUITE_DEFAULTS` (`:1351,1333`).
- The 5 inbox intelligences, each with an injectable generator seam:
  `classifyGeneralIntent`, `scoreImportance`, `composeReply`, `rewrite`,
  `summarizeThread`, `selectRelevantThreads`/`askInbox`.
- The gate pattern: a Vitest test that aggregates per-case scores and
  `expect(passRate).toBeGreaterThanOrEqual(threshold)`
  (`src/__tests__/golden-eval-gate.test.ts:294`), already wired into
  `pnpm eval:run` (`package.json:12`).

What is ADDED (all `[NEW]`):

1. 5 golden datasets (JSONL) under `app/apps/web/src/lib/evals/fixtures/inbox/`:
   `inbox-triage.golden.jsonl`, `inbox-draft.golden.jsonl`,
   `inbox-reply-worthy.golden.jsonl`, `inbox-refine.golden.jsonl`,
   `inbox-summary.golden.jsonl`, `inbox-ask.golden.jsonl`.
2. 5 eval suites under `src/lib/evals/suites/`:
   `inbox-triage.eval.ts`, `inbox-draft.eval.ts`, `inbox-refine.eval.ts`,
   `inbox-summary.eval.ts`, `inbox-ask.eval.ts` — each exports an `EvalSuite`
   (offline, deterministic generator) + an `aggregateMetrics` returning the
   gate metrics named in requirements.
3. 1 grader helper `src/lib/evals/inbox-metrics.ts`: pure functions the suites
   import — `editDistance` (normalized Levenshtein), `falseDemoteRate`,
   `citationAccuracy`, `replyWorthyPR`, `instructionAdherence`,
   `factPreservation`. No LLM; fully unit-tested.
4. 1 gate test `src/__tests__/inbox-eval-gate.test.ts`: imports all 5 suites,
   runs them via `runEvalSuite` against the injected oracle generator, asserts
   each gate metric vs its threshold, prints a report card, fails non-zero on
   any breach. This is the file added to `pnpm eval:run`.
5. `package.json:12` `eval:run` extended to include
   `src/__tests__/inbox-eval-gate.test.ts`.

What is NOT added here: the reply-worthiness classifier, the noise demotion
mutation, the draft/voice prompt changes — those are B1/B4 deliverables that
this spec gates.

## Data model diff

None. No Drizzle `CREATE`/`ALTER`. The suites persist to the existing
`eval_runs`/`eval_case_runs` via `runEvalSuite`; the new fixtures + suites live
in source, not the DB. (`llmEvalRuns`/`llmEvalCaseRuns` already imported by
`harness.ts:23`.)

## Metric + threshold table (the bars)

| # | Intelligence | Surface (suite) | Fixture | Gate metric(s) | Threshold | Grader / fn |
|---|---|---|---|---|---|---|
| 1 | Triage | `inbox-triage` | `inbox-triage.golden.jsonl` (>=40) | `false_demote_rate` | <= 0.02 | `falseDemoteRate` (inbox-metrics) |
| 1 | Triage | `inbox-triage` | same | `noise.precision` | >= 0.90 | `computeClassificationMetrics` |
| 1 | Triage | `inbox-triage` | same | `primary.recall` | >= 0.95 | `computeClassificationMetrics` |
| 2 | Draft quality | `inbox-draft` | `inbox-draft.golden.jsonl` (>=20) | `send_without_edit_rate` | >= 0.70 | deterministic grader bundle (R2.2) |
| 2 | Draft quality | `inbox-draft` | same | `edit_distance` (mean) | <= 0.45 | `editDistance` (inbox-metrics) |
| 2 | Draft quality | `inbox-draft` | same | voice+context `dimension_judge` (LLM tier) | >= 0.75 @ k>=3 | `runGrader` dimension_judge + `computeMultiTrialMetrics` |
| 2 | Draft selectivity | `inbox-draft` | `inbox-reply-worthy.golden.jsonl` (>=30) | `replyWorthy.precision` | >= 0.90 | `replyWorthyPR` |
| 2 | Draft selectivity | `inbox-draft` | same | `replyWorthy.recall` | >= 0.90 | `replyWorthyPR` |
| 3 | Refine | `inbox-refine` | `inbox-refine.golden.jsonl` (>=15) | `instruction_adherence` | >= 0.85 | `instructionAdherence` |
| 3 | Refine | `inbox-refine` | same | `fact_preservation` | >= 0.95 | `factPreservation` |
| 4 | Summarize | `inbox-summary` | `inbox-summary.golden.jsonl` (>=15) | trapFact hits | == 0 | `forbidden_pattern`(trapFacts) |
| 4 | Summarize | `inbox-summary` | same | `required_fact_coverage` | >= 0.85 | `contains_all`(requiredFacts) |
| 4 | Summarize | `inbox-summary` | same | `citation_accuracy` | >= 0.90 | `citationAccuracy` |
| 4 | Summarize | `inbox-summary` | same | `faithfulness` (LLM tier) | >= 0.80 | `runGrader` faithfulness |
| 5 | Ask-agent | `inbox-ask` | `inbox-ask.golden.jsonl` (>=15, >=4 neg) | `retrieval_recall` | >= 0.90 | `selectRelevantThreads` + assertion |
| 5 | Ask-agent | `inbox-ask` | same | `abstention_correctness` | == 1.0 | answered=false on negatives |
| 5 | Ask-agent | `inbox-ask` | same | `grounded_answer_rate` | >= 0.85 | `contains_all` + citation-in-range |

Two tiers per suite: a DETERMINISTIC floor (always runs, gates CI without an LLM
key) and an LLM-JUDGE tier (`WHERE ANTHROPIC_API_KEY is set`) for the
quality-of-prose metrics (draft voice, summary faithfulness). Mirrors the
HAS_LLM split in `golden-eval-gate.test.ts:44`.

## Orchestration (Inngest)

No new Inngest function REQUIRED for the gate (it runs in CI via `pnpm eval:run`).
OPTIONAL follow-up (out of scope for the gate, tracked under observability):
register the 5 suites in the existing weekly eval cron so `eval_runs` gets a
production timeline — they already conform to `EvalSuite`, so the cron caller
calls `runEvalSuite(inboxTriageEvalSuite)` etc. with zero new wiring.

## Integrations — vs the locked stack

- Runner: Vitest (`[LOCKED]`).
- Judge model: Anthropic Haiku/Sonnet via `runGrader`/`runDimensionJudges`
  (`[LOCKED]` — already the default; no new provider).
- Persistence: `eval_runs`/`eval_case_runs` via `runEvalSuite` (`[LOCKED]`).
- No new dependency added to `package.json` (Levenshtein is a ~15-line pure
  function in `inbox-metrics.ts`, not a library — Layer-3 first principles, keeps
  the offline floor dependency-free).

## The G-eval gate (definition every Track-B spec references)

> **G-eval.** A Track-B inbox intelligence (B1 draft, B2 voice, B3 splits,
> B4 noise, B5 ask-agent, B7 follow-up) is "DONE" only when its corresponding
> suite in `pnpm eval:run` is GREEN at the C1 thresholds. "Green" =
> `runEvalSuite(<suite>)` returns `metrics` that satisfy EVERY gate row in the
> C1 metric table for that surface, and `src/__tests__/inbox-eval-gate.test.ts`
> passes with exit 0. The reviewer rejects a Track-B PR that merges without its
> suite green.

Per-spec wiring (each Track-B spec adds, in its own `tasks.md`, an acceptance
task: "C1 gate green for surface X"):

| Track-B spec | Gated by surface | Must-green gate metrics |
|---|---|---|
| B1 `inbox-ai-draft` | `inbox-draft` | `send_without_edit_rate`, `edit_distance`, draft `dimension_judge`, `replyWorthy.{precision,recall}` |
| B2 `inbox-writing-style` | `inbox-draft` | draft `dimension_judge` (voice) >= 0.75 (re-run after voice prompt change) |
| B3 `inbox-splits` | `inbox-triage` | `noise.precision`, `primary.recall`, `false_demote_rate` |
| B4 `inbox-noise-classifier` | `inbox-triage` | `false_demote_rate <= 0.02`, `noise.precision >= 0.90` |
| B5 `inbox-ask-agent` | `inbox-ask` + `inbox-summary` | `retrieval_recall`, `abstention_correctness`, `grounded_answer_rate`, summary `faithfulness`/`citation_accuracy` |
| B7 `inbox-followup-timing` | `inbox-draft` (nudge) | `send_without_edit_rate` on the pre-drafted nudge fixtures |

The refine surface (`inbox-refine`) gates the edit-with-AI affordance inside B1.

## Guardrails (one line each)

- Offline floor: every gate metric computable + enforced with NO LLM key (CI-safe).
- LLM tier opt-in: prose-quality metrics run only `WHERE ANTHROPIC_API_KEY` set; absence never silently passes a prose bar (it is reported as skipped, deterministic floor still gates).
- Fail-closed honesty: an empty draft / empty summary / answered=false counts as the intended outcome, never as pass-by-default (R2.7, R5.4).
- Cardinal sins hard-fail: a demoted reply-worthy item (triage) and a stated trapFact (summary) fail the whole suite and are named in the detail.
- Multi-trial: LLM-judge prose metrics use k>=3 trials + pass-power-k floor (`computeMultiTrialMetrics`) so a lucky run cannot turn the gate green.
- Citation integrity: every cited index validated in-range (guards the `ask-inbox.ts:176` / `summarize-thread.ts:92` clamps against regression).
- Capability -> regression promotion: once a feature ships green, its golden cases flip to `regression` (>=0.9, alert on >5% drop) so quality cannot silently rot.
- No new framework / no new dep: reuse `harness.ts` + `agent-evals.ts`; Levenshtein is a local pure fn.
- Determinism in fixtures: golden JSONL is hand-labeled, ids unique, validated by a static test (mirrors `chat-eval-suite.test.ts`) so a malformed fixture fails fast, not mid-run.
