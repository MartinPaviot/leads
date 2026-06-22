# P0-3 — quality-gate-generation — Verification (2026-06-22)

Branch `feat/autopilot-icp-guard`. The data-backed grader now runs on EVERY
generated sequence, bulk included. No schema, no migration.

## Requirements diff
| Req | Status | Evidence |
|---|---|---|
| R2/R3 step grader + mapping | DONE | `lib/evals/sequence-quality.ts` `gradeGeneratedStep` + `methodologyToFramework` (4 names) |
| R4 empty-body guard | DONE | empty body -> composite 0 + "empty body" issue |
| R5 thresholds + per-dim feedback | DONE | `passThresholdFor` (BASHO 0.80 / else 0.70); `gradeSequenceQuality` feedback `Step N: ...` |
| R1/R7 loop on bulk + attach scores | DONE | `generateSequence` always runs `evaluatorOptimizerLoop(…, gradeSequenceQuality, 2)`; attaches `sequenceQuality` + `steps[].qualityScore` |
| R6 fail-open | DONE | below-threshold returns best output `passed:false`, never throws; invalid JSON -> {pass:false,score:0} |
| R8 route returns quality | DONE | `generate/route.ts` 201 carries `quality.composite/passed/perStep` on both paths |
| R11 evaluateSequenceQuality kept | DONE | still exported, no longer called by the loop |

## Tests (15, all green)
- `sequence-quality.test.ts` (11) — name->framework (4 + unknown); thresholds;
  empty body -> 0; over-length BASHO word_count<0.6; dead opener anti_patterns<1;
  placeholder/no-signal no-throw; valid seq perStep==steps; invalid JSON; empty
  steps; per-step feedback label.
- `sequence-generator-gate.test.ts` (4) — bulk attaches sequenceQuality +
  qualityScore; below-threshold refines (2 LLM calls, 2nd prompt carries feedback,
  iterations>=2); stays-low returns best `passed:false` no throw; evaluateSequence-
  Quality still exported.
- web tsc 0; regression (sequence/campaign/generate/vertical/email-quality) 255 green,
  incl. unchanged `email-quality-grader.test.ts` + `vertical-baseline.test.ts`.

## Honest scope note (deferred within P0-3)
- Fix 5 (`generateFollowUpEmail` non-blocking grade, action.ts) NOT shipped — it
  is a secondary chat-tool score that nothing acts on, and adds edits to the large
  action.ts; `gradeGeneratedStep` is exported and ready to wire it in a follow-up.
- R12 (`agentTraces.evalScore` on the trace) NOT wired — the eval score isn't known
  at `generateFn` time (the `_trace` is emitted before evaluation); needs a
  post-loop tracer, deferred.
- Route `quality` response (Fix 4) is wired + tsc-checked; a full mocked-route
  harness (AC6 at HTTP layer) was not written — `sequenceQuality` is produced and
  tested at the generator; the route mapping is trivial.
- Cost: bulk now does up to 2 LLM calls/contact (was 1) — the intended trade-off
  for gating every sequence (audit's core finding). Confirm p95 latency live.
