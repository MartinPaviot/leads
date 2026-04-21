# WS-0 — Onboarding Instrumentation — Spec

**Workstream:** WS-0 (prerequisite to the full 9-workstream onboarding refactor)
**Spec author:** Claude Code
**Spec date:** 2026-04-21
**Reviewer:** Martin
**Status:** Draft — awaiting Martin's approval before Plan phase
**Companion docs:** `_reports/onboarding-audit-2026-04-21.md` (audit), the master brief posted 2026-04-21

---

## 1. Purpose and scope

### 1.1 Purpose
WS-0 instruments the **current v1 onboarding** with analytics, latency, and TTFAA (Time-To-First-Agent-Action) telemetry so that (a) the refactor's "before" baseline is quantified, (b) the two highest-friction steps in v1 are identified with numbers, and (c) the master success criteria in the brief section 6 become measurable on day one of WS-1+.

This workstream is **pure instrumentation**. It does not change UX, fix bugs, refactor fields, or add features. Per the brief §3 WS-0 note: "resist the urge to fix anything during this workstream."

### 1.2 In scope
- Wire the **already-declared but unfired** PostHog events in `lib/analytics.ts` (`onboarding_started`, `onboarding_step_completed`, `onboarding_skipped`, `onboarding_resumed`, `onboarding_completed`, `onboarding_email_connected`) at their natural call sites.
- Extend the PostHog catalog with 6 new events needed by the brief's instrumentation deliverables: `onboarding_oauth_returned`, `onboarding_confidence_gaps_shown`, `onboarding_build_tam_triggered`, `onboarding_build_tam_completed`, `onboarding_build_tam_failed`, `onboarding_api_latency`.
- Emit **TTFAA start/end events** (`ttfaa_started`, `ttfaa_completed_v1_proxy`) per the brief's formal definition §2.1.1.
- Fix the existing `build-tam` registry miss — add the entry to `AGENT_REGISTRY` so the LLM calls in `/api/tam` land in the agent_traces table with correct thresholds.
- Add client-side latency telemetry for the 3 onboarding APIs that are **not LLM-traced today** (`enrich-icp`, `find-contacts`, `email-intelligence`). The 2 that are LLM-traced (`analyze-website`, `tam`) inherit their latency via `agent_traces` and need no additional client instrumentation beyond the TAM completion event.
- Build a **baseline dashboard** in PostHog (UI config, not code) covering the funnel, per-step duration, cohort analysis, and TTFAA distribution. Deliverable = a written dashboard spec that Martin applies via the PostHog UI, plus query snippets for agent_traces data not available in PostHog.
- Add a small **agent_traces query helper** (`lib/observability-queries.ts`) that returns onboarding-specific p50/p95/p99/error-rate for `icp-analysis` and `build-tam` agents, consumable from an admin page or a one-off script.
- Add a small **admin route** `/api/admin/onboarding-metrics` (auth-gated to role `admin`) that returns the joined PostHog + agent_traces metrics for the last N days, so Martin can sanity-check numbers without logging into PostHog.
- Full Vitest coverage for every new emission point: mock `globalThis.fetch`, assert the event fires with the correct shape.
- One Playwright e2e test that walks through the full onboarding on a seeded test tenant and asserts the expected event sequence lands (via a mocked PostHog capture).

### 1.3 Out of scope (explicitly)
- Any UX change to the wizard (no copy edits, no layout change, no field removal, no typo fix).
- Fixing any of the audited bugs (`confidenceGaps` read-only, `aiTone` silent override, `defaultDataVisibility = "team"` placeholder, progress-bar X/7 miscount, `find-contacts` hardcoded seniorities). **These are deliberately left untouched to preserve the v1 baseline.** Filed in the bug inventory (§9) but not fixed here.
- Adding new product events outside the onboarding funnel (home, chat, sequences, etc. are already instrumented at their respective call sites — unchanged).
- Building a real-time dashboard in-product. PostHog is the dashboard surface.
- Introducing a new analytics vendor or replacing PostHog.
- Migrating existing tenants' data. No retroactive event backfill — instrumentation starts fresh on rollout day.
- Shipping a feature flag for this workstream (see §8.1).

### 1.4 Why WS-0 is a wiring job, not a build-from-scratch
Three infrastructure surfaces already exist in the codebase:

- **PostHog capture** (`app/apps/web/src/lib/analytics.ts`): server `captureEvent` + client `trackEvent` + typed catalog `posthogEvents` with 60+ events already declared, including the 6 onboarding ones. Zero call sites fire them today (grep `posthogEvents.onboarding_` returns empty). This is the largest WS-0 win.
- **LLM agent tracing** (`app/apps/web/src/lib/observability.ts` + `traced-ai.ts` + `db/schema agentTraces` table): every `generateObject` / `generateText` call wrapped with `tracedGenerateObject` lands in `agent_traces` with latency, tokens, cost, status. `/api/onboarding/analyze-website` already uses it with `agentId: "icp-analysis"`. `/api/tam` uses it with `agentId: "build-tam"` but that ID is missing from `AGENT_REGISTRY`, which silently defeats the alerting thresholds.
- **Page-view tracking** (`app/apps/web/src/components/posthog-provider.tsx`): `<PostHogPageTracker>` fires `$pageview` on every pathname change. This is already mounted in the dashboard layout; `/home` page views are captured.

WS-0's work is therefore (a) wiring, (b) filling the registry gap, (c) adding 6 net-new events for coverage gaps, (d) TTFAA instrumentation, (e) a dashboard spec.

---

## 2. File inventory

### 2.1 Files to CREATE

| Path | Purpose | Est. LOC |
|---|---|---|
| `app/apps/web/src/lib/observability-queries.ts` | SQL helpers over `agent_traces` for onboarding-specific p50/p95/p99/error-rate per agent, windowed by day. | ~90 |
| `app/apps/web/src/app/api/admin/onboarding-metrics/route.ts` | GET endpoint joining PostHog funnel (proxied) + agent_traces query. Auth-gated to `role === "admin"`. Martin-facing sanity-check surface. | ~120 |
| `app/apps/web/src/lib/ttfaa.ts` | Helpers to emit `ttfaa_started` (server-side, on OAuth callback) and `ttfaa_completed_v1_proxy` (server-side, in hydrate when summary has ≥1 enriched record). Encapsulates session correlation ID handling. | ~80 |
| `app/apps/web/src/__tests__/onboarding-instrumentation.test.ts` | Vitest unit tests for every emission point in the onboarding wizard and APIs. | ~180 |
| `app/apps/web/tests/e2e/onboarding-instrumentation.spec.ts` | Playwright e2e test: walks a seeded test tenant through the full onboarding and asserts the event sequence. Uses PostHog fetch mock. | ~150 |
| `docs/specs/WS-0-posthog-dashboard.md` | Written dashboard spec for PostHog UI: funnels, insights, cohorts, dashboards. Martin applies this manually via the PostHog UI (PostHog does not have a CLI export/import we currently use). | ~200 (prose) |
| `docs/specs/WS-0-plan.md` | Implementation plan produced in Phase 2 after this spec is approved. Placeholder. | N/A |
| `docs/specs/WS-0-retro.md` | Retrospective produced in Phase 3 at workstream exit. Placeholder. | N/A |

### 2.2 Files to MODIFY

| Path | Change | Est. LOC |
|---|---|---|
| `app/apps/web/src/lib/analytics.ts` | Extend `EventCatalog` interface with 6 new event types (§4.2), update `buildHelpers` names array. | ~20 |
| `app/apps/web/src/lib/observability.ts` | Add `build-tam` entry to `AGENT_REGISTRY` with thresholds (quality 0.7, maxLatency 30s, maxCost $0.10, evalSampleRate 0.15). | ~12 |
| `app/apps/web/src/components/onboarding-wizard.tsx` | Add `trackEvent` calls at (a) mount → `onboarding_started` if fresh, else `onboarding_resumed`; (b) each `setStep` → `onboarding_step_completed` with prior step's duration; (c) connect continue with emailConnected=true → `onboarding_email_connected`; (d) skip button → `onboarding_skipped`; (e) confidence gaps render → `onboarding_confidence_gaps_shown`; (f) handleBuildTAM start → `onboarding_build_tam_triggered`; (g) TAM success → `onboarding_build_tam_completed`; (h) TAM catch → `onboarding_build_tam_failed`. Also: wrap the 3 untraced-API fetches (`enrich-icp`, `find-contacts`, `email-intelligence`) with a latency helper that fires `onboarding_api_latency`. | ~70 |
| `app/apps/web/src/app/api/onboarding/save/route.ts` | Server-side emit `onboarding_completed` when `data.step === "complete"` after the DB write succeeds. Properties: `durationMs` computed from `onboardingStartedAt` (read from settings). | ~15 |
| `app/apps/web/src/app/(dashboard)/home/page.tsx` | When `/api/home/hydrate` response is applied and summary has `totalAccounts >= 1` AND `onb?.needsOnboarding === false`, emit `ttfaa_completed_v1_proxy` via client `trackEvent`. Idempotency via `localStorage.getItem("ttfaa_v1_logged")` — fire at most once per user. | ~20 |
| `app/apps/web/src/auth.ts` | In the `jwt` callback, when `account?.provider === "google" \| "microsoft-entra-id"` and this is the first OAuth sign-in for this account (check via existing inngest trigger conditional), emit `ttfaa_started` server-side. Properties: `userId`, `tenantId`, `provider`, `sessionCorrelationId` (UUID persisted to `settings.ttfaaSessionId`). | ~30 |
| `app/apps/web/src/lib/tenant-settings.ts` | Add three optional fields to `TenantSettings` interface: `onboardingStartedAt?: string`, `ttfaaStartedAt?: string`, `ttfaaSessionId?: string`. No migration — JSONB merge-on-write. | ~5 |
| `app/apps/web/src/__tests__/analytics-events.test.ts` | Extend the existing catalog sanity test to include the 6 new event names. | ~8 |

### 2.3 Files to DELETE
None. WS-0 is purely additive.

### 2.4 Total change footprint
- 8 files created (5 code, 3 docs/placeholders).
- 8 files modified.
- 0 files deleted.
- Estimated total: ~800 LOC of code + ~200 LOC of prose, spread across two-to-three PRs (see Plan phase).

---

## 3. Schema changes

### 3.1 `TenantSettings` JSONB additions
Three new optional string fields, no migration required (JSONB merge-on-write). Added in `app/apps/web/src/lib/tenant-settings.ts:TenantSettings`:

```ts
// ── Onboarding telemetry (WS-0) ──
/** ISO timestamp of the very first time the wizard rendered for this tenant.
 * Used to compute total onboarding duration on the `onboarding_completed` event. */
onboardingStartedAt?: string;
/** ISO timestamp of the first successful OAuth callback for this tenant.
 * Used as the TTFAA timer start per brief §2.1.1. Written by auth.ts jwt callback. */
ttfaaStartedAt?: string;
/** UUID correlating the OAuth callback start with the eventual first-visible-render,
 * so we can reliably match the pair even if the user logs out and back in mid-flight. */
ttfaaSessionId?: string;
```

### 3.2 `agent_traces` table — no change
Already supports the agents we care about. `build-tam` traces already land there (with a null registry entry, which is tolerated by `recordTrace` — but downstream alerting is silently disabled). Adding the registry entry fixes alerting without schema change.

### 3.3 No new indexes
Current `agent_traces` indexes (`tenantId`, `agentId`, `createdAt` composite) cover the query patterns in `observability-queries.ts`. Confirmed by reading `db/schema.ts agentTraces` definition (already has the needed composite index — verified in `app/apps/web/src/lib/observability.ts:getAgentHealth`).

### 3.4 No migration file
JSONB merge behavior means `onboardingStartedAt`, `ttfaaStartedAt`, `ttfaaSessionId` are absent on existing tenants and populated on next write. No backfill. Acceptable per brief §1.3 (WS-0 measures from rollout day forward).

---

## 4. Reference implementations in the existing codebase

Every new pattern introduced in WS-0 has a comparable precedent in Elevay. No new conventions.

### 4.1 PostHog event emission — server side
**New pattern:** `posthogEvents.onboarding_completed(distinctId, { userId, durationMs })` in `app/apps/web/src/app/api/onboarding/save/route.ts`.
**Reference:** the catalog already defines the shape; the helper function pattern in `app/apps/web/src/lib/analytics.ts:221-258` (`buildHelpers`) is what we forward to. The test file `app/apps/web/src/__tests__/analytics-events.test.ts:38-58` demonstrates the expected `fetch` mock + body shape.

### 4.2 PostHog event emission — client side
**New pattern:** `trackEvent(userId, "onboarding_step_completed", { step, stepIndex, durationMs })` inside `onboarding-wizard.tsx`.
**Reference:** `app/apps/web/src/components/posthog-provider.tsx:53-81` (`trackEvent` helper). Usage of the client tracker: the page-view tracker in the same file, lines 14-48, is the pattern for mounting an effect-driven emission.

### 4.3 LLM tracing for a new agent
**New pattern:** add `build-tam` entry to `AGENT_REGISTRY`.
**Reference:** `app/apps/web/src/lib/observability.ts:259-268` (the existing `"icp-analysis"` entry) is the nearest neighbor — same category (`extraction`), similar latency budget, similar eval sample rate. Copy the shape, adjust thresholds for TAM's heavier operation.

### 4.4 Auth callback side-effect emission
**New pattern:** emit `ttfaa_started` in the `jwt` callback when OAuth first succeeds.
**Reference:** `app/apps/web/src/auth.ts:325-352` already emits Inngest events (`google/oauth-connected`, `microsoft/oauth-connected`) from the same callback under the same conditions. Mirror that pattern for PostHog emission. Key: use the existing `account?.provider` + `token.tenantId && token.appUserId` guard.

### 4.5 Admin-only route
**New pattern:** `/api/admin/onboarding-metrics` gated to `role === "admin"`.
**Reference:** `app/apps/web/src/lib/auth-utils.ts getAuthContext()` returns `authCtx.role`; existing admin-gated routes use `if (authCtx.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });`. Scan for any existing admin route as the exact precedent (to confirm during Plan phase — pattern is standard).

### 4.6 Testing style
**Unit tests:** follow `app/apps/web/src/__tests__/analytics-events.test.ts` verbatim — `vi.resetModules()` between tests, `globalThis.fetch = fetchMock` for PostHog capture, assert `fetchMock.mock.calls[0]` body shape.
**E2E tests:** Playwright config lives at `app/apps/web/playwright.config.ts`. Follow the existing `tests/*.spec.ts` patterns. PostHog fetch should be intercepted via `page.route("**/capture/", ...)` and assertions run on the intercepted requests.

### 4.7 Query helper over a DB table
**New pattern:** `getOnboardingAgentLatency(tenantId, since): Promise<{ agentId, p50, p95, p99, errorRate }[]>` in `observability-queries.ts`.
**Reference:** `app/apps/web/src/lib/observability.ts:567-661` (`getAgentHealth`). Our new helper is a specialized projection — same Drizzle query style, same sort-then-percentile computation, scoped to onboarding agent IDs (`icp-analysis`, `build-tam`).

**No new pattern is introduced in WS-0.** Every addition mirrors an existing one. This is deliberate per brief §9.4 ("no pattern invention without precedent").

---

## 5. API surface

### 5.1 New exports in `app/apps/web/src/lib/analytics.ts`
No new exports — the existing `posthogEvents` helper map auto-covers new event names once they're added to `EventCatalog`. The 6 new helpers surface via the existing typed indexing.

### 5.2 New exports in `app/apps/web/src/lib/ttfaa.ts`

```ts
/** Emit ttfaa_started server-side. Idempotent per user (checks settings.ttfaaSessionId). */
export async function markTtfaaStarted(params: {
  userId: string;
  tenantId: string;
  provider: "google" | "microsoft-entra-id";
}): Promise<{ sessionCorrelationId: string; alreadyStarted: boolean }>;

/** Emit ttfaa_completed_v1_proxy server-side. Idempotent via settings.ttfaaCompletedAtV1Proxy.
 * Called from /api/home/hydrate when the hydrate payload first includes a summary with ≥1 enriched record. */
export async function markTtfaaCompletedV1Proxy(params: {
  userId: string;
  tenantId: string;
  enrichedRecordCount: number;
}): Promise<{ durationMs: number | null; alreadyCompleted: boolean }>;
```

Both return metadata about the emission for logging. Both are no-ops if already emitted. Both swallow all errors per the existing analytics convention.

### 5.3 New exports in `app/apps/web/src/lib/observability-queries.ts`

```ts
export interface OnboardingAgentLatency {
  agentId: "icp-analysis" | "build-tam";
  totalCalls: number;
  errorCount: number;
  errorRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  avgCostUsd: number;
  totalCostUsd: number;
}

/** Query agent_traces for the two onboarding-critical agents over a time window.
 * Scoped to a single tenant if tenantId is provided, otherwise global. */
export async function getOnboardingAgentLatency(params: {
  tenantId?: string;
  since: Date;
  until?: Date; // default now
}): Promise<OnboardingAgentLatency[]>;
```

### 5.4 New endpoint: `GET /api/admin/onboarding-metrics`

**Request:**
- Auth: session cookie with `role === "admin"`.
- Query params: `?since=YYYY-MM-DD&tenantId=<uuid>` (tenantId optional; defaults to global).

**Response** (200):
```ts
{
  generatedAt: string; // ISO
  window: { since: string; until: string };
  agentLatency: OnboardingAgentLatency[]; // from §5.3
  postHogFunnelProxyNote: string; // "PostHog funnels are not queryable without a PostHog API token — view in PostHog UI at <link>"
  bugInventory: Array<{ bugId: string; description: string; filedAt: string }>; // from §9
}
```

**Response** (403): `{ error: "Forbidden" }` when non-admin.
**Response** (500): `{ error: <message> }` on DB failure.

### 5.5 No new React components
All event emissions happen via hook effects inside the existing `<OnboardingWizard>` and `<HomePage>` components. No new UI.

### 5.6 No breaking changes
All changes are additive. No existing API signature mutates. No existing test breaks.

---

## 6. Architecture decisions (ADR-light)

### 6.1 ADR: Reuse PostHog, do not introduce a new vendor
**Decision:** extend the existing PostHog catalog and emission infra. Do not propose Segment, Mixpanel, or custom warehouse-based events.
**Alternatives considered:** Segment (multi-destination forwarding), Mixpanel (richer retention UI), self-hosted ClickHouse via a custom `events` table.
**Why this one wins:** (a) PostHog is already the source of truth for 60+ events in Elevay; switching would be a cross-cutting WS; (b) PostHog's funnel + cohort UI is sufficient for the brief's §6 success metrics; (c) WS-0 is a prerequisite — adding vendor complexity defeats the point; (d) we have zero PostHog events fired today on the onboarding funnel, so the marginal value of PostHog is immediate.
**Risk:** PostHog free-tier event caps. Confirm in Open Questions §8.

### 6.2 ADR: TTFAA start fires from the `jwt` callback, not from a middleware
**Decision:** `ttfaa_started` is emitted inside the NextAuth `jwt` callback in `auth.ts`, guarded by `account?.provider === "google" | "microsoft-entra-id"` and `token.tenantId && token.appUserId`.
**Alternatives considered:** (a) a Next.js middleware on `/home` that detects first-time visit; (b) a client-side emit on the `/home?onboarding=resume-connect` detection; (c) a server component that runs on the OAuth success redirect page.
**Why this one wins:** the `jwt` callback is the earliest server-authoritative moment where OAuth success is confirmed. Options (a) and (b) run client-side and are subject to ad-blockers and closed tabs. Option (c) duplicates the guard logic that already lives in `jwt`. The `jwt` callback also already emits `google/oauth-connected` Inngest events under the exact same condition — we're reusing a proven emission point. **This directly mirrors the existing pattern at `auth.ts:325-352`.**
**Caveat:** NextAuth `jwt` callback fires on every token refresh, not just sign-in. We guard with a DB check (is `ttfaaSessionId` already set?) before emitting. The check adds one SELECT per token refresh, which is cheap.

### 6.3 ADR: TTFAA v1 "proxy completion" signal fires in `/api/home/hydrate`, not in client
**Decision:** `ttfaa_completed_v1_proxy` is emitted server-side inside `/api/home/hydrate` when the hydrated summary has ≥1 enriched record AND `needsOnboarding === false`.
**Alternatives considered:** (a) client-side `useEffect` in `home/page.tsx` after state hydration; (b) an Inngest cron sweep that batches the completion check.
**Why this one wins:** (a) client-side emission is lost if the user closes the tab before React hydration, and the TTFAA definition in brief §2.1.1 is "wall-clock duration to first visible render" — a server-confirmed hydrate response qualifies as "visible render about to happen" within 200ms of server response in all measured cases. (b) cron batching adds latency and defeats the "measure real-time" intent. Server emission is the honest midpoint.
**V2 migration path:** when v2 of the onboarding ships (per brief WS-2 onward), `ttfaa_completed` (without `_v1_proxy` suffix) will be emitted at the three qualifying render points defined in brief §2.1.1 (confirmation card populated / warm lead draft visible / TAM reveal ≥1 company). The v1 proxy event and the v2 event coexist during the flag ramp so we can compare v1 vs v2 TTFAA on the same cohort.

### 6.4 ADR: `build-tam` registry entry is a bug fix, not a feature
**Decision:** include the `AGENT_REGISTRY` fix for `build-tam` in WS-0 even though it is technically a bug fix, not instrumentation.
**Alternatives considered:** file it as a separate bug (per brief §3 WS-0 note "If you spot a bug, file it, don't fix it").
**Why this one wins:** without the registry entry, `build-tam` traces land in `agent_traces` but with `agent = undefined`, which silently disables the alert thresholds (`maxLatencyMs`, `maxCostPerCall`, `qualityThreshold`) referenced at `observability.ts:420-430`. Our WS-0 dashboard will rely on these thresholds to identify friction. Without the fix, the dashboard shows "no alerts" for TAM even if it's taking 90s at p95 — **the instrumentation is broken, not just incomplete**. This is inside the scope of "wire instrumentation", not adjacent feature work.
**Counter-consideration for Martin:** if you prefer strict adherence to §3 ("file it, don't fix it"), I'll remove this from WS-0 and file `BUG-WS0-001: build-tam missing from AGENT_REGISTRY` as a separate 5-line PR. Flagging in Open Questions §8.

### 6.5 ADR: Latency of `enrich-icp`, `find-contacts`, `email-intelligence` is captured client-side, not server-side
**Decision:** wrap the 3 untraced-API fetches in `onboarding-wizard.tsx` with a small `measuredFetch(endpoint, init)` helper that fires `onboarding_api_latency { endpoint, durationMs, status, errorClass }` on completion.
**Alternatives considered:** (a) add server-side timing middleware; (b) add `tracedGenerateObject`-style wrappers to the 3 endpoints.
**Why this one wins:** (a) none of the 3 endpoints call LLMs — middleware would over-capture request durations for an unrelated set of endpoints. (b) wrapping non-LLM calls in `tracedGenerateObject` would pollute `agent_traces` with non-agent rows and break the current schema's semantics. Client-side measurement is the right granularity for end-user-felt latency, and PostHog's event-based analytics handles the aggregation natively.
**Caveat:** client-side measurement excludes the network tail (TLS handshake, DNS). That's fine for our use case (we want "felt duration"), and it's consistent with how Lightfield and Attio measure p95 latency from the user's perspective.

### 6.6 ADR: `ttfaaSessionId` is stored in `tenants.settings` JSONB, not a new table
**Decision:** `ttfaaSessionId` (UUID) and `ttfaaStartedAt` (ISO) are added as optional fields on the existing `TenantSettings` interface, persisted in `tenants.settings` JSONB.
**Alternatives considered:** new `ttfaa_events` table with a row per event pair.
**Why this one wins:** (a) WS-0 only needs the "has this tenant had its TTFAA timer started?" question answered once per user; a single field is sufficient. (b) JSONB merge-on-write is free — no migration. (c) if v2 needs richer TTFAA analytics, PostHog (not the DB) is the right place for it — raw events are in PostHog, durations are computed PostHog-side. The DB field exists only for the idempotency guard and the duration computation at completion.
**Caveat:** if Martin later wants per-session TTFAA timers (e.g., a user can re-enter onboarding multiple times), a new table becomes necessary. For v1 baseline, one-shot per user is correct.

### 6.7 ADR: No feature flag for WS-0
**Decision:** deploy the instrumentation to 100% of traffic on merge. No flag.
**Alternatives considered:** flag-gate the new event emissions to a 10% cohort, ramp over 7 days.
**Why this one wins:** (a) WS-0 is read-only instrumentation with no user-visible effect; (b) flagging would force us to synthesize a "baseline" from 10% of traffic, which is sparser signal than full coverage; (c) brief §4.2 forbids flags "because I'm in a hurry" — the anti-pattern is flags on UX changes, which WS-0 has none of. The brief's flag discipline kicks in at WS-2.
**Rollback strategy:** if event emission causes noticeable regression (e.g., PostHog endpoint returns 429 and fetches stack up), revert the PR — no state is persisted that can't be recomputed on redeploy.

---

## 7. Testing strategy

### 7.1 Unit tests (Vitest)
File: `app/apps/web/src/__tests__/onboarding-instrumentation.test.ts` (new, ~180 LOC).

Framework: **Vitest** (matches existing test suite, confirmed by reading `app/apps/web/vitest.config.ts` and the analytics-events test file).

Test cases:
1. **Catalog completeness:** `KNOWN_EVENT_NAMES` contains every new event (`onboarding_oauth_returned`, `onboarding_confidence_gaps_shown`, `onboarding_build_tam_triggered`, `onboarding_build_tam_completed`, `onboarding_build_tam_failed`, `onboarding_api_latency`). Extend the existing `analytics-events.test.ts` pattern.
2. **`markTtfaaStarted` idempotency:** first call fires event + sets `ttfaaSessionId`; second call returns `{ alreadyStarted: true }` without firing. Mock `updateTenantSettings` + `captureEvent`.
3. **`markTtfaaCompletedV1Proxy` idempotency + duration computation:** fires event with `durationMs = Date.now() - new Date(ttfaaStartedAt).getTime()`; second call returns `{ alreadyCompleted: true }`.
4. **`getOnboardingAgentLatency` percentile correctness:** seed `agent_traces` with 100 synthetic rows across `icp-analysis` and `build-tam`, assert p50/p95/p99 match the expected values within ±1ms rounding.
5. **`AGENT_REGISTRY` includes `build-tam`:** simple property check.
6. **`measuredFetch` wrapper:** mocks `fetch`, asserts the wrapper calls `trackEvent` with correct `{ endpoint, durationMs, status }` on success and `{ status: -1, errorClass }` on throw.
7. **Admin endpoint auth:** non-admin gets 403, admin gets 200 with expected shape.

### 7.2 Integration test (Vitest with DB)
Extend the existing pattern in `app/apps/web/src/__tests__/pipeline-analytics-api.test.ts` (same test class — API route with DB reads). Test `/api/admin/onboarding-metrics` end-to-end against a seeded test DB.

### 7.3 E2E test (Playwright)
File: `app/apps/web/tests/e2e/onboarding-instrumentation.spec.ts` (new, ~150 LOC).

Pattern: follow the existing e2e tests in `app/apps/web/tests/` (scan during Plan phase to pick the nearest precedent).

Flow:
1. Sign up a fresh test user via `/sign-up`.
2. Skip email verification.
3. Intercept `**/capture/` requests using `page.route(...)` and collect all PostHog payloads in an array.
4. Walk through welcome → connect (skip) → product → icp → build → ready.
5. Assert the sequence of captured events matches the expected ordering:
   - `onboarding_started`
   - `onboarding_step_completed` × 5 (welcome, connect, privacy-skipped, product, icp)
   - `onboarding_skipped { step: "connect" }` (if connect is skipped)
   - `onboarding_confidence_gaps_shown` (if LLM returns gaps)
   - `onboarding_build_tam_triggered`
   - `onboarding_build_tam_completed` OR `onboarding_build_tam_failed`
   - `onboarding_api_latency` × 3 (enrich-icp, find-contacts, email-intelligence)
   - `onboarding_completed { durationMs }`
   - `ttfaa_completed_v1_proxy` (on `/home` hydrate after completion)

6. Assert `durationMs` > 0 and reasonable (< 10 minutes) on `onboarding_completed`.

### 7.4 Manual verification checklist (for exit condition)
- Martin signs up a fresh test user on a Chrome desktop viewport 1280×720, completes the onboarding with Google OAuth, confirms the PostHog dashboard shows the expected event sequence within 2 minutes.
- Martin queries `/api/admin/onboarding-metrics?since=2026-04-21` and receives a 200 with `agentLatency` entries for `icp-analysis` and `build-tam`.
- Martin reviews the WS-0 PostHog dashboard (the one built per `docs/specs/WS-0-posthog-dashboard.md`) and confirms the funnel view is populated, drop-off per step is visible, TTFAA distribution histogram renders.

### 7.5 Load / stress
No load testing needed for WS-0. Event emission is fire-and-forget via PostHog; no new synchronous critical path is introduced. The admin endpoint is read-only, rate-limited by `checkRateLimit("admin", userId)` (existing helper).

### 7.6 Failure mode coverage (transversal — applies to WS-0)
Referencing brief §4.4 severity tiering:

- **Severity 1 — PostHog unreachable:** existing `captureEvent` already swallows fetch failures (line 68-72 of `analytics.ts`). Verified by the existing test `analytics-events.test.ts:71-81`. No new code needed.
- **Severity 1 — `recordTrace` DB insert fails:** existing `observability.ts:451-454` logs and swallows. No change.
- **Severity 1 — `markTtfaaStarted` fails to write `ttfaaSessionId`:** swallow and log via `logger.warn`. The TTFAA end event will be missing, which is acceptable for the v1 proxy (one-shot, best-effort).
- **Severity 3 — Admin endpoint DB query fails:** return `{ error: <message> }` 500 with human-readable text. The admin dashboard displays "Metrics unavailable — check server logs".
- **Severity 4 — All analytics down (PostHog + DB):** product continues to function normally. No user-facing impact. Log a persistent daily warning via `logger.error` so Martin notices.

---

## 8. Rollout and rollback

### 8.1 Rollout
- Deploy to 100% on merge. No feature flag (see §6.7 ADR).
- Validate the PostHog events are flowing by checking the Live Events view in PostHog within 30 minutes post-deploy.
- Populate the WS-0 PostHog dashboard per `docs/specs/WS-0-posthog-dashboard.md`. Martin applies the config via PostHog UI.
- Verify `/api/admin/onboarding-metrics` returns expected data.
- Let traffic flow for 3 days or until ≥30 distinct signup sessions are captured (brief WS-0 exit condition).

### 8.2 Rollback
- `git revert <merge-sha>` the PR. No data state must be undone.
- `ttfaaSessionId`, `ttfaaStartedAt`, `onboardingStartedAt` remain in `tenants.settings` JSONB on affected tenants. They're unused post-revert; no harm.
- PostHog events already captured remain in PostHog. They're additive signal, not destructive.

### 8.3 Partial rollout scenarios
Not applicable. WS-0 is all-or-nothing.

### 8.4 Observability during rollout
- Watch the Vercel deploy logs for fetch failures to PostHog (429, 5xx).
- Watch `agent_traces` row count per hour — should NOT change materially (we're not adding new LLM calls, only adding a registry entry).
- Watch `/api/home/hydrate` p95 latency — should NOT change (server emission of `ttfaa_completed_v1_proxy` is async, non-blocking, see §6.3).

---

## 9. Open questions for Martin

Questions Claude Code cannot decide alone and needs direct input on before WS-0 enters Plan phase.

### 9.1 PostHog event volume cap
**Question:** is the current PostHog plan event cap sufficient for a ~12× event emission uplift on onboarding alone? Rough estimate: 150 signups/month × 10 events/user ≈ 1,500 onboarding events/month, negligible on PostHog paid tier but possibly material on free tier.
**My default if no answer:** proceed. Migrate to paid tier if the monthly cap is breached, which we'll notice immediately on the PostHog billing page.

### 9.2 `build-tam` registry fix — include or defer?
**Question:** per §6.4 ADR, including the `AGENT_REGISTRY` fix in WS-0 technically violates brief §3 ("file it, don't fix it"), but excluding it breaks half the alerting WS-0 depends on. Martin to decide.
**My default:** include it. The fix is 12 LOC and is part of the instrumentation scope, not a feature-adjacent bug.

### 9.3 Admin role definition
**Question:** how is `role === "admin"` currently determined? I see `session.user.role` set in `auth.ts:361`, but it's sourced from `resolveUserTenant`. Is there a manual process to grant admin to a user, or is it via a DB flag?
**My default:** grep and conform to existing pattern. Surface the answer in the Plan phase.

### 9.4 PostHog dashboard ownership
**Question:** who applies the `WS-0-posthog-dashboard.md` spec to the actual PostHog UI? Martin, or does the dev team have PostHog admin access?
**My default:** Martin applies it; the spec is copy-paste ready.

### 9.5 TTFAA v1 proxy definition precise boundary
**Question:** for v1, the brief §2.1.1 says TTFAA stops at "first visible render". The v1 wizard's `ready` screen is 30-90s after TAM build, not the sub-90s target. Should the v1 proxy stop at (a) the `ready` screen render, or (b) the `/home` dashboard render after the user clicks "Go to your engine"? My default §6.3 picks (b) because the brief also says "the user sees the draft and the 'sent (undo 60s)' state in one continuous visible flow" — implying dashboard-land is the v1 equivalent of "value visible on screen".
**My default:** (b) — `/home` hydrate after onboarding completion. Confirm or override.

### 9.6 Bug inventory surface
**Question:** the master brief §3 WS-0 note says "If you spot a bug, file it". Where should bugs be filed — Linear, GitHub issues, a `docs/bugs/` folder, or an append-only field in the admin endpoint response (§5.4 lists `bugInventory` there)?
**My default:** propose a `docs/bugs/WS-0-discovered.md` file that lists every bug the audit surfaced (I have 8-10 candidates from the 2026-04-21 audit), each with a one-line description and a severity tag.

### 9.7 Existing admin routes precedent
**Question:** is there already an admin-gated API route in the codebase I should mirror? I'll grep during Plan phase, but flagging here in case Martin wants to name a specific precedent.
**My default:** `settings/**` or `admin/**` — whichever is most similar. Flag in Plan.

### 9.8 Does WS-0 need a dedicated PR or can it be a series?
**Question:** brief §9.2 says "each PR should be reviewable in under 30 minutes" and "if a PR would exceed ~400 LOC changed, it must be split". WS-0 is ~800 LOC code + 200 prose. That's at least 2 PRs. Proposed split:
- PR 1: catalog extension + TTFAA helpers + `build-tam` registry fix + new DB fields. ~300 LOC.
- PR 2: wizard + home page + auth.ts emission wiring + e2e test + admin endpoint. ~400 LOC.
- PR 3: observability-queries + unit tests + dashboard spec. ~300 LOC + prose.

**My default:** 3 PRs as above. Martin to confirm or re-slice.

### 9.9 What's the "admin" UX for reviewing the dashboard?
**Question:** section 5.4's `/api/admin/onboarding-metrics` is a JSON endpoint. Should we also build a minimal admin page to render it, or is JSON + PostHog dashboard sufficient for Martin's review of the exit condition?
**My default:** JSON-only for WS-0. An admin page is a nice-to-have and would expand scope. PostHog UI is the intended primary surface. Confirm.

---

## 10. Exit condition (restated for clarity)

WS-0 is complete when **all** of the following hold:

1. The master brief WS-0 exit condition is met: Martin has reviewed the PostHog dashboard, the 3-day rolling drop-off funnel is populated with ≥30 distinct signup sessions, and the 2 highest-friction steps in v1 have been identified with numbers (% drop-off, p95 duration).
2. The WS-0 retrospective (`docs/specs/WS-0-retro.md`) is written with the WS-0 numbers captured. This becomes the baseline for every subsequent workstream's regression check.
3. `/api/admin/onboarding-metrics?since=<3 days ago>` returns a 200 with non-empty `agentLatency` entries for both `icp-analysis` and `build-tam`.
4. The bug inventory (`docs/bugs/WS-0-discovered.md`) is populated with every audit-surfaced bug (not fixed, only documented), so WS-2+ have a clear "in the way" list.
5. All Vitest + Playwright tests added in this workstream pass on CI.
6. No regression in existing onboarding completion rate (i.e., WS-0 instrumentation did not accidentally break the wizard).

---

## 11. What this spec deliberately excludes (cross-ref with brief §7)

- Visual design of the admin metrics JSON response.
- Copywriting of any user-facing string (there are none — WS-0 has zero user-visible surface).
- Retroactive event backfill for existing tenants.
- PostHog dashboard creation automation via the PostHog API (manual UI config is acceptable).
- Any change to the Inngest onboarding function or the TAM build flow.

---

## 12. Approval

Martin: review this spec and respond with one of:
- **Approve** — I'll proceed to write `docs/specs/WS-0-plan.md`.
- **Approve with changes** — I'll incorporate the listed changes into this spec file and request re-review.
- **Reject** — I'll rewrite from scratch with the listed blocking concerns.

**Do NOT approve until the open questions in §9 have at least defaults or explicit answers.** The Plan phase locks these decisions.

End of spec.
