import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)?.[1];
if (!url) { console.log("NO DATABASE_URL"); process.exit(1); }
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 5 });
const tenants = await sql`
  SELECT DISTINCT t.id, t.name FROM tenants t
  JOIN users u ON u.tenant_id = t.id
  WHERE u.email ILIKE '%pilae.ch%' OR t.id = '47dca783-4d31-4d35-9c4f-7c8c8d1d6f2e' OR t.id LIKE '47dca783%'`;
console.log("TENANTS with a pilae.ch member (or 47dca783):");
for (const t of tenants) console.log(`  ${t.id}  "${t.name}"`);
for (const t of tenants) {
  const members = await sql`
    SELECT u.id, u.email, u.role, u.created_at::date AS since,
      (SELECT count(*) FROM deals d WHERE d.owner_id = u.id) AS deals_owned,
      (SELECT count(*) FROM calls c WHERE c.user_id = u.id) AS calls_made
    FROM users u WHERE u.tenant_id = ${t.id} ORDER BY u.created_at`;
  console.log(`\nMEMBERS of ${t.id} "${t.name}":`);
  for (const m of members)
    console.log(`  ${m.email}  role=${m.role}  since=${m.since}  deals=${m.deals_owned} calls=${m.calls_made}  id=${m.id}`);
}
await sql.end();
