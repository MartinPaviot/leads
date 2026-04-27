# FINDING-012: Design — Trust Score Calibration

## Approach
Extract hardcoded deltas into a config object, document calibration rationale, and add simulation tests.

## Configuration Structure
```typescript
// lib/guardrails/trust-config.ts
export const TRUST_CONFIG = {
  deltas: {
    approved_no_edit: 0.03,    // ~17 approvals to batch-daily
    approved_with_edit: 0.015,
    heavily_edited: 0,
    rejected: -0.01,
    undone_after_send: -0.08,  // Asymmetric: trust breaks faster than it builds
  },
  thresholds: {
    batchDaily: 0.50,
    autoHighConfidence: 0.80,
  },
  nudge: {
    redisplayAfterDays: 14,
  },
} as const;
```

## Calibration Rationale (to be documented in config file)
- **+0.03 per clean approval**: At 2 approvals/day, reaches 0.50 in ~8.5 days. At 1/day, ~17 days. Target: 2-4 weeks.
- **-0.08 per undo**: Asymmetric negative (2.6x the positive) because undone actions directly impact recipient trust.
- **14-day redisplay**: One full business cycle before re-offering a dismissed upgrade.

## Changes
1. `trust-score.ts` reads from `TRUST_CONFIG` instead of hardcoded values
2. `TRUST_CONFIG` values can be overridden via `TRUST_SCORE_OVERRIDES` env var (JSON)
3. Existing tests updated to use config values

## Simulation Test
Test that simulates 30 days of usage patterns (2 approvals/day, 1 undo/week) and asserts threshold crossing dates fall within expected ranges.
