/**
 * Soft-delete the classified "commercial SMB < 50 FTE" Pilae accounts, KEEPING
 * the international institutions / NGOs / IGOs / federations (Martin's prime
 * segment). Mirrors what the product's bulk-delete does:
 *   - soft-delete the company rows (deleted_at) — reversible from Archive
 *   - cascade soft-delete their live contacts (one shared timestamp)
 *   - write the durable suppression ledger so they're not re-sourced
 *
 * Reads the DELETE id list from _research/raw/pilae-small-delete-ids-2026-06-16.json
 * Dry-run by default (prints what it would do). Pass --apply to execute.
 * Guard: re-checks tenant + <50 size on every id; SKIPS anything >=50 or foreign.
 *
 *   pnpm dlx tsx --env-file=.env.local scripts/pilae-small-accounts-delete.ts
 *   pnpm dlx tsx --env-file=.env.local scripts/pilae-small-accounts-delete.ts --apply
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, and, eq, inArray, isNull } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { companies, contacts, accountSuppressions } from "../src/db/schema";
import { readFileSync } from "node:fs";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const IDS_FILE = "../../../../_research/raw/pilae-small-delete-ids-2026-06-16.json";

// --- size guard (same evidence test as the diagnostic/dump) ---
function bucketBounds(size: string | null): [number, number] | null {
  if (!size) return null;
  const nums = size.replace(/,/g, "").match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  return [parseInt(nums[0], 10), parseInt(nums[nums.length - 1], 10)];
}
function isUnder50(emp: string | null, size: string | null): boolean {
  if (emp && /^\d+$/.test(emp)) {
    const n = parseInt(emp, 10);
    if (n > 0) return n < 50;
  }
  const b = bucketBounds(size);
  if (b) {
    if (b[1] < 50) return true;
    if (b[0] >= 50) return false;
  }
  return false;
}

// --- suppression identity (copied from lib/accounts/suppression.ts) ---
function normalizeDomain(d?: string | null): string | null {
  if (!d) return null;
  const v = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return v || null;
}
function normalizeName(n?: string | null): string | null {
  if (!n) return null;
  const v = n.trim().toLowerCase().replace(/\s+/g, " ");
  return v || null;
}
function extractNative(props: Record<string, unknown>): { id: string | null; type: string | null } {
  if (props.siren) return { id: String(props.siren), type: "siren" };
  if (props.uid) return { id: String(props.uid), type: "zefix_uid" };
  if (props.apollo_id) return { id: String(props.apollo_id), type: "apollo" };
  return { id: null, type: null };
}

type Row = { id: string; name: string | null; domain: string | null; emp: string | null; size: string | null; properties: Record<string, unknown> | null };

async function main() {
  const apply = process.argv.includes("--apply");
  const ids: string[] = JSON.parse(readFileSync(new URL(IDS_FILE, import.meta.url), "utf8"));
  if (!Array.isArray(ids) || ids.length === 0) {
    console.error("No ids in", IDS_FILE);
    process.exit(1);
  }
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle({ client, schema });

  // Re-fetch the candidates, scoped to tenant + still live.
  const rows = (await db.execute(sql`
    SELECT id, name, domain,
      properties->>'employee_count' AS emp,
      size,
      properties AS properties
    FROM companies
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL AND id IN ${sql`(${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`}
  `)) as unknown as Row[];

  const found = new Set(rows.map((r) => r.id));
  const missing = ids.filter((i) => !found.has(i));

  // Guard: keep only those that are genuinely <50.
  const ok: Row[] = [];
  const skipped: Row[] = [];
  for (const r of rows) {
    if (isUnder50(r.emp, r.size)) ok.push(r);
    else skipped.push(r);
  }

  console.log(`Requested ids: ${ids.length}`);
  console.log(`Found live in tenant: ${rows.length}  (missing/already-gone: ${missing.length})`);
  console.log(`Will delete (<50 guard ok): ${ok.length}   SKIPPED (>=50, guard): ${skipped.length}`);
  if (skipped.length) {
    console.log("\nSKIPPED by size guard (NOT deleted):");
    for (const r of skipped) console.log(`  ${r.name} (emp=${r.emp ?? "-"} size=${r.size ?? "-"})`);
  }

  const delIds = ok.map((r) => r.id);

  // Count contacts that will cascade.
  const [{ ct }] = (await db.execute(sql`
    SELECT count(*)::int AS ct FROM contacts
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
      AND company_id IN ${sql`(${sql.join(delIds.length ? delIds.map((i) => sql`${i}`) : [sql`''`], sql`, `)})`}
  `)) as unknown as Array<{ ct: number }>;
  console.log(`Contacts that will cascade-delete: ${ct}`);

  if (!apply) {
    console.log("\n(dry-run — pass --apply to soft-delete + cascade + suppress)");
    await client.end();
    return;
  }
  if (delIds.length === 0) {
    console.log("\nNothing to delete.");
    await client.end();
    return;
  }

  const now = new Date();
  // 1. cascade contacts first (shared timestamp).
  const delContacts = await db.update(contacts).set({ deletedAt: now })
    .where(and(eq(contacts.tenantId, TENANT), inArray(contacts.companyId, delIds), isNull(contacts.deletedAt)))
    .returning({ id: contacts.id });
  // 2. soft-delete the companies.
  const delCompanies = await db.update(companies).set({ deletedAt: now, updatedAt: now })
    .where(and(eq(companies.tenantId, TENANT), inArray(companies.id, delIds), isNull(companies.deletedAt)))
    .returning({ id: companies.id });
  // 3. suppression ledger (idempotent: replace any prior rows for these companies).
  await db.delete(accountSuppressions)
    .where(and(eq(accountSuppressions.tenantId, TENANT), inArray(accountSuppressions.companyId, delIds)));
  const ledger = ok.map((r) => {
    const native = extractNative((r.properties ?? {}) as Record<string, unknown>);
    return {
      tenantId: TENANT,
      entityType: "company",
      companyId: r.id,
      kind: "deleted",
      reason: "icp_size_under_50",
      domain: normalizeDomain(r.domain),
      nameNormalized: normalizeName(r.name),
      nativeId: native.id,
      nativeIdType: native.type,
    };
  });
  for (let i = 0; i < ledger.length; i += 200) {
    await db.insert(accountSuppressions).values(ledger.slice(i, i + 200));
  }

  console.log(`\nAPPLIED:`);
  console.log(`  companies soft-deleted: ${delCompanies.length}`);
  console.log(`  contacts cascade-deleted: ${delContacts.length}`);
  console.log(`  suppression ledger rows: ${ledger.length}`);

  const [{ live }] = (await db.execute(sql`
    SELECT count(*)::int AS live FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
  `)) as unknown as Array<{ live: number }>;
  console.log(`  remaining live companies in tenant: ${live}`);
  await client.end();
}
main().catch((e) => { console.error("ERR", e.message || e); process.exit(1); });
