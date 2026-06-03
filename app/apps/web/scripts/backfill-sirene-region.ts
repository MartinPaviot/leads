import postgres from "postgres";
import { regionNameForDepartement } from "../src/lib/integrations/fr-departments";

async function main() {
  const t = process.argv[2] ?? "47dca783-dac0-45a5-85cb-d217b2a3174d";
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await s`
    SELECT id, properties FROM companies
    WHERE tenant_id = ${t} AND properties->>'source' = 'sirene'`;
  let updated = 0;
  for (const r of rows) {
    const props = (r.properties ?? {}) as Record<string, unknown>;
    const region = regionNameForDepartement(props.departement as string | undefined);
    if (region && props.region !== region) {
      await s`UPDATE companies SET properties = properties || ${s.json({ region })}::jsonb, updated_at = now() WHERE id = ${r.id}`;
      updated++;
    }
  }
  console.log(`region backfilled on ${updated} / ${rows.length} SIRENE companies`);
  await s.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
