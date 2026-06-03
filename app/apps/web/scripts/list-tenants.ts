import postgres from "postgres";
async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await s`
    SELECT t.id, t.name,
      (SELECT count(*)::int FROM companies c WHERE c.tenant_id = t.id) AS companies,
      (SELECT count(*)::int FROM companies c WHERE c.tenant_id = t.id AND c.properties->>'source'='tam') AS tam,
      (SELECT count(*)::int FROM icps i WHERE i.tenant_id = t.id AND i.status='active') AS active_icps,
      (SELECT count(*)::int FROM auth_account a JOIN auth_user u ON u."id"=a."userId" WHERE lower(u.email)='martin@elevay.dev') AS _ignore
    FROM tenants t ORDER BY companies DESC`;
  console.log("tenants:");
  for (const r of rows) {
    console.log(`  ${String(r.id).slice(0, 14).padEnd(14)} ${String(r.name).slice(0,28).padEnd(28)} companies=${r.companies} tam=${r.tam} active_icps=${r.active_icps}`);
  }
  // Which tenant does Martin belong to?
  const who = await s`
    SELECT u.email, m.tenant_id, t.name
    FROM users u
    JOIN memberships m ON m.user_id = u.id
    JOIN tenants t ON t.id = m.tenant_id
    WHERE lower(u.email) = 'martin@elevay.dev'`.catch(() => []);
  console.log("\nMartin memberships:", JSON.stringify(who));
  await s.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
