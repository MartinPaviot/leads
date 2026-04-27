# FINDING-012: Tasks

## Task 1: Extract deltas into config (~45min)
- Create `app/apps/web/src/lib/guardrails/trust-config.ts` with all deltas, thresholds, and nudge timing
- Add env-var override support: parse `TRUST_SCORE_OVERRIDES` as JSON, deep-merge with defaults
- Document calibration rationale as JSDoc comments on each value
- **Verify:** Config loads correctly; env override changes values

## Task 2: Refactor trust-score.ts to use config (~45min)
- Replace `TRUST_SCORE_DELTAS` object with import from `trust-config.ts`
- Replace `NUDGE_THRESHOLDS` with config values
- Replace `REDISPLAY_AFTER_DAYS` with config value
- **Verify:** Existing `guardrails-trust-score.test.ts` passes without changes

## Task 3: Write calibration document (~30min)
- Add calibration rationale section to `trust-config.ts` as detailed comments
- Include: expected days-to-threshold for various usage patterns, asymmetry justification, redisplay reasoning
- **Verify:** Document review — rationale covers all values

## Task 4: Add simulation test (~1h)
- Create `__tests__/trust-score-simulation.test.ts`
- Simulate: "active user" (3 approvals/day, 0.5 undos/week) — should reach batch-daily in 7-21 days
- Simulate: "cautious user" (1 approval/day, 1 undo/week) — should reach batch-daily in 14-42 days
- Simulate: "unhappy user" (1 approval + 1 undo/day) — score should stay below threshold
- **Verify:** All simulation tests pass with current config values
