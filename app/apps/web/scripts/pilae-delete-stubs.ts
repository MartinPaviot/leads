/**
 * Soft-delete the knowledge-less company stubs (no geography at all) — Martin's
 * rule: a company with no precise firmographics is useless. Reversible
 * (deleted_at) + cascade live contacts + suppression ledger so they're not
 * re-sourced. Dry-run by default; --apply executes.
 *
 *   pnpm dlx tsx --env-file=.env.local scripts/pilae-delete-stubs.ts
 *   pnpm dlx tsx --env-file=.env.local scripts/pilae-delete-stubs.ts --apply
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, and, eq, inArray, isNull } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { companies, contacts, accountSuppressions } from "../src/db/schema";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";

function normalizeDomain(d?: string | null): string | null {
  if (!d) return null;
  const v = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return v || null;
}
function normalizeName(n?: string | null): string | null {
  if (!n) return null;
  return n.trim().toLowerCase().replace(/\s+/g, " ") || null;
}

type Row = { id: string; name: string | null; domain: string | null; properties: Record<string, unknown> | null };

async function main() {
  const apply = process.argv.includes("--apply");
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle({ client, schema });

  // The knowledge-less set: no country/state/city/region anywhere.
  const rows = (await db.execute(sql`
    SELECT id, name, domain, properties FROM companies
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
      AND coalesce(properties->>'country','')='' AND coalesce(properties->>'state','')=''
      AND coalesce(properties->>'city','')='' AND coalesce(properties->>'region','')=''
  `)) as unknown as Row[];

  console.log(`Knowledge-less stubs (no geo): ${rows.length}`);
  for (const r of rows) console.log(`  - ${r.name} (${r.domain ?? "no domain"})`);
  const ids = rows.map((r) => r.id);

  const [{ ct }] = (await db.execute(sql`
    SELECT count(*)::int AS ct FROM contacts
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
      AND company_id IN ${sql`(${sql.join(ids.length ? ids.map((i) => sql`${i}`) : [sql`''`], sql`, `)})`}
  `)) as unknown as Array<{ ct: number }>;
  console.log(`Contacts that cascade-delete: ${ct}`);

  if (!apply) {
    console.log(`\n(dry-run — pass --apply)`);
    await client.end();
    return;
  }
  if (ids.length === 0) { console.log("Nothing to delete."); await client.end(); return; }

  const now = new Date();
  const delContacts = await db.update(contacts).set({ deletedAt: now })
    .where(and(eq(contacts.tenantId, TENANT), inArray(contacts.companyId, ids), isNull(contacts.deletedAt)))
    .returning({ id: contacts.id });
  const delCompanies = await db.update(companies).set({ deletedAt: now, updatedAt: now })
    .where(and(eq(companies.tenantId, TENANT), inArray(companies.id, ids), isNull(companies.deletedAt)))
    .returning({ id: companies.id });
  await db.delete(accountSuppressions)
    .where(and(eq(accountSuppressions.tenantId, TENANT), inArray(accountSuppressions.companyId, ids)));
  await db.insert(accountSuppressions).values(rows.map((r) => {
    const props = (r.properties ?? {}) as Record<string, unknown>;
    return {
      tenantId: TENANT, entityType: "company", companyId: r.id, kind: "deleted",
      reason: "knowledgeless_stub", domain: normalizeDomain(r.domain), nameNormalized: normalizeName(r.name),
      nativeId: props.apollo_id ? String(props.apollo_id) : null, nativeIdType: props.apollo_id ? "apollo" : null,
    };
  }));
  console.log(`\nAPPLIED: soft-deleted ${delCompanies.length} companies + ${delContacts.length} contacts + ledger.`);
  const [{ live }] = (await db.execute(sql`SELECT count(*)::int AS live FROM companies WHERE tenant_id=${TENANT} AND deleted_at IS NULL`)) as unknown as Array<{ live: number }>;
  console.log(`Remaining live: ${live}`);
  await client.end();
}
main().catch((e) => { console.error("ERR", e.message || e); process.exit(1); });
