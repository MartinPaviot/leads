# 23 — reports (`/reports`) — audit d'hydratation

**Verdict global : H2 (partiel).** The /reports page is mostly faithful: the two always-on cards (RevenueForecast, CohortInsights) and the on-demand AI report are all wired to real, tenant-scoped data via GET /api/analytics/forecast, GET /api/analytics/cohorts, and POST /api/reports/generate — each authenticates with getAuthContext() and filters every query by eq(tenantId), with independent loading spinners, written empty states (notably cohorts' honest 'too few deals'/'nothing stands out'), and per-card error cards that degrade independently. The one real fidelity gap is the 'Recent Reports' history, which is backed solely by browser localStorage rather than per-tenant server storage, so it is not tenant-scoped, leaks across tenants/users on a shared browser, and is lost on device switch. The report-type cards are static chrome (action triggers), which is acceptable H0.

Entrée : `app/apps/web/src/app/(dashboard)/reports/page.tsx`.

## Éléments

| Élément | file:line | Source (file:line) | État | Tenant | Loading | Empty | Error | Fresh | Note |
|---------|-----------|--------------------|------|--------|---------|-------|-------|-------|------|
| Revenue forecast — headline range (mean / p10-p90 / CV%) | app/apps/web/src/app/(dashboard)/reports/_revenue-forecast.tsx:154-161 | GET /api/analytics/forecast → computeRevEquation; deals+outboundEmails aggregated, eq(tenantId) (app/apps/web/src/app/api/analytics/forecast/route.ts:30-100) | H1 | yes | spinner | handled | independent | once | faithful: real tenant-scoped funnel math, loading spinner, error card, null-guards |
| Revenue forecast — expected closed-won deals + ACV | app/apps/web/src/app/(dashboard)/reports/_revenue-forecast.tsx:162-165 | forecast route expectedDeals + inputs.acv from won/open deal value split (route.ts:62-100) | H1 | yes | spinner | handled | independent | once | faithful |
| Revenue forecast — bottleneck badge + coverage ratio + diagnosis | app/apps/web/src/app/(dashboard)/reports/_revenue-forecast.tsx:167-178 | forecast route result.bottleneck/coverage/diagnosis (route.ts:88-107) | H1 | yes | spinner | handled | independent | once | faithful; coverage self-hides when null |
| Revenue forecast — confidence badge (prior/blending/data-dominated) | app/apps/web/src/app/(dashboard)/reports/_revenue-forecast.tsx:150 | forecast route result.dataConfidence | H1 | yes | spinner | handled | independent | once | faithful |
| Revenue forecast — monthly goal input value | app/apps/web/src/app/(dashboard)/reports/_revenue-forecast.tsx:187-200 | GET/POST /api/analytics/revenue-goal (fetched in load(), _revenue-forecast.tsx:69-78,91-110) | H1 | unknown | spinner | handled | independent | once | value loaded from revenue-goal route and persisted on save; route not read here but follows same auth pattern (goal also reflected via tenant settings jsonb in forecast route.ts:82-86). tenant-scoping of the goal route itself not directly verified |
| Revenue forecast — funnel rates (6 stages, yours/prior source pill) | app/apps/web/src/app/(dashboard)/reports/_revenue-forecast.tsx:208-230 | forecast route result.rates + rateSource (computeRevEquation, route.ts:88-101) | H1 | yes | spinner | handled | independent | once | faithful; honestly labels benchmark-prior vs observed per stage |
| Revenue forecast — notes / caveats list | app/apps/web/src/app/(dashboard)/reports/_revenue-forecast.tsx:233-242 | forecast route result.notes | H1 | yes | spinner | handled | independent | once | faithful; self-hides when empty |
| Cohort insights — total closed deals analyzed | app/apps/web/src/app/(dashboard)/reports/_cohort-insights.tsx:114 | GET /api/analytics/cohorts → rows.length, eq(tenantId) inArray won/lost (app/apps/web/src/app/api/analytics/cohorts/route.ts:31-41,68) | H1 | yes | spinner | handled | independent | once | faithful |
| Cohort insights — honest summary / empty state | app/apps/web/src/app/(dashboard)/reports/_cohort-insights.tsx:119-122 | cohorts route summary (route.ts:69-78) | H1 | yes | spinner | handled | independent | once | faithful; written 'too few/no segment stands out' empty state — matches Home reference bar |
| Cohort insights — significant segments rows (lift, rate, won/n, recommendation) | app/apps/web/src/app/(dashboard)/reports/_cohort-insights.tsx:124-135 + 39-55 | cohorts route insights[] from classifyCohorts (Fisher+BH) (route.ts:64-66) | H1 | yes | spinner | handled | independent | once | faithful; self-hides when none |
| Cohort insights — worth-testing hypotheses rows | app/apps/web/src/app/(dashboard)/reports/_cohort-insights.tsx:137-148 | cohorts route hypotheses[] (route.ts:66) | H1 | yes | spinner | handled | independent | once | faithful; self-hides when none |
| On-demand report cards (Pipeline/Weekly/Win-Loss titles, descriptions, badges) | app/apps/web/src/app/(dashboard)/reports/page.tsx:97-125,260-332 | static const reportTypes (page.tsx:97-125) | H0 | n/a | n/a | n/a | n/a | static | chrome: these are action triggers, not data displays; acceptable H0 |
| Generated report body (title, summary, metrics, sections, recommendations) | app/apps/web/src/app/(dashboard)/reports/page.tsx:400-516 | POST /api/reports/generate → tracedGenerateObject over tenant deals/activities/contacts/companies, eq(tenantId) (app/apps/web/src/app/api/reports/generate/route.ts:90-340) | H1 | yes | spinner | n/a | independent | once | faithful: AI-generated from real tenant-scoped CRM data; progress steps + error card; on-demand so no empty-on-load (renders only after generate) |
| Recent reports history list (title, badge, time-ago) | app/apps/web/src/app/(dashboard)/reports/page.tsx:518-567 | browser localStorage 'elevay-report-history' (page.tsx:28-47,139-141) | H2 | no | none | handled | silent | static | history is client-only localStorage, NOT tenant-scoped server data: shared across tenants on the same browser, lost on device switch, and survives across user logout on same machine; reads of generated reports persist client-side only. Self-hides when empty but is not real server-backed per-tenant history |

## Pires défauts

1. Recent Reports history is client-only localStorage, not tenant-scoped server data — it is shared across tenants/users on the same browser and lost on device switch (app/apps/web/src/app/(dashboard)/reports/page.tsx:28-47,518-567)
2. Monthly revenue-goal value is read from /api/analytics/revenue-goal but that route's tenant-scoping was not directly verified in this audit; the goal also round-trips through tenant settings jsonb in the forecast route (app/apps/web/src/app/(dashboard)/reports/_revenue-forecast.tsx:69-110)
3. Always-on analytics fetch once on mount with no refetch/poll, so forecast and cohort numbers can silently go stale until a manual reload (app/apps/web/src/app/(dashboard)/reports/_revenue-forecast.tsx:87-89; _cohort-insights.tsx:62-77)

## Résolution (P1 23 — fixed)

- **Defect #1 (cross-tenant localStorage leak):** FIXED. The history stored the full
  `ReportData` under a fixed key (`elevay-report-history`), so on a shared machine the
  next tenant/user saw the prior tenant's complete reports (survived logout). Now:
  (a) the key is scoped by `tenantId` resolved from `/api/auth/session`
  (`elevay-report-history:<tenantId>`); (b) `saveHistory` is a no-op until the tenant is
  known, so history is in-memory only until then — never persisted under a shared key;
  (c) the legacy unscoped key is `removeItem`'d on mount to purge any already-leaked
  content. `loadHistory`/`saveHistory` now take the scoped key (page.tsx:31-55, 138-165, ~205).
- **Defect #2 (revenue-goal tenant scope unverified):** the route was not changed; left
  as a verification follow-up (it round-trips through tenant settings jsonb, which is
  tenant-scoped by construction).
- **Defect #3 (fetch-once staleness):** NOT changed — P2 polish (add focus/poll refetch),
  deferred.

Verdict after fix: the history leak (the real fidelity gap) is closed; the page's
analytics lanes were already H1.
