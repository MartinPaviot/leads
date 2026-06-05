/**
 * Soft-delete the SIRENE batch (source='sirene', Jun 03 run: score 0,
 * doubled names, contains the 5 duplicates) on the Pilae tenant.
 * Reversible: only sets deleted_at. Also soft-deletes any contacts that
 * hang off those companies so the CRM stays consistent.
 *
 * Usage:
 *   DRY (default):  tsx --env-file=.env.local scripts/delete-sirene-batch.ts
 *   COMMIT:         tsx --env-file=.env.local scripts/delete-sirene-batch.ts --commit
 */
import postgres from "postgres";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const COMMIT = process.argv.includes("--commit");

async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });

  const targets = await s<{ id: string }[]>`
    SELECT id FROM companies
    WHERE tenant_id = ${TENANT}
      AND deleted_at IS NULL
      AND properties->>'source' = 'sirene'`;
  const ids = targets.map((r) => r.id);
  console.log(`SIRENE companies to soft-delete: ${ids.length}`);

  const [{ n: contactCount }] = await s<{ n: number }[]>`
    SELECT count(*)::int n FROM contacts
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
      AND company_id IN ${s(ids.length ? ids : ["__none__"])}`;
  console.log(`Contacts attached to those companies: ${contactCount}`);

  const [{ n: before }] = await s<{ n: number }[]>`
    SELECT count(*)::int n FROM companies
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL`;
  console.log(`Live companies BEFORE: ${before}`);

  if (!COMMIT) {
    console.log("\n[DRY RUN] nothing written. Re-run with --commit to apply.");
    await s.end();
    return;
  }

  await s.begin(async (tx) => {
    await tx`
      UPDATE companies SET deleted_at = now(), updated_at = now()
      WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
        AND properties->>'source' = 'sirene'`;
    if (ids.length) {
      await tx`
        UPDATE contacts SET deleted_at = now(), updated_at = now()
        WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
          AND company_id IN ${tx(ids)}`;
    }
  });

  const [{ n: after }] = await s<{ n: number }[]>`
    SELECT count(*)::int n FROM companies
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL`;
  console.log(`\n[COMMITTED] Live companies AFTER: ${after}  (removed ${before - after})`);

  // sanity: any remaining duplicate domains?
  const dupes = await s`
    SELECT lower(regexp_replace(regexp_replace(coalesce(domain,''), '^https?://', ''), '^www\\.', '')) AS d, count(*)::int n
    FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL AND domain IS NOT NULL AND domain <> ''
    GROUP BY 1 HAVING count(*) > 1`;
  console.log(`Remaining duplicate domains: ${dupes.length}`);
  for (const r of dupes) console.log(`  ${r.d} x${r.n}`);

  await s.end();
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
