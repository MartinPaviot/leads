# Dashboard metrics — tenant-scoping + definition audit (2026-06-26)

Audited tenant-scoping and metric-definition consistency across ~25 dashboard/reporting endpoints (7 parallel agents). First concrete slice of build item #8 (single-source-of-truth metric layer) from `elevay-vs-monaco-grounded-delta-2026-06-26.md`.

## Cross-tenant leaks found: 2 (both fixed in this PR)
| file:line | metric | severity | status |
|---|---|---|---|
| `dashboard/summary/route.ts:86-88` | `weekSummary.sequencesLaunched` — weekly `count(*)` of `sequenceEnrollments`, filtered only on `enrolledAt` → counts **every tenant's** enrollments | high | FIXED |
| `dashboard/summary/route.ts:90-97` | prev-week twin of the above | high | FIXED |

Root cause: `sequenceEnrollments` has **no `tenantId` column** (`db/schema/outbound.ts:92-109`), so the count must be confined via the `sequences.tenantId` join. (The naive "add `eq(sequenceEnrollments.tenantId, …)`" does not compile.) Fixed via `weeklyEnrollmentWhere()` in `app/api/dashboard/_summary-metrics.ts`.

**No leaks anywhere else.** All other clusters (pipeline, reports, home, dashboard-misc, analytics, misc-metrics) are tenant-scoped — every aggregate is gated by a direct `tenantId` filter or a tenant-scoped join. `admin/onboarding-metrics`'s global aggregation is intentional + `requireAdmin`-gated.

## Metric-definition defects in summary (tenant-scoped, not leaks — fixed in this PR)
- `totalValue` (`:214`) summed **all** stages incl. won/lost → inflated `founderMetrics.pipelineValue`. Now OPEN-only.
- `activeDeals` (`:215`) was a bare `count(*)` → counted won/lost. Now OPEN-only.
- Both via `CASE WHEN stage NOT IN ('won','lost')` conditional aggregation (the WHERE is untouched so the same query's `wonValue`/`wonCount`/`lostCount` → `winRate` still work).

## Canonical definitions (the reference these now match)
- **Pipeline value** = `SUM(value) WHERE stage NOT IN ('won','lost')` — anchor `dashboard/pipeline/route.ts:57`.
- **Active/open deals** = `COUNT WHERE stage NOT IN ('won','lost')` (exclusion, so default `lead` counts as open) — anchor `dashboard/pipeline/route.ts:32/:99`.
- **Weekly enrollment count** = enrollments this week confined to the caller via the `sequences.tenantId` join.

## Follow-ups (out of scope here — for the broader #8)
- `reports/generate/route.ts:107` has the **same all-stages pipeline-value defect** as summary did (tenant-scoped, not a leak). Reconcile to the canonical predicate.
- `analytics/forecast` + `pipeline/analytics` use a 6-stage **allowlist** that excludes `lead` — a narrower definition than canonical; decide which is intended and converge.
- The durable #8 fix is a single canonical read module so home / pipeline / reports never diverge again.
