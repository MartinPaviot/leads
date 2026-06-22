# Outbound persistence migrations batch

Branch `feat/outbound-migrations`. Adds the schema columns/table that unblock the
persistence deferred across P0-4 / P1-10 / P1-12 / P1-15.

## ⚠️ Apply the SQL BEFORE merging/deploying

Adding these columns to the Drizzle schema makes **every** `db.select().from(table)`
(e.g. the approve route's select-all on `sequence_drafts`) reference them. If this
branch deploys before the columns exist in the target DB, those selects 500
(prod schema-behind). So:

1. Apply `app/apps/web/drizzle/0082_outbound_persistence_batch.sql` to the target DB
   first via `pnpm db:migrate:apply` (the custom runner picks up top-level `drizzle/*.sql`
   not yet in `__elevay_migrations`, wraps each in a transaction). On **dev**; apply
   as a deploy step on prod — never auto-migrate prod from an unmerged branch.
2. Then merge + deploy this branch.

The SQL is idempotent (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`).

## Columns added
| Table | Columns | Feature |
|---|---|---|
| `intelligence_briefs` | `firmographics jsonb`, `firmographic_provenance jsonb` | P1-10 |
| `sequence_drafts` | `spam_score int`, `spam_severity text`, `spam_warnings jsonb` | P0-4 |
| `sequence_drafts` | `quality_score real` + `sequence_drafts_quality_idx` | P1-15 |
| `outbound_emails` | `quality_score jsonb` | P1-12 |
| `personalization_calibration` (new table) | aggregates + unique (tenant_id, run_date) | P1-12 |

## Next: wire the persistence (the code these columns unblock)
The columns exist but the read/write/render code is the follow-up (per each
feature's VERIFY):
- **P0-4**: `buildDraftRow` writes `spam_score/severity/warnings`; the send-bridge
  spam recall persists them; context route exposes; edit route recalcs; the
  "Deliverability check" preview section.
- **P1-10**: persist `firmographics`+`firmographic_provenance` in the brief upsert +
  `rowToBrief` + `toResearchBriefContext` + the `FIRMOGRAPHICS (verified)` prompt
  section with `[source: provider]` citations.
- **P1-15**: write `quality_score` on drafts at generation; expose in the drafts
  list; build the `GET /api/outbound/queue` endpoint (consumes `buildOutboundQueue`)
  + the `/outbound-mode` page.
- **P1-12**: write `quality_score` on outbound at send; `backtestTenant` +
  the nightly Inngest cron writing `personalization_calibration`.

Verified: `pnpm tsc` 0; schema test `outbound-persistence-schema.test.ts` (4) green.
