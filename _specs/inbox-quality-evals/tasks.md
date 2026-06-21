# C1 — inbox-quality-evals — Tasks

**Total estimate: ~7 dev-days (14 half-days), 13 tasks.**
All paths under `app/apps/web/`. Run unit tests with `pnpm test` from
`app/apps/web`; run the gate with `pnpm eval:run`. Tag legend: `[NEW]` code,
`[CFG]` config, `[DONE]` reference-only.

> Sequencing: B1 (metrics helper) -> B2 (gate scaffold + static fixture test) ->
> B3..B7 (one suite + fixture per intelligence) -> B8 (wire into eval:run) ->
> B9 (capability/regression classification + report card) -> B10 (per-spec
> acceptance-task stubs).

---

## B1 [NEW] — Pure metric helpers (`src/lib/evals/inbox-metrics.ts`)  — 1 half-day

Action: add a dependency-free module exporting `editDistance(a,b): number`
(normalized Levenshtein 0..1), `falseDemoteRate(preds)`, `citationAccuracy`,
`replyWorthyPR(preds)`, `instructionAdherence(case,output)`,
`factPreservation(before,after)`. Reuse `computeClassificationMetrics`
(`agent-evals.ts:1015`) inside `falseDemoteRate`/`replyWorthyPR`.

- Verify: `import { editDistance } from "@/lib/evals/inbox-metrics"` resolves;
  `editDistance("hi","hi")===0`, `editDistance("","abc")===1`.
- Test: `src/lib/evals/__tests__/inbox-metrics.test.ts` — unit-tests each fn
  with hand-computed expectations (incl. a known false-demote set giving
  rate=0.25, a refine case dropping a number -> factPreservation=false).
- Refs: R1.3, R2.3, R3.2, R3.3, R4.3, R6.

## B2 [NEW] — Gate scaffold + static fixture validator  — 1 half-day

Action: add `src/__tests__/inbox-eval-gate.test.ts` (empty gate that imports the
suites as they land) and `src/__tests__/inbox-fixtures-valid.test.ts` (static:
every `*.golden.jsonl` line parses, ids unique, required fields present — mirror
`chat-eval-suite.test.ts:34`). Create `src/lib/evals/fixtures/inbox/`.

- Verify: `pnpm test inbox-fixtures-valid` passes on an empty/seed fixture set
  (skipIf-empty like `chat-eval-suite.test.ts:37`).
- Test: the validator IS the test (asserts >=N lines once fixtures land).
- Refs: R6.1, R6.3.

## B3 [NEW] — Triage suite + golden set  — 1.5 half-days

Action: author `inbox-triage.golden.jsonl` (>=40 labeled, >=6 adversarial per
R1.1) + `src/lib/evals/suites/inbox-triage.eval.ts` exporting `inboxTriageEvalSuite`
(`surfaceId: "inbox-triage"`). Each case `run()` maps the labeled email through
the triage oracle (deterministic generator injected into `classifyGeneralIntent`,
plus `scoreImportance` for the noise/promotions split); `aggregateMetrics`
returns `false_demote_rate`, `noise_precision`, `primary_recall` via
`computeClassificationMetrics` + `falseDemoteRate`.

- Verify: `runInboxTriageEval()` returns metrics; on a seeded false-demote the
  failure detail names the item id (R1.5).
- Test: gate assertions in `inbox-eval-gate.test.ts` — `false_demote_rate<=0.02`,
  `noise_precision>=0.90`, `primary_recall>=0.95`.
- Refs: R1.1–R1.6.

## B4 [NEW] — Draft suite + golden set (quality)  — 1.5 half-days

Action: author `inbox-draft.golden.jsonl` (>=20 thread+reference) +
`src/lib/evals/suites/inbox-draft.eval.ts` (`surfaceId: "inbox-draft"`). `run()`
calls `composeReply` with a deterministic generator returning the fixture draft
(offline) or the real generator (LLM tier); deterministic graders per R2.2 +
`editDistance` vs reference; LLM tier adds `dimension_judge` (voice+context)
with `computeMultiTrialMetrics` (k>=3). Empty draft -> fail (R2.7).

- Verify: metrics include `send_without_edit_rate`, `edit_distance`; an injected
  "already sent" draft fails the never-already-sent grader.
- Test: gate — `send_without_edit_rate>=0.70`, `edit_distance<=0.45`; LLM tier
  (skipped without key) `dimension_judge>=0.75`.
- Refs: R2.1–R2.4, R2.7.

## B5 [NEW] — Reply-worthiness selectivity golden set + metric  — 1 half-day

Action: author `inbox-reply-worthy.golden.jsonl` (>=30, `replyWorthy` labels) and
extend `inbox-draft.eval.ts` with a selectivity block computing
`replyWorthy.precision`/`recall` via `replyWorthyPR`. The classifier under test
is the B1/B4 deliverable; until it lands, the suite runs against the label oracle
so the metric + threshold are proven (capability mode).

- Verify: `replyWorthyPR` on the golden set returns precision/recall; a welcome
  email labeled `false` that the oracle marks `true` drops precision below gate.
- Test: gate — `replyWorthy.precision>=0.90` AND `replyWorthy.recall>=0.90`.
- Refs: R2.5, R2.6.

## B6 [NEW] — Refine suite + golden set  — 1 half-day

Action: author `inbox-refine.golden.jsonl` (>=15, multi-part + semantic-transform)
+ `src/lib/evals/suites/inbox-refine.eval.ts` (`surfaceId: "inbox-refine"`).
`run()` calls `rewrite(before, instruction, gen)`; graders =
`instructionAdherence` (`contains_all`/`forbidden_pattern`/language/length) +
`factPreservation` (R3.3). Dropped fact -> fail + named (R3.4).

- Verify: the QUALITY-BENCH 1b case ("stop contacting us" -> "I can forward...")
  passes adherence; a variant that keeps "ne plus nous contacter" fails.
- Test: gate — `instruction_adherence>=0.85`, `fact_preservation>=0.95`.
- Refs: R3.1–R3.4.

## B7 [NEW] — Summary suite + golden set  — 1 half-day

Action: author `inbox-summary.golden.jsonl` (>=15, `requiredFacts` + `trapFacts`)
+ `src/lib/evals/suites/inbox-summary.eval.ts` (`surfaceId: "inbox-summary"`).
`run()` calls `summarizeThread(messages, gen)`; graders = `contains_all`
(requiredFacts), `forbidden_pattern` (trapFacts, ANY hit hard-fails the suite per
R4.5), `citationAccuracy` (indices in range + supportive), LLM tier `faithfulness`.

- Verify: a fixture whose oracle injects a trapFact makes the suite RED; the
  Resend-welcome case (QUALITY-BENCH 4) passes required-fact coverage.
- Test: gate — trapFact hits==0, `required_fact_coverage>=0.85`,
  `citation_accuracy>=0.90`; LLM tier `faithfulness>=0.80`.
- Refs: R4.1–R4.5.

## B8 [NEW] — Ask-agent suite + golden set  — 1.5 half-days

Action: author `inbox-ask.golden.jsonl` (>=15, >=4 negatives) +
`src/lib/evals/suites/inbox-ask.eval.ts` (`surfaceId: "inbox-ask"`). Per case:
assert `selectRelevantThreads` returns the expected key in top-`limit`
(`retrieval_recall`); call `askInbox` with a deterministic generator; assert
`contains_all`(requiredFacts) + every citation in selected range for positives,
`answered===false` + empty citations for negatives (`abstention_correctness`).

- Verify: a negative case ("what did X say about pricing?" with no such thread)
  returns `answered=false`; an out-of-range citation injected by the oracle fails
  the case (guards `ask-inbox.ts:176`).
- Test: gate — `retrieval_recall>=0.90`, `abstention_correctness===1.0`,
  `grounded_answer_rate>=0.85`, 100% citations in range.
- Refs: R5.1–R5.6.

## B9 [CFG] — Wire the 5 suites into `pnpm eval:run`  — 0.5 half-day

Action: extend `package.json:12` `eval:run` to append
`src/__tests__/inbox-eval-gate.test.ts`; have the gate test import all 5 suites,
run via `runEvalSuite`, assert every gate metric, print a per-metric report card
(mirror `golden-eval-gate.test.ts:305`), exit non-zero on any breach.

- Verify: `pnpm eval:run` from `app/apps/web` executes the inbox gate and prints
  the report card; flipping one fixture label red makes the command exit non-zero.
- Test: the gate test itself; plus a smoke assertion that `eval:run` string
  contains `inbox-eval-gate`.
- Refs: R6.1, R6.3, R6.5.

## B10 [NEW] — Capability/regression classification + report card  — 0.5 half-day

Action: tag every inbox golden case `capability` until its feature ships; in the
gate test, group results by `classifyEvalCase` (`agent-evals.ts:1351`) and apply
`EVAL_SUITE_DEFAULTS` (`:1333`) — capability suites report progress, regression
suites alert on >5% drop. Document the promotion step in each suite header.

- Verify: gate report shows a `capability`/`regression` column; a case tagged
  `regression` dropping >5% prints an alert line.
- Test: extend `inbox-eval-gate.test.ts` to assert the classification split.
- Refs: R6.4.

## B11 [DONE] — Per-spec acceptance-task references (no code)  — 0.5 half-day

Action: in each Track-B spec's `tasks.md` (B1,B2,B3,B4,B5,B7), add the acceptance
task "C1 G-eval green for surface <X>" per the design.md mapping. This task only
authors the cross-references; the suites/thresholds are already defined here.

- Verify: each referenced Track-B `tasks.md` cites `inbox-quality-evals` + its
  surface name + the must-green metrics.
- Test: n/a (doc cross-link); covered by the spec reviewer checklist.
- Refs: R6.2.

---

## Definition of Done (software, separate from the OKR)

- `pnpm test` green for `inbox-metrics`, fixture validator, and all 5 suites.
- `pnpm eval:run` runs the inbox gate, prints the report card, exits 0 with the
  seed/oracle fixtures meeting every threshold in the metric table.
- `pnpm tsc` green; no new runtime dependency in `package.json`.
- Each Track-B spec references the G-eval gate by surface + metric.
