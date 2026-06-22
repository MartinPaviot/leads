# P1-12 — personalization-judge — Verification (2026-06-22)

Branch `feat/agentic-p1`. A semantic LLM-judge can now catch fake personalization
that the substring grader passes — as an opt-in 2nd stage that can only TIGHTEN
the score. Default generation behaviour unchanged. No migration.

## What shipped (deploy-safe core)
- `lib/evals/personalization-judge.ts` `judgePersonalization(body, brief)`: reads
  the cached research brief, asks Haiku to judge each factual claim as grounded /
  not-grounded, returns `groundedScore`. Fail-open + CI-safe: no key / empty brief
  / error → NEUTRAL `{groundedScore:0.5, skipped:true}`. `parseJudgeJson` tolerates
  prose around the JSON.
- `sequence-quality.ts` `gradeSequenceQuality` is now async with `opts.semanticJudge`:
  when on (and the step isn't empty), it runs the judge and sets
  `personalization = min(det, groundedScore)` (never raises it), recomputes the
  composite from the dimension weights, and records `perStep[].semantic`. Off by
  default → zero LLM cost in the bulk path.
- `sequence-generator.ts`: `finalEval` now awaits (sync→async); the generation
  path passes NO opts, so it stays deterministic.

## Tests (33 in the run, green) + tsc 0 + regression 294 green
- `personalization-judge.test.ts` (8) — parseJudgeJson prose/no-json/broken;
  no-key / empty-brief / undefined-brief → neutral no-call; verdicts → grounded/total;
  throw → fail-open with error.
- `sequence-quality-semantic.test.ts` (4) — no-opts: judge not called, no semantic
  field (regression); opts + low score → tightened; opts + skipped → unchanged;
  empty-body step → judge not called.
- Existing `sequence-quality.test.ts` updated to await; generation-path regression
  (sequence/campaign/vertical/email-quality) 294 green — composite unchanged off-opts.

## Deferred (migration-coupled / large)
- T4 `outboundEmails.quality_score` column + T5 write-on-outbound, T6
  `personalization_calibration` table, T7 `backtestTenant` + point-biserial, T8
  the nightly Inngest back-test cron — all need 2 migrations (column + table), so
  deferred (prod schema-behind hazard). The judge + the 2nd stage are the value.
- T9 the ≥20-case `PERSONALIZATION_GOLDEN` calibration set + MAE eval — large
  annotation effort, follow-up. The judge is wired + tested in isolation today.
