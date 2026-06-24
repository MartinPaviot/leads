/**
 * Spec 35 — T0 data backfill (R8). Idempotent + additive. Run on the dev DB
 * BEFORE flipping TARGETING_GATE_ENABLED=on (the `=== GATE: pre-go-live ===`):
 *
 *   1. targeting_status: today's contactable accounts (not excluded, not deleted)
 *      -> 'targeted' so SAFE_MODE-on does not change behavior (R8.6); excluded or
 *      soft-deleted -> 'archived'. Only touches rows still 'unreviewed' (re-run safe).
 *   2. companies.excluded_reason = 'do_not_contact_request' -> ACCOUNT/manual_dnc
 *      suppression keyed by identity_key (R8.5).
 *   3. email_optouts -> suppression (unsubscribe->opt_out, complaint->complaint,
 *      bounce_hard->hard_bounce, else manual_dnc) — consolidation (R8.2). The gate
 *      keeps checking email_optouts directly too, so this is additive, not a cutover.
 *   4. meeting_opt_outs -> opt_out address suppression (R8.3).
 *
 * account_suppressions (kind excluded/deleted) is deliberately NOT migrated to
 * consent — those are targeting choices, handled by step 1 (R8.4).
 *
 * Usage: DATABASE_URL=... pnpm tsx scripts/backfill-targeting-and-dnc.ts
 */
import postgres from "postgres";

const url = (process.env.DATABASE_URL || "").replace(/[\r\n\s]+/g, "").trim();
if (!url) throw new Error("DATABASE_URL missing");

const sql = postgres(url, { max: 1 });

async function main() {
  // 1. targeting_status backfill (only unreviewed -> idempotent).
  const targeting = await sql<{ targeting_status: string; n: bigint }[]>`
    WITH updated AS (
      UPDATE companies
      SET targeting_status = CASE
        WHEN excluded_reason IS NULL AND deleted_at IS NULL THEN 'targeted'::targeting_status
        ELSE 'archived'::targeting_status
      END
      WHERE targeting_status = 'unreviewed'
      RETURNING targeting_status
    )
    SELECT targeting_status, count(*)::bigint AS n FROM updated GROUP BY targeting_status`;

  // 2. explicit do-not-contact excludes -> ACCOUNT/manual_dnc (identity_key, fallback id).
  const dnc = await sql`
    INSERT INTO suppression (id, tenant_id, level, value, type, reason, permanent, status, source, created_at)
    SELECT gen_random_uuid()::text, c.tenant_id, 'account', COALESCE(c.identity_key, c.id),
           'manual_dnc', 'do_not_contact_request', true, 'active', 'migration', now()
    FROM companies c
    WHERE c.excluded_reason = 'do_not_contact_request'
    ON CONFLICT (tenant_id, level, value) DO NOTHING
    RETURNING id`;

  // 3. email_optouts consolidation.
  const optouts = await sql`
    INSERT INTO suppression (id, tenant_id, level, value, type, reason, permanent, status, source, created_at)
    SELECT gen_random_uuid()::text, eo.tenant_id, 'address', lower(eo.email_address),
           CASE eo.reason
             WHEN 'unsubscribe' THEN 'opt_out'
             WHEN 'complaint'   THEN 'complaint'
             WHEN 'bounce_hard' THEN 'hard_bounce'
             ELSE 'manual_dnc'
           END,
           eo.reason, true, 'active', 'email_optouts_backfill', COALESCE(eo.created_at, now())
    FROM email_optouts eo
    WHERE eo.email_address IS NOT NULL AND length(trim(eo.email_address)) > 0
    ON CONFLICT (tenant_id, level, value) DO NOTHING
    RETURNING id`;

  // 4. meeting_opt_outs -> opt_out address. The tenant is derived from the
  // linked activity (prod's meeting_opt_outs predates a tenant_id column), and
  // created_at uses now() to avoid the opted_out_at/created_at column drift
  // across environments.
  const meetings = await sql`
    INSERT INTO suppression (id, tenant_id, level, value, type, reason, permanent, status, source, created_at)
    SELECT gen_random_uuid()::text, a.tenant_id, 'address', lower(mo.attendee_email),
           'opt_out', 'meeting_opt_out', true, 'active', 'meeting_optouts_backfill', now()
    FROM meeting_opt_outs mo
    JOIN activities a ON a.id = mo.activity_id
    WHERE mo.attendee_email IS NOT NULL AND length(trim(mo.attendee_email)) > 0
    ON CONFLICT (tenant_id, level, value) DO NOTHING
    RETURNING id`;

  console.log("[backfill] targeting_status:", Object.fromEntries(targeting.map((r) => [r.targeting_status, Number(r.n)])));
  console.log("[backfill] do_not_contact_request -> account/manual_dnc:", dnc.length);
  console.log("[backfill] email_optouts -> suppression:", optouts.length);
  console.log("[backfill] meeting_opt_outs -> suppression:", meetings.length);
}

main()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("[backfill] failed:", e);
    await sql.end();
    process.exit(1);
  });
