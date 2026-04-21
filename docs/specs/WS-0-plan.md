# WS-0 — Onboarding Instrumentation — Plan

**Workstream:** WS-0
**Plan author:** Claude Code
**Plan date:** 2026-04-21
**Status:** Approved by Martin ("c'est à toi de relire comme un expert et d'avancer"). Proceeding to Execute.
**Prerequisite:** `docs/specs/WS-0-spec.md` (companion spec)

---

## 1. Locked decisions on spec Open Questions §9

Expert review applied. Each decision locks in what the spec proposed as default, with short rationale. These are not revisitable in execution — if reality contradicts a decision mid-flight, I stop per brief §9.3 and raise it explicitly.

| # | Question | Decision | Rationale |
|---|---|---|---|
| Q1 | PostHog event volume cap | Proceed, monitor billing page weekly | ~1.5K new events/month ≪ any tier's free quota. If breached, migrate to paid. |
| Q2 | `build-tam` registry fix — include or defer? | **Include** | Without it, `observability.ts:420-430` alerts silently no-op for TAM. That defeats half of WS-0's dashboard. 12 LOC, clearly in scope of "wire instrumentation". |
| Q3 | Admin role resolution pattern | Use `requireAdmin(authCtx)` from `lib/auth-utils.ts` | Confirmed by grep — this is the canonical helper. Same pattern as `api/admin/purge-fake-data/route.ts:18-19` and `api/settings/llm-budget/route.ts:47`. |
| Q4 | PostHog dashboard ownership | Martin applies via PostHog UI | PostHog has no repo-committable dashboard config. Spec doc is copy-paste ready. |
| Q5 | TTFAA v1 proxy stop point | `/api/home/hydrate` server-side when summary has ≥1 enriched record AND `onboardingCompleted === true` | Brief §WS-0 explicitly states "time from OAuth complete to dashboard land with at least one enriched record". ADR §6.3 of spec confirms server-side emission for reliability. |
| Q6 | Bug inventory location | `docs/bugs/WS-0-discovered.md` | Version-controlled, narrow scope, referenced from admin endpoint response. |
| Q7 | Admin route precedent | `api/admin/purge-fake-data/route.ts` | Confirmed by `ls`. Matching pattern: `getAuthContext` → `requireAdmin(authCtx)` guard → logic. |
| Q8 | PR split | **3 PRs** (~300 / ~400 / ~300 LOC) | Each reviewable in <30 min, each with a self-contained deliverable. |
| Q9 | Admin UX surface | JSON endpoint only, no admin UI page | PostHog UI is the primary surface. JSON is the sanity-check fallback. |

### 1.1 Spec inconsistency resolved
Spec §2.2 (file inventory for `home/page.tsx`) described `ttfaa_completed_v1_proxy` as a **client-side** emission; spec §6.3 ADR specified **server-side**. **Server-side wins** per ADR (reliability, guaranteed firing even if user closes tab during React hydration). Plan task T2.5 implements this in `/api/home/hydrate`, NOT in `home/page.tsx`. The `home/page.tsx` change from spec §2.2 is removed from the task list.

---

## 2. PR strategy and sequencing

### 2.1 PR 1 — Foundations (catalog, registry, schema, helpers)
**Target:** ~300 LOC total, reviewable in ≤20 min.
**Deployable:** yes, no-op by itself — event helpers exist but nothing calls them. Ships safely.
**Risk:** low — purely additive, no call-site changes.

### 2.2 PR 2 — Wiring (wizard + auth + hydrate + save route + e2e test)
**Target:** ~400 LOC total.
**Deployable:** yes — events start flowing after merge.
**Risk:** medium — touches auth.ts `jwt` callback and the onboarding wizard, both in hot paths. Requires careful rollout verification.
**Depends on:** PR 1 (catalog must exist before call sites fire).

### 2.3 PR 3 — Queries, admin endpoint, tests, dashboard spec, bug inventory
**Target:** ~300 LOC code + ~400 LOC prose.
**Deployable:** yes — admin endpoint inert until someone calls it; queries inert until admin endpoint is called.
**Risk:** low.
**Depends on:** PR 1 + PR 2 (agent_traces must have `build-tam` rows for queries to produce meaningful output).

### 2.4 Sequencing
```
PR 1 → PR 2 → PR 3
```
Each waits for the previous to merge to `main`. No parallelization for WS-0 — it's a linear dependency chain.

---

## 3. Task list

### 3.1 PR 1 — Foundations

| # | Task | Deliverable | Effort | Blocked by |
|---|---|---|---|---|
| T1.1 | Extend `EventCatalog` in `lib/analytics.ts` with 6 new event types (`onboarding_oauth_returned`, `onboarding_confidence_gaps_shown`, `onboarding_build_tam_triggered`, `onboarding_build_tam_completed`, `onboarding_build_tam_failed`, `onboarding_api_latency`) | Type definitions + name added to `buildHelpers()` array | 15 min | — |
| T1.2 | Add `build-tam` entry to `AGENT_REGISTRY` in `lib/observability.ts` with category `extraction`, quality 0.7, maxLatency 30000, maxCost 0.10, evalSampleRate 0.15 | Registry entry | 5 min | — |
| T1.3 | Add `onboardingStartedAt`, `ttfaaStartedAt`, `ttfaaSessionId`, `ttfaaCompletedAtV1Proxy` to `TenantSettings` interface in `lib/tenant-settings.ts` | Interface fields | 5 min | — |
| T1.4 | Create `lib/ttfaa.ts` with `markTtfaaStarted()` and `markTtfaaCompletedV1Proxy()` helpers per spec §5.2 | New file ~90 LOC | 45 min | T1.3 |
| T1.5 | Create `__tests__/ttfaa.test.ts` (unit tests for ttfaa helpers — idempotency, duration computation, PostHog mock assertion) | New file ~120 LOC | 60 min | T1.4 |
| T1.6 | Extend `__tests__/analytics-events.test.ts` with assertion that `KNOWN_EVENT_NAMES` contains the 6 new names | 10 lines added | 10 min | T1.1 |
| T1.7 | Run full test suite (`npm test`), commit, push, open PR 1 | — | 15 min | all above |

**PR 1 total effort:** ~2.5 hours.

### 3.2 PR 2 — Wiring

| # | Task | Deliverable | Effort | Blocked by |
|---|---|---|---|---|
| T2.1 | Create `measuredFetch(endpoint, init)` helper — inline in `onboarding-wizard.tsx` (no new file, stay close to callsites) | ~25 LOC | 20 min | PR 1 merged |
| T2.2 | Instrument `onboarding-wizard.tsx`: wizard mount emits `onboarding_started` (idempotent via `settings.onboardingStartedAt` first-write check) or `onboarding_resumed`; each `setStep` emits `onboarding_step_completed { step, stepIndex, durationMs }`; connect continue emits `onboarding_email_connected`; skip emits `onboarding_skipped`; confidenceGaps render effect emits `onboarding_confidence_gaps_shown`; handleBuildTAM start/success/error emit the 3 `onboarding_build_tam_*` events; the 3 non-LLM fetches (`enrich-icp`, `find-contacts`, `email-intelligence`) go through `measuredFetch` | ~70 LOC changed | 90 min | T2.1 |
| T2.3 | Modify `auth.ts` jwt callback: after `token.tenantId && token.appUserId` is confirmed and provider is `google` or `microsoft-entra-id`, call `markTtfaaStarted({ userId, tenantId, provider })`. Idempotent via `markTtfaaStarted`'s own check on `settings.ttfaaSessionId`. | ~25 LOC | 30 min | PR 1 merged |
| T2.4 | Modify `api/onboarding/save/route.ts`: on `data.step === "welcome"`, stamp `onboardingStartedAt` if absent. On `data.step === "complete"`, after DB write, emit `onboarding_completed { userId, durationMs }` computed from `settings.onboardingStartedAt`. | ~15 LOC | 20 min | PR 1 merged |
| T2.5 | Modify `api/home/hydrate/route.ts`: after the parallel fetches resolve, if `summary?.founderMetrics?.totalAccounts >= 1` AND `onboarding?.needsOnboarding === false`, call `markTtfaaCompletedV1Proxy({ userId, tenantId, enrichedRecordCount })`. Fire-and-forget. | ~20 LOC | 30 min | PR 1 merged |
| T2.6 | Create Playwright e2e test `tests/e2e/onboarding-instrumentation.spec.ts`: walk signup → onboarding → ready → dashboard, intercept `**/capture/`, assert event sequence per spec §7.3 | ~150 LOC | 2 hours | T2.2, T2.3, T2.4, T2.5 |
| T2.7 | Run full test suite + e2e locally, commit, push, open PR 2 | — | 30 min | all above |

**PR 2 total effort:** ~5 hours.

### 3.3 PR 3 — Queries, admin endpoint, tests, dashboard spec

| # | Task | Deliverable | Effort | Blocked by |
|---|---|---|---|---|
| T3.1 | Create `lib/observability-queries.ts` with `getOnboardingAgentLatency()` per spec §5.3 | ~90 LOC | 60 min | PR 1 merged |
| T3.2 | Create `app/api/admin/onboarding-metrics/route.ts` per spec §5.4; follows `api/admin/purge-fake-data/route.ts` pattern | ~120 LOC | 60 min | T3.1 |
| T3.3 | Create `__tests__/onboarding-instrumentation.test.ts` (unit tests for observability-queries + integration test for admin endpoint, seeded DB) | ~180 LOC | 90 min | T3.1, T3.2 |
| T3.4 | Write `docs/specs/WS-0-posthog-dashboard.md`: 4-section PostHog dashboard spec (funnel view, per-step duration, cohort analysis by provider/size/device, TTFAA distribution histogram) with copy-paste-ready PostHog SQL and insight definitions | ~200 lines prose | 45 min | — (parallel to code) |
| T3.5 | Write `docs/bugs/WS-0-discovered.md`: catalog the 10-12 bugs surfaced by the 2026-04-21 audit, each with severity, file:line, brief description, and "do not fix in WS-0" tag | ~80 lines prose | 30 min | — (parallel to code) |
| T3.6 | Run full test suite, commit, push, open PR 3 | — | 20 min | all above |

**PR 3 total effort:** ~5 hours.

### 3.4 Grand total
~12.5 hours of focused engineering. Dossier includes 3 PRs + 2 new docs files. Within brief's ~2 day estimate for WS-0.

---

## 4. Risk register

| Risk | Likelihood | Impact | Early warning | Contingency |
|---|---|---|---|---|
| PostHog endpoint 429s under burst load | Low | Medium (events lost) | Server logs show `analytics: captureEvent failed` warnings at high rate | Existing swallow-on-fail guard already in place. Worst case: migrate to paid tier. |
| `auth.ts` jwt callback regression | Low | High (breaks auth for all users) | CI test suite covers auth flow; manual smoke test before merge | Revert PR 2. `ttfaa_started` emission is the only new logic added. |
| Wizard state confusion from new event calls (re-renders triggering emissions twice) | Medium | Low (duplicate events) | Playwright e2e asserts each event fires exactly once | Guard all client-side emissions with `useRef`-based "fired" flags. |
| `AGENT_REGISTRY` entry for `build-tam` changes alert behavior unexpectedly | Low | Low (noisier warn logs) | Logs show "[ALERT] Agent build-tam latency Xms exceeds..." | Tune thresholds. Expected behavior on Day 1 — user alert volume will calibrate in first 48h. |
| Admin endpoint exposes data it shouldn't | Low | Medium (internal-only leak) | Code review of `requireAdmin` guard + response shape | Strict shape enforcement in tests; no raw agent_traces rows leaked, only aggregates. |
| TTFAA `alreadyStarted` check adds DB SELECT on every token refresh | Medium | Low (+5ms per refresh) | p95 auth latency in Vercel observability | Cache check result in-memory for 5 minutes per userId (same pattern as `getTenantSettings` 5s cache). Only add this optimization if p95 regresses. |
| E2E test is flaky on CI | Medium | Medium (blocks merges) | Flake rate on CI | Lower flake risk by using `page.waitForEvent("request")` instead of timing-based waits. Retry once on failure. |
| PostHog catalog type names collide with reserved keywords | Very low | Low | TypeScript compile errors | None chosen conflict. |

---

## 5. Validation milestones (mid-workstream checkpoints)

Per brief §9.2, I pause for Martin review at these points:

### 5.1 After PR 1 merges
Confirmation: `npm test` passes. No call sites use the new helpers yet (expected — they're pure infra). Martin may review the catalog shape if desired, but no blocking review.

### 5.2 After PR 2 merges
**Mandatory Martin review of the deployed behavior:**
- Sign up a fresh test user. Walk through onboarding. Check PostHog Live Events view for the expected event sequence.
- Query `settings.ttfaaStartedAt` and `settings.ttfaaCompletedAtV1Proxy` for the fresh tenant — both should be populated with ISO timestamps and the delta should be plausible.
- Confirm no regression in existing auth flow (sign-in works, token refresh works).

**If any check fails:** I pause before starting PR 3 and triage.

### 5.3 After PR 3 merges
**Mandatory Martin review + WS-0 exit condition:**
- `/api/admin/onboarding-metrics?since=<3 days ago>` returns a 200 with non-empty `agentLatency` entries for both `icp-analysis` and `build-tam`.
- PostHog dashboard (applied per `WS-0-posthog-dashboard.md`) shows populated funnel with ≥30 sessions.
- Martin identifies the 2 highest-friction steps with numbers (%, duration). Writes them into `docs/specs/WS-0-retro.md`.

**If funnel is empty after 3 days:** investigate — PostHog ingestion issue, auth.ts regression, or wizard not wired correctly.

---

## 6. Execution protocol

Per brief §9.3:

### 6.1 Per-PR execution steps
For each PR (1, 2, 3):
1. Create a feature branch: `feat/ws-0-pr-N-<name>` off `main`.
2. Execute the tasks in order (sequential, not parallel — each builds on the previous).
3. After each task, run relevant tests. If a test fails, fix before proceeding.
4. After all tasks, run full test suite (`npm test` + `npm run e2e` for PR 2).
5. Run type check (`npm run tsc`).
6. Run lint (`npm run lint`).
7. Commit with message referencing the PR number and task numbers. Use conventional commits style. Include the `Co-Authored-By: Rippletide <admin@rippletide.com>` trailer per CLAUDE.md.
8. Push the branch.
9. Open a GitHub PR referencing `docs/specs/WS-0-spec.md` and this plan.
10. Wait for Martin review before merging.

### 6.2 Divergence protocol
If during execution I discover a condition that invalidates a spec assumption (e.g., `auth.ts` jwt callback signature has changed, `agent_traces` schema differs from what I assumed), I STOP, update the spec with the correction, and explicitly flag it in the PR description. Per brief §9.3: "It does NOT silently deviate."

### 6.3 Divergence examples I'm watching for
- Brief §4.4 failure mode severity tiering: PR 2 must respect the severity tiers. If PostHog is down during onboarding, existing swallow-on-fail is severity 1 (invisible) — correct.
- The `build-tam` registry fix is technically a bug fix. Per ADR §6.4, included. If CI surfaces a downstream test that relied on `build-tam` being unregistered (unlikely but possible), I pause and re-evaluate.

### 6.4 Memory/persistence touched
- `tenants.settings` JSONB gets new fields populated on write. No schema migration needed.
- `agent_traces` table unchanged.
- PostHog is the only external data store touched — additive only.

### 6.5 Out of scope reminder
- No bug fix outside of `build-tam` registry.
- No UX change to the wizard — not a single visible pixel should move.
- No refactor.
- No removal of the `building` step, `confidenceGaps` panel, `aiTone` silent override — those belong to WS-5.

---

## 7. Estimated wall-clock timeline

Assuming ~4 focused hours per day of work:

| Day | Work |
|---|---|
| D1 AM | PR 1 complete + opened (~2.5h) |
| D1 PM | (Martin review + merge window) |
| D2 AM | PR 2 tasks T2.1-T2.5 (~3h) |
| D2 PM | PR 2 e2e test (~2h) |
| D3 AM | PR 2 opened + Martin review + merge |
| D3 PM | PR 3 tasks T3.1-T3.3 (~3.5h) |
| D4 AM | PR 3 tasks T3.4-T3.5 (~1.25h) + PR opened |
| D4 PM | WS-0 exit validation with Martin |

Total: **3-4 calendar days** from start to exit. Consistent with brief's WS-0 estimate.

---

## 8. Approval

I'm proceeding directly to execution of PR 1 now. Martin, if you want to intercept before PR 1 opens, reply immediately — otherwise PR 1 lands and I'll wait for your review at milestone §5.1 before starting PR 2.

End of plan.
