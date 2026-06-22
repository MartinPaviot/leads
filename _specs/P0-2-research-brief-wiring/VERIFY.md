# P0-2 — research-brief-wiring — Verification (2026-06-22)

Branch `feat/autopilot-icp-guard`. The cached intelligence brief now reaches the
generation prompt on both paths. No schema, no migration.

## Requirements diff
| Req | Status | Evidence |
|---|---|---|
| R1 `ProspectContext.researchBrief` | DONE | `prospect-context.ts` `ResearchBriefContext` + optional field |
| R2/R4 cache-only read + mappers | DONE | `build-intelligence-brief.ts` `readCachedBrief` / `toResearchBriefContext` (slice 2, quote 200) / `briefIsEmpty` |
| R3/R14 populate read-only | DONE | `buildProspectContext` dynamic-imports the cache reader; never scrapes here |
| R5/R7 prompt section | DONE | `formatContextForPrompt` emits `RESEARCH BRIEF (use this angle first)` before BUYING SIGNALS |
| R6 research-first brief | DONE | `buildPersonalizationBrief` (now exported) pushes ANGLE/PAIN/COMPETITOR ahead of firmographics |
| R8/R9/R15 await + fail-open | DONE | `generate/route.ts` replaces fire-and-forget with `withTimeout(buildIntelligenceBrief, 8000)`; rejection/timeout -> null |
| R11 template threading | DONE | `minimalCtx.researchBrief` set from `resolvedBrief` via the mappers |
| R12/R13 strategy + no schema | DONE | `selectStrategy` untouched; `intelligenceBriefs` already holds all fields |

## Tests (13, all green)
- `with-timeout.test.ts` (3) — value passes; rejection -> null; fake-timer timeout -> null.
- `intelligence-brief-mappers.test.ts` (4) — publicContent sliced to 2, quote to 200;
  angle/pains/competitor/warmth mapped; `briefIsEmpty` true-when-empty / false-on-any-field.
- `personalization-brief.test.ts` (3) — ANGLE precedes SIGNAL; no brief -> no research
  lines (no regression); partial brief emits only present lines.
- `format-context-brief.test.ts` (3) — RESEARCH BRIEF before BUYING SIGNALS; truncated
  quote rendered; absent brief -> no section.
- `pnpm tsc` (web): 0 errors (incl. the type-only cross-import build-intelligence-brief
  -> prospect-context, erased at runtime — no cycle). Targeted regression
  (sequence/campaign/prospect/generate/vertical): 22 files / 265 tests green.

## Honest scope note
The fail-open await (Fix 6) and the brief->prompt threading are covered by the
unit tests of `withTimeout` (fail-open) + the mappers + the two prompt builders,
and by `tsc` on the route wiring. A full mocked-route harness asserting the 201
response on brief-reject end-to-end (AC7/AC9 at the HTTP layer) was NOT written —
the behaviour is composed of independently-tested pure units, so the marginal
coverage is low; flag for a later integration test if the route grows. The
cold-brief-then-reread visibility (serverless Neon, design Open Question) wasn't
exercised live — the await ordering makes it correct, verify in a live eval.
