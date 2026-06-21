# P0-6 — rejection-feedback-loop — Verification (2026-06-22)

Branch `feat/autopilot-icp-guard`. The dominant rejection reason now feeds back
into generation as a counter-instruction. No schema, no migration.

## Requirements diff
| Req | Status | Evidence |
|---|---|---|
| R2/R4 floor + parse guard | DONE | `rejection-counter-prompt.ts` `extractDominantInsight` (floor 3, excludes "other"/unknown/non-numeric) |
| R5/R6 counter-instruction | DONE | `buildRejectionCounterPrompt` maps the 5 actionable categories |
| R7/R12 prompt prefix | DONE | `buildGenerationPrompt` (now exported) prefixes the block ahead of the SDR role; CRITICAL RULES untouched |
| R1/R3/R15 route load fail-open | DONE | `generate/route.ts` SELECTs `campaignConfig` tenant-scoped in try/catch; passes to both generateSequence calls |
| R11 "other" no-op | DONE | absent from COUNTER_INSTRUCTIONS → null → no block |
| R13 other call sites unchanged | DONE | param optional; action.ts/handler.ts compile + pass no insight |
| no schema | DONE | reads existing `sequences.campaignConfig` jsonb |

## Tests (9, all green)
- `rejection-counter-prompt.test.ts` (7) — valid extract; null on
  null/missing/below-floor/non-numeric/unknown/"other"; all 5 categories map; null
  → "".
- `sequence-generator-rejection-prompt.test.ts` (2) — block prefixes the prompt
  with the count, before "world-class SDR"; null → no block, prompt starts at the
  SDR role (regression).
- web tsc 0; targeted regression (sequence/campaign/rejection) 209 green.

## Honest scope note
The route load (Fix 4) is wired + tsc-checked and delegates to the
fully-tested `extractDominantInsight`; the tenant-scoped SELECT uses the same
`eq(tenantId)` pattern as the route's existing UPDATE, and a cross-tenant miss
returns `[]` → `extractDominantInsight(undefined)` → null. A full mocked-route
harness (AC5 at the HTTP layer) was not written — the load is a thin, tested
composition. Live verification (forge a campaignConfig insight, inspect the
traced prompt) is the deploy-time check from tasks.md T4.
