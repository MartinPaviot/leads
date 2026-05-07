# MONACO-PARITY P0-2 — Visitor-ID (Snitcher) RUNBOOK

Operational manual for the anonymous-visitor identification surface.
Linked from the hot-visitors widget tooltip and from the cap-alarm
description fields.

## What the system does

A 1×1 pixel on the marketing site fires a POST to
`/api/v1/visit/track` on every page view. We persist the visit to
`visits` (one row per pageview, deduped by session) with the
visitor's hashed IP, URL, referrer, UTM tags. An Inngest worker
then calls Snitcher with the raw IP — Snitcher returns the
visitor's company (B2B IP→firmographic match, no person identity).
The matched company is upserted into the tenant's `companies`
table, the visit row is back-filled with `company_domain`, and two
events fire :
  1. `company/created` (when new) → kicks the enrichment pipeline.
  2. `signals/auto-enroll` → the existing signal-to-sequence
     worker decides whether to enroll contacts at this company.

Two safety rails sit in front of the provider call :
- **Spend cap** : per-tenant monthly USD limit (default $50).
  Once reached, the worker stops calling Snitcher until the next
  month resets.
- **Dedup window** : same IP / company within last N days (default
  7d) reuses the prior identification instead of paying again.

## Core invariants

- The provider returns ONLY a company domain — never a person
  identity. The B2B IP→firmographic match is firmographic (legal
  entity), not personal data.
- Raw IPs are never stored ; only SHA-256 hashes.
- Identification is best-effort. The visit row always lands ;
  identification fills in the company asynchronously when
  available. Failure modes (provider down, no match, cap reached)
  leave `companyDomain = NULL` rather than dropping the visit.
- Cache hits skip provider call AND skip event fan-out (the events
  fired the first time around — re-firing would spam auto-enroll).

## Data flow

```
pixel POST /api/v1/visit/track
        │
        ▼
visits insert (tenant_id, visitor_id, ip_hash, url, referrer, …)
        │
        ▼
inngest.send("visit/created", { visitId, tenantId, ip })
        │
        ▼
identifyVisit (Inngest worker)
        │
        ├──→ checkSpendCap → reached? skip with `cap_reached`
        │
        ├──→ checkDedup → cache hit? copy prior result, skip provider
        │
        ├──→ provider.identify(ip, ua) → null? mark attempted, skip
        │
        ▼
upsertCompany (returns isNew)
        │
        ▼
visits.update(companyDomain, companyId, identifiedAt, identifiedBy)
        │
        ▼
planFanout({ isNew, fromCache: false }) → events
        │
        ▼
inngest.send([company/created (if new), signals/auto-enroll])
        │
        ▼
existing enrich pipeline + signal-to-sequence worker handle it
```

## Key files

| Concern | File |
|---|---|
| Pixel endpoint | `app/api/v1/visit/track/route.ts` |
| Identify worker | `inngest/identify-visit.ts` |
| Provider abstraction | `lib/visitor-id/provider.ts` |
| Snitcher provider | `lib/visitor-id/snitcher.ts` |
| Spend cap | `lib/visitor-id/spend-cap.ts` |
| Dedup window | `lib/visitor-id/dedup.ts` |
| Fan-out planner | `lib/visitor-id/fanout.ts` |
| Pixel ping recorder | `lib/inbound/record-visitor.ts` |
| Hot-visitors API | `app/api/dashboard/hot-visitors/route.ts` |
| Hot-visitors widget | `components/hot-visitors-widget.tsx` |
| Visits schema | `db/schema/onboarding-and-visitors.ts` |

## Per-tenant configuration

`tenants.settings` jsonb keys :

| Key | Default | Range | Purpose |
|---|---|---|---|
| `snitcherMonthlyCapUsd` | 50 | [0, 5000] | Hard monthly spend cap. Worker stops calling provider once reached. |
| `visitorIdDedupWindowDays` | 7 | [1, 90] | Reuse prior identification if same IP / company within window. |

Set via SQL :
```sql
UPDATE tenants
SET settings = jsonb_set(settings, '{snitcherMonthlyCapUsd}', '200'::jsonb)
WHERE id = '...';
```

## Datadog metrics

The worker emits these via the structured-logger metrics dispatcher
(swappable for Datadog Statsd in `lib/observability/metrics.ts`) :

| Metric | Type | Tags | When |
|---|---|---|---|
| `visitor_id.cap_reached` | count | provider | Spend cap hit, identification skipped |
| `visitor_id.cap_warning` | count | provider | Within $5/10% of cap |
| `visitor_id.monthly_spend_usd` | histogram | provider | Every identification attempt |
| `visitor_id.dedup_hit` | count | provider, matched_by | Cache reuse |
| `visitor_id.matched` | count | provider | Provider returned a company |
| `visitor_id.no_match` | count | provider | Provider returned null |
| `visitor_id.confidence` | histogram | provider | When provider scores confidence |

## Alarms & on-call playbook

### `visitor_id.cap_reached` > 0 in last hour

A tenant has burned through their monthly cap. The pixel keeps
firing and visits keep landing — they just don't get identified
until next month.

**Investigate**
1. Check the tenant's `snitcherMonthlyCapUsd` — is it set
   intentionally low ?
2. Inspect identification volume — is there a noisy crawler or
   compromised pixel ? Look at `visits` filtered by
   `created_at > NOW() - 1h` group by user_agent.

**Fix path**
- If legitimate spike : bump the cap via SQL (above).
- If crawler / abuse : add IP / UA filter at the pixel endpoint.
- If pixel was leaked : rotate the tenant's pixel key.

### `visitor_id.matched` rate < 30% of attempts

Snitcher is degraded OR the tenant's traffic is mostly
residential (won't match). Healthy B2B sites match 40-60%.

**Investigate**
1. Check Snitcher status page.
2. Check user-agent distribution of `visits` — high mobile / consumer
   ratio = expected lower match rate.

**Fix path**
- Snitcher down → wait for them OR switch provider via
  `getVisitorIdProvider()` (currently hardcoded to Snitcher ;
  per-tenant override is a follow-up).
- Traffic-quality issue → not a defect, surface in the dashboard.

### `visitor_id.dedup_hit` rate > 80%

Most identifications are cache reuses — that's GOOD economically
(saving spend) but might mean the same office is hammering the
pixel. Investigate if it correlates with crawlers.

### `signals/auto-enroll` not firing despite matched visits

**Investigate**
1. Check Inngest dashboard for the auto-enroll worker — are events
   landing ?
2. Check tenant has at least one `active` sequence with a trigger
   compatible with website-visit signals.
3. Sample a recent identified visit and verify the event payload —
   was `companyId` non-null ?

**Fix path**
- No active sequence : create one in the sequences page.
- Worker errored : Inngest auto-retries ; check the dead-letter
  trace.

## Manual operations

### Force re-identification of a visit
```sql
UPDATE visits
SET company_domain = NULL,
    company_id = NULL,
    identified_at = NULL,
    identified_by = NULL
WHERE id = '...';
```
Then emit the event manually :
```ts
await inngest.send({
  name: "visit/created",
  data: { visitId: "...", tenantId: "...", ip: "..." },
});
```

### Audit current month's identifications for a tenant
```sql
SELECT
  COUNT(*) FILTER (WHERE company_domain IS NOT NULL) AS matched,
  COUNT(*) FILTER (WHERE identified_at IS NOT NULL AND company_domain IS NULL) AS no_match,
  COUNT(*) FILTER (WHERE identified_at IS NULL) AS pending
FROM visits
WHERE tenant_id = '...'
  AND created_at >= date_trunc('month', NOW());
```

### Switch a tenant from Snitcher to a different provider
Currently the resolver returns Snitcher unconditionally. To switch :
1. Add the provider implementation to `lib/visitor-id/`.
2. Modify `getVisitorIdProvider()` in `snitcher.ts` to read from
   `tenants.settings.visitorIdProvider`.
3. Set the tenant's preference :
   ```sql
   UPDATE tenants
   SET settings = jsonb_set(settings, '{visitorIdProvider}', '"rb2b"'::jsonb)
   WHERE id = '...';
   ```

## Test coverage map

| Concern | Test |
|---|---|
| Provider stub-safety | `__tests__/visitor-id-snitcher.test.ts` |
| Spend cap | `__tests__/visitor-id-spend-cap.test.ts` (22 tests) |
| Dedup window | `__tests__/visitor-id-dedup.test.ts` (20 tests) |
| Fan-out planner | `__tests__/visitor-id-fanout.test.ts` (11 tests) |
| Hot-visitors widget | `components/__tests__/hot-visitors-widget.test.tsx` (8 tests) |

Total : 65+ tests. The Inngest worker itself is exercised via the
pure helpers ; an integration test against a live Snitcher key
is gated behind `SNITCHER_API_KEY` and runs in the staging cron.

## Open issues / future work

- **Subnet-hash dedup column** — `dedup.ts` exposes
  `hashSubnet(ip)` but the schema doesn't store it on `visits`
  yet, so /24-subnet matching is dormant. Add a column +
  backfill, then enable the `or(eq(ipHash), eq(subnetHash))` path
  in the worker.
- **Per-tenant provider override** — currently every tenant uses
  Snitcher. Add a `tenants.settings.visitorIdProvider` enum
  ("snitcher" | "rb2b" | "clearbit_reveal" | "none") and an
  RB2B / Clearbit provider class that conforms to the existing
  interface.
- **Charge ledger table** — spend tracking currently counts
  identified visits × rate. A dedicated `visitor_id_charges`
  table per call would let us show exact charges in the
  dashboard (matters when providers vary their rates).
- **Hot-visitor → action button** — the widget surfaces "Open
  deal" / "in sequence" badges but doesn't expose a "create
  deal" / "start sequence" CTA when neither is present. Add a
  small button row that fires the existing endpoints.
- **Sequence-trigger config UI** — auto-enroll only fires for
  tenants whose sequences have a trigger compatible with
  `website_visit` signals. Currently configured via API only ;
  needs a UI in `/sequences/[id]/triggers`.
- **Cap-warning banner in dashboard** — telemetry surfaces the
  warning but no UI element is wired. Add a banner at the top
  of `/dashboard` when `visitor_id.cap_warning` fires for the
  tenant in the last 1h.

_Last updated_ : 2026-05-07
