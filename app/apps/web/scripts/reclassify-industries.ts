/**
 * Reclassify company categories on the Pilae tenant to Apollo's literal
 * industry taxonomy.
 *
 *  - Romand batch (search_strategy='Pilae ICP romand 100-1000'): translate
 *    NAICS/SIC -> Apollo industry string, set properties.icp_sector, keep
 *    the old label in properties.prev_industry, and recompute score/grade
 *    /reasons from the ICP sector tier.
 *  - Other (old Apollo) companies: already carry Apollo industry strings.
 *    Leave their score untouched; just stamp icp_sector + industry_source.
 *
 * Reversible: prev_industry / prev_score kept in properties.
 *
 *   DRY (default): tsx --env-file=.env.local scripts/reclassify-industries.ts
 *   COMMIT:        tsx --env-file=.env.local scripts/reclassify-industries.ts --commit
 */
import postgres from "postgres";
import {
  apolloIndustryFromCodes, icpSectorOf, SECTOR_TIER, gradeOf,
} from "../src/lib/icp/naics-to-apollo-industry";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const ROMAND = "Pilae ICP romand 100-1000";
const COMMIT = process.argv.includes("--commit");

interface Row {
  id: string; name: string; industry: string | null; score: number | null;
  strat: string | null; naics: string[]; sic: string[]; props: Record<string, unknown>;
}

async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });

  const rows = await s<Row[]>`
    SELECT id, name, industry, score,
           properties->>'search_strategy' AS strat,
           ARRAY(SELECT jsonb_array_elements_text(coalesce(properties->'naics_codes','[]'::jsonb))) AS naics,
           ARRAY(SELECT jsonb_array_elements_text(coalesce(properties->'sic_codes','[]'::jsonb))) AS sic,
           properties AS props
    FROM companies WHERE tenant_id=${TENANT} AND deleted_at IS NULL`;

  const viaCount: Record<string, number> = {};
  const newIndDist: Record<string, number> = {};
  const sectorDist: Record<string, number> = {};
  const updates: Array<{ id: string; industry: string; score: number | null; props: Record<string, unknown> }> = [];
  let romand = 0, old = 0, scoreChanged = 0;

  for (const r of rows) {
    const props = { ...(r.props ?? {}) };
    let industry: string;
    let newScore: number | null = r.score;

    if (r.strat === ROMAND) {
      romand++;
      const res = apolloIndustryFromCodes(r.naics, r.sic, r.name);
      industry = res.industry;
      viaCount[res.via] = (viaCount[res.via] ?? 0) + 1;
      const sector = icpSectorOf(industry);
      const tier = SECTOR_TIER[sector] ?? 0.5;
      // preserve originals once
      if (props.prev_industry === undefined) props.prev_industry = r.industry;
      if (props.prev_score === undefined) props.prev_score = r.score;
      props.icp_sector = sector;
      props.industry_source = `naics-crosswalk:${res.via}`;
      props.score_fit = Math.round(tier * 100);
      props.score_grade = gradeOf(tier);
      props.score_fit_reasons = [`${sector} — fit ICP ${gradeOf(tier)} (taxonomie Apollo: ${industry})`];
      props.reclassified_at = new Date().toISOString();
      if (newScore !== tier) scoreChanged++;
      newScore = tier;
    } else {
      old++;
      industry = (r.industry ?? "other").trim().toLowerCase();
      const sector = icpSectorOf(industry);
      props.icp_sector = sector;
      props.industry_source = "apollo-native";
      // score left untouched for the richer old batch
    }

    newIndDist[industry] = (newIndDist[industry] ?? 0) + 1;
    const sec = props.icp_sector as string;
    sectorDist[sec] = (sectorDist[sec] ?? 0) + 1;
    updates.push({ id: r.id, industry, score: newScore, props });
  }

  const top = (m: Record<string, number>, n = 50) =>
    Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);

  console.log(`Rows: ${rows.length}  (romand=${romand}, old=${old})`);
  console.log(`\n=== romand resolution path (via) ===`);
  for (const [k, v] of top(viaCount)) console.log(`  ${k.padEnd(8)} ${v}`);
  console.log(`\n=== NEW industry distribution (whole tenant, Apollo strings) ===`);
  for (const [k, v] of top(newIndDist, 80)) console.log(`  ${String(k).padEnd(42)} ${v}`);
  console.log(`\n=== coarse ICP sector distribution ===`);
  for (const [k, v] of top(sectorDist)) console.log(`  ${String(k).padEnd(40)} ${v}`);
  console.log(`\nromand scores recomputed (changed): ${scoreChanged}`);

  if (!COMMIT) { console.log("\n[DRY RUN] pass --commit to write."); await s.end(); return; }

  await s.begin(async (tx) => {
    for (const u of updates) {
      await tx`
        UPDATE companies
        SET industry=${u.industry}, score=${u.score}, properties=${tx.json(u.props)}, updated_at=now()
        WHERE id=${u.id} AND tenant_id=${TENANT}`;
    }
  });
  console.log(`\n[COMMITTED] updated ${updates.length} rows.`);
  await s.end();
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
