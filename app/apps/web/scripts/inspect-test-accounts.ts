/**
 * Read-only: surface accounts (companies) + contacts on the Pilae tenant
 * that look like TEST / FIXTURE / non-real data rather than hand-curated
 * or legitimately sourced records.
 *
 * Usage: tsx --env-file=.env.local scripts/inspect-test-accounts.ts
 */
import postgres from "postgres";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";

async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });

  // What 'source' markers exist in properties, and how many of each?
  const sources = await s`
    SELECT COALESCE(properties->>'source','(none)') AS source, count(*)::int n
    FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
    GROUP BY 1 ORDER BY 2 DESC`;
  console.log("=== companies by properties.source ===");
  for (const r of sources) console.log(`  ${String(r.source).padEnd(28)} ${r.n}`);

  // Distinct top-level property keys (sample) to understand provenance fields
  const keys = await s`
    SELECT key, count(*)::int n FROM (
      SELECT jsonb_object_keys(properties) AS key
      FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
    ) k GROUP BY key ORDER BY n DESC`;
  console.log("\n=== property keys present on companies ===");
  for (const r of keys) console.log(`  ${String(r.key).padEnd(28)} ${r.n}`);

  // Test-signature names / domains
  const testSig = await s<
    { id: string; name: string; domain: string | null; source: string | null; created_at: string | null }[]
  >`
    SELECT id, name, domain, properties->>'source' AS source, created_at
    FROM companies
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
      AND (
        name ILIKE ANY (ARRAY['%test%','%demo%','%example%','%acme%','%dummy%','%sample%','%fixture%','%lorem%','%foobar%','%placeholder%','%mon entreprise%','%my company%'])
        OR domain ILIKE ANY (ARRAY['%example.com%','%example.org%','%example.net%','%test.%','%acme.%','%localhost%','%dummy%'])
      )
    ORDER BY created_at`;
  console.log(`\n=== TEST-SIGNATURE companies: ${testSig.length} ===`);
  for (const r of testSig) {
    console.log(`  ${r.id}  "${r.name}"  domain=${r.domain ?? "-"}  src=${r.source ?? "-"}  created=${r.created_at}`);
  }

  // Companies with NO domain at all (often hand-typed or junk)
  const noDomain = await s`
    SELECT count(*)::int n FROM companies
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL AND (domain IS NULL OR domain = '')`;
  console.log(`\n=== companies with NO domain: ${noDomain[0].n} ===`);

  // Contacts with test-signature email/name
  const testContacts = await s<
    { id: string; first_name: string | null; last_name: string | null; email: string | null; created_at: string | null }[]
  >`
    SELECT id, first_name, last_name, email, created_at
    FROM contacts
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
      AND (
        email ILIKE ANY (ARRAY['%@example.com','%@example.org','%test%','%demo%','%acme%','%dummy%'])
        OR first_name ILIKE ANY (ARRAY['test','demo','dummy','sample'])
        OR last_name ILIKE ANY (ARRAY['prospect','test','demo','dummy'])
      )
    ORDER BY created_at`;
  console.log(`\n=== TEST-SIGNATURE contacts: ${testContacts.length} ===`);
  for (const r of testContacts) {
    console.log(`  ${r.id}  ${r.first_name ?? ""} ${r.last_name ?? ""}  <${r.email ?? "-"}>  created=${r.created_at}`);
  }

  await s.end();
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
