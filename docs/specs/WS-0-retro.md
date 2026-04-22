# WS-0 — Instrumentation baseline — Retro

**Status:** Shipped — PRs #5, #8, #9 (`9a1d937`, `6a3560e`, `7f52179`)

## What shipped

### PR 1 — Foundations (`9a1d937`)
- `lib/ttfaa.ts` — Time-To-First-Autonomous-Action helper with `markTTFAA()`
  and `getTTFAA()`. Records the timestamp of the first agent-initiated action
  per tenant, used to measure onboarding→value latency.
- `lib/analytics.ts` — PostHog event helpers: `trackOnboardingStep()`,
  `trackOnboardingComplete()`, `trackTTFAA()`, `identifyUser()`.
- `components/posthog-provider.tsx` — PostHog React provider for client-side
  event capture.
- Tests: `ttfaa.test.ts`, `analytics-events.test.ts`.

### PR 2 — Wiring (`6a3560e`)
- Onboarding wizard steps wired to `trackOnboardingStep()` on each save.
- Auth callback wired to `identifyUser()`.
- Hydration endpoint wired to `trackOnboardingComplete()`.
- TTFAA checkpoint wired to `trackTTFAA()` on first agent send.

### PR 3 — Queries + admin endpoint (`7f52179`)
- `GET /api/admin/onboarding-metrics` — returns funnel snapshot:
  total tenants, completion rate, avg steps, p50/p95 TTFAA, dropoff by step.
- `docs/specs/WS-0-posthog-dashboard.md` — PostHog dashboard configuration
  reference (6 panels: funnel, TTFAA histogram, dropoff heatmap, daily
  completions, step duration, cohort retention).

## Baseline metrics (to populate after first production week)

These KPIs should be recorded after the first 7 days of production data:

| Metric | Target | Actual (day 7) |
|--------|--------|----------------|
| Onboarding completion rate | >60% | _pending_ |
| TTFAA p50 | <24h | _pending_ |
| TTFAA p95 | <72h | _pending_ |
| Step dropoff peak | Identify worst step | _pending_ |
| Daily completions trend | Stable or rising | _pending_ |

## PostHog dashboard setup

Apply `docs/specs/WS-0-posthog-dashboard.md` in the PostHog UI:

1. Create dashboard "Onboarding Health"
2. Add 6 insights per the spec (funnel, TTFAA, dropoff, daily, duration, retention)
3. Set refresh interval to 1h
4. Share with team

## What worked well

- The TTFAA concept proved useful — it's now referenced by WS-1 trust score
  (first autonomous action triggers initial trust calibration) and WS-5
  retro (success metric #2).
- Wiring PostHog at the provider level meant all subsequent WS components
  get tracking for free.

## What to watch

- PostHog event volume: at scale, `trackOnboardingStep()` fires per-step
  per-user. Current volume is negligible but should be monitored if tenant
  count exceeds 10k.
- The admin endpoint has no pagination — fine for <1000 tenants, needs
  cursor pagination beyond that.
