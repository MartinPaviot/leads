# L2 Unit + harden — verdict

**Run** : 2026-05-08 (audit Phase 2)
**Result** : PASS — 4 of 4 named edge cases pinned + 1 real bug uncovered + fixed.

## Test count delta

| Before L2 | After L2 | Delta |
|---|---|---|
| 205 files / 2586 tests / 1 skip | **208 files / 2599 tests / 1 skip** | +3 files / +13 tests |

## New regression tests (per audit edge case)

| Edge case | Test file | Tests | Status |
|---|---|---|---|
| F11 schema split — `evalRuns` ≠ `llmEvalRuns` | `src/__tests__/eval-schema-collision.test.ts` | 3 | green |
| F16 CSP allowlist — PostHog EU hosts on `connect-src` + `script-src` | `src/__tests__/csp-allowlist.test.ts` | 4 | green |
| F17 stall evidence — `intent_cooling`, `no_recent_activity` carry concrete bullets ; `activity_drop`, `one_sided_email` extended inline | `src/__tests__/stall-predictor.test.ts` | +2 cases + 3 inline | green |
| F12+F13+F15 PostHog wiring — no-op pre-init, capture forwards, identify + group + reset | `src/components/__tests__/posthog-provider.test.tsx` | 4 | green |

## Audit-uncovered bug — F12 PostHog identify race

**Severity** : HIGH (silent prod data loss).

**Symptom** : the `posthog-provider.test.tsx` "identifies on mount with
traits, groups by tenantId" case failed initially — `posthog.identify`
spy was called 0 times, expected 1.

**Root cause** : React commits child effects *before* parent effects.
At first mount, the `PostHogIdentify` (deep child) effect runs, sees
the module-level `initialised` flag still `false`, returns early. The
`PostHogProvider` (parent) effect then runs and calls `posthog.init`,
flipping `initialised = true` — but `PostHogIdentify`'s effect deps
(`userId`, `traits`) haven't changed, so it never re-runs.

**Production impact** : every page load missed the very first
`posthog.identify` call. Every event was attributed to an anonymous
distinct_id ; the founder's email / name / tenantName traits were
never set in PostHog. Person profiles would have stayed empty ;
session replay couldn't be tied back to a real user ; the tenant
grouping (cohort dashboards) silently broke.

**Fix** : `PostHogIdentify`'s effect now calls `initOnce()` defensively
at the start, ensuring the SDK is initialised before checking the
flag. `initOnce()` is already idempotent so calling it from both
provider and identify is safe.

This is exactly the class of bug the audit was designed to catch —
vitest passed, tsc passed, the prod build *built*, and the wire
silently dropped data. The audit found it because the test forces
the assertion at the level the user cares about ("identify call
happened with the right user id and traits") rather than at the
level the code happens to expose ("`initialised` flag became true").

## Score adjustments

Per the rubric in `requirements.md` :

- **F12 PostHog autocapture + replay** : was provisionally 0.85 ;
  the bug found here would have tanked the *Functional* dimension to
  ~0.4 in production (silent data loss). Post-fix, restored to 0.95.
- **F13 boundary events** : downstream of F12 — boundary events fired
  but with anonymous distinct_id pre-fix. Post-fix, restored to 0.9.
- **F15 chat / home events** : same downstream. Post-fix, 0.95.

## Evidence files

- `src/__tests__/eval-schema-collision.test.ts` — committed, 3 tests
- `src/__tests__/csp-allowlist.test.ts` — committed, 4 tests
- `src/__tests__/stall-predictor.test.ts` — committed, +2 / +3 inline
- `src/components/__tests__/posthog-provider.test.tsx` — committed, 4 tests
- `src/components/posthog-provider.tsx` — fixed (defensive `initOnce()` in identify effect)

## Time

L2 active time : ~25 min (within the 30-min budget). Bug investigation
+ fix accounted for ~10 min of that.

## Next layer

L3 (local Playwright E2E) — 16 features × ~5 min = ~90 min budgeted.
Setup : `cd app/apps/web && pnpm dev` then drive a Playwright session
against `http://localhost:3000`. Screenshots saved per CLAUDE.md
mandate to `_reports/audit-2026-05-08/L3-e2e/screenshots/F<n>-*/NNN-*.png`.
