import postgres from "postgres";

async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const t = "47dca783-dac0-45a5-85cb-d217b2a3174d";

  const total = await s`SELECT count(*)::int n FROM deals WHERE tenant_id = ${t}`;
  const live = await s`SELECT count(*)::int n FROM deals WHERE tenant_id = ${t} AND deleted_at IS NULL`;
  const deleted = await s`SELECT count(*)::int n FROM deals WHERE tenant_id = ${t} AND deleted_at IS NOT NULL`;

  console.log(`tenant ${t}`);
  console.log(`  total deals:        ${total[0].n}`);
  console.log(`  live (deleted_at null): ${live[0].n}`);
  console.log(`  already soft-deleted:   ${deleted[0].n}`);

  const sample = await s`
    SELECT id, name, stage, value, created_at
    FROM deals
    WHERE tenant_id = ${t} AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 20
  `;
  console.log("\n  sample of live deals:");
  for (const d of sample) {
    console.log(`   - ${d.name ?? "(no name)"} | stage=${d.stage} | value=${d.value ?? "-"} | ${new Date(d.created_at).toISOString().slice(0, 10)} | ${d.id}`);
  }
  if (sample.length === 0) console.log("   (none)");

  await s.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
