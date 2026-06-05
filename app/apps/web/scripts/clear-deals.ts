import postgres from "postgres";

async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const t = "47dca783-dac0-45a5-85cb-d217b2a3174d";

  const rows = await s`
    UPDATE deals
    SET deleted_at = now(), updated_at = now()
    WHERE tenant_id = ${t} AND deleted_at IS NULL
    RETURNING id, name
  `;
  console.log(`Soft-deleted ${rows.length} deals for tenant ${t}:`);
  for (const r of rows) console.log(`   - ${r.name ?? "(no name)"} [${r.id}]`);

  const live = await s`SELECT count(*)::int n FROM deals WHERE tenant_id = ${t} AND deleted_at IS NULL`;
  console.log(`\nRemaining live deals: ${live[0].n}`);

  await s.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
