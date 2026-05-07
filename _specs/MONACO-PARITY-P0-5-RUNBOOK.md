# MONACO-PARITY P0-5 — Deal Autofill RUNBOOK

Operational manual for the deal autofill cascade. This runbook is
referenced from the Datadog dashboard (`deal-autofill.yaml`) and
linked from the deal page tooltip in the UI.

## What the system does

The autofill cascade continuously updates `deals.properties` from
extracted signals (emails + transcripts + manual edits). Every field
on the deal that the cascade touches lands as a `PropertyEntry` :

```json
{
  "value": "$50K",
  "source": "email",
  "date": "2026-04-15T10:00:00Z",
  "manual": false,
  "confidence": 0.92
}
```

Source attribution is visible to the user via the `<DealPropertyCell>`
tooltip on `/opportunities/[id]`.

## Data flow

```
inbound email ─┐
transcript    ─┼─→ enrichment-email-extract ──→ enrichment/signals-extracted
manual edit   ─┘                                          │
                                                          ▼
                                            sync-signals-to-deal (Inngest)
                                                          │
                                            ┌─────────────┴─────────────┐
                                            ▼                           ▼
                              applySignalsToProperties      step.sendEvent for
                                            │                  llm_synthesize fields
                                            ▼
                                  deals.properties (DB write)
                                            │
                                            ▼
                                      metrics.* counters
```

## Key files

| Concern | File |
|---|---|
| Pure cascade fn | `lib/deal-autofill/apply-signals.ts` |
| Conflict rules | `lib/deal-autofill/conflict-resolution.ts` |
| Property accessor (legacy bridge) | `lib/deal-autofill/property-accessor.ts` |
| Inngest worker | `inngest/deal-signal-sync.ts` |
| API : per-field source query | `app/api/deals/[id]/property-source/[fieldName]/route.ts` |
| UI : value + tooltip | `components/deal-property-cell.tsx` |
| Metrics primitive | `lib/observability/metrics.ts` |
| Datadog dashboard | `datadog/dashboards/deal-autofill.yaml` |
| Migration | `drizzle/0044_deal_property_metadata_backfill.sql` |

## Conflict rules per field

Defined in `FIELD_CONFLICT_RULES` (`lib/deal-autofill/conflict-resolution.ts`).

| Field | Rule | Why |
|---|---|---|
| `budget` | `latest_wins` | Budget changes ; latest mention is canonical. |
| `team_size` | `highest_confidence` | Numbers regress easily on noisy transcripts ; threshold 0.8. |
| `current_crm` | `latest_wins` | Replacement decision is recent. |
| `competitors` | `union` | Accumulate every mentioned competitor. |
| `point_solutions` | `union` | Same — every tool counts. |
| `stakeholders` | `union` | Same — capture everyone. |
| `next_step` | `latest_wins` | The most recent committed step is the live one. |
| `timeline` | `latest_wins` | Timeline shifts are recent. |
| `why_now` | `llm_synthesize` | Narrative — async LLM merges old & new context. |
| `summary` | `llm_synthesize` | Same. |

`preserve_manual` runs before everything else : if `current.manual === true`,
the entry is never overwritten by autofill regardless of the field rule.

## How to check a field's source

UI : hover the `ⓘ` icon next to any value on the deal page.

API (programmatic) :
```
GET /api/deals/{dealId}/property-source/{fieldName}
→ { value, source, sourceDate, manual, confidence, history }
```

DB (debug) :
```sql
select properties->'budget' from deals where id = '...';
```

## How to manually override

Two paths :
1. **UI** : edit the field on the deal page. The form sets `manual: true`
   on the resulting PropertyEntry, locking it against future autofill.
2. **DB / API** : `PATCH /api/deals/{id}` with the field set ; the
   handler must call `setDealProperty` with `manual: true` (existing
   form code already does this — see `app/api/deals/[id]/route.ts`).

## Re-enabling autofill on a manually-locked field

Edit the field and clear it (set to empty / null). The cascade then
treats the field as absent on the next signal and writes a fresh
auto entry.

## Backfill procedure (one-off)

The legacy → new shape migration is opportunistic — every signal
flips one field at a time. To eagerly backfill an entire tenant :

```ts
// scripts/backfill-deal-properties.ts
import { db } from "@/db";
import { deals } from "@/db/schema";
import { migrateLegacyProperties } from "@/lib/deal-autofill/property-accessor";
import { eq } from "drizzle-orm";

const rows = await db.select().from(deals).where(eq(deals.tenantId, TENANT));
for (const r of rows) {
  const next = migrateLegacyProperties(r.properties, r.updatedAt);
  await db.update(deals).set({ properties: next }).where(eq(deals.id, r.id));
}
```

The diagnostic view `deals_legacy_properties` (created in migration
0044) lists rows that still have legacy primitives — useful as a
"how much is left to backfill" gauge.

## Alarms & on-call playbook

### `deal_autofill.conflict_resolved` spike (>50/hr per tenant)

Signals : LLM is producing contradictory extractions OR conflict rules
are mis-tuned for this tenant's data shape.

**Investigate**
1. Open the dashboard, filter by tenant.
2. Drill into the toplist of `(field, rule)` pairs — which field is
   thrashing ?
3. Pull the 10 most-recent `enrichment-email-extract` traces for that
   tenant from the LLM observability dashboard. Look at the prompt /
   response — usually it's the LLM hallucinating a contradictory value
   because of a low-information email.

**Fix path**
- Bump the prompt eval threshold for the offending field.
- Or change the field's rule (e.g. `latest_wins` → `highest_confidence`)
  if the LLM tends to be wrong but knowable.

### `deal_autofill.confidence` p50 < 0.7 (sustained 1h)

LLM extraction quality is regressing.

**Investigate**
1. Check the LLM observability dashboard — has the model rolled over
   (Anthropic auto-upgrade) ?
2. Check eval runs — has the schema-contract suite for
   `enrichment-email-extract` started failing ?

**Fix path**
- Pin the model version explicitly in `lib/ai/ai-provider.ts`.
- Or roll back the prompt change if a recent edit shifted it.

### Manual override rate > 40% on a field

Users are correcting autofill consistently → the field is misbehaving.

**Investigate**
1. Pull 10 recent manual overrides for that field from
   `agent_traces` filtered by `tool === "update_deal"` and the field name.
2. Compare what the user typed vs what autofill had written.

**Fix path**
- Tighten the extraction prompt for that field.
- Or move the field to `preserve_manual` semantics by default (rare —
  most fields should auto-fill until the user disagrees).

### `deal_autofill.field_updated` flat (zero traffic for 30 min)

The cascade is broken. Likely causes :
- Inngest worker `sync-signals-to-deal` failing to start (check
  Inngest dashboard for crashes).
- The upstream `enrichment-email-extract` is broken (its event isn't
  firing → cascade has nothing to consume).
- DB connectivity issue (look at db pool errors in logs).

**Fix path** — Inngest's retry queue holds failed events for 24h ;
the cascade resumes automatically once the worker is back up.

## Adding a new autofill field

1. Add a key + rule entry to `FIELD_CONFLICT_RULES` in
   `lib/deal-autofill/conflict-resolution.ts`.
2. Add a `FieldMapping` entry to `FIELD_MAPPINGS` in
   `lib/deal-autofill/apply-signals.ts` (extracts the value from the
   `SignalsPayload`).
3. Extend the `SignalsPayload` type if the new field requires a new
   signals key.
4. Add an extraction prompt for the field in
   `lib/enrichment/email-extract-runner.ts`.
5. Add a `<DealPropertyCell>` to `app/(dashboard)/opportunities/[id]/page.tsx`.
6. Add the field to the dashboard `template_variables.field.available_values`.
7. Add a cascade test for the field (see
   `__tests__/deal-autofill-apply-signals.test.ts` for examples).

No additional code paths are needed — the registry-driven design
makes new fields a 7-edit operation.

## Test coverage map

| Concern | Test |
|---|---|
| Conflict rules (5 rules × edge cases) | `__tests__/deal-autofill-conflict-resolution.test.ts` |
| Property accessor + legacy bridge | `__tests__/deal-autofill-property-accessor.test.ts` |
| Cascade (10 fields + accumulators + bookkeeping) | `__tests__/deal-autofill-apply-signals.test.ts` |
| UI tooltip (rendering + states) | `components/__tests__/deal-property-cell.test.tsx` |
| Metrics primitive | `__tests__/observability-metrics.test.ts` |

## Open issues / future work

- LLM-synthesise round-trip for `why_now` / `summary` is enqueued via
  `step.sendEvent` ; the consumer worker `deal-property-llm-synthesize`
  is a follow-up ticket. Until shipped, the placeholder current value
  remains visible — no data loss, just no narrative merge.
- Datadog Statsd dispatcher swap : currently metrics flow through the
  structured logger. The dispatcher swap (in `setMetricsClient` at
  app boot) is gated on the Datadog agent sidecar being deployed in
  the worker container — separate infra ticket.
- Per-tenant rule overrides : a tenant whose LLM extraction is much
  worse / better than baseline could benefit from non-default rule
  thresholds. Not in scope for P0-5 — flagged for P1.

_Last updated_ : 2026-05-07
