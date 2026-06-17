/**
 * Classify Pilae's live companies as international institution vs commercial
 * (LLM over real labels) and write the verdict onto the row:
 *   properties.institutionClass = { isInstitution, kind, confidence, at, model }
 *   properties.is_intl_institution = <bool>   (flat key for an ICP custom_property)
 *
 * Dry-run by default (classifies + prints the summary, no write). --apply writes.
 *   pnpm dlx tsx --env-file=.env.local scripts/pilae-institution-classify.ts
 *   pnpm dlx tsx --env-file=.env.local scripts/pilae-institution-classify.ts --apply
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { classifyInstitutions } from "../src/lib/icp/institution-classifier";
import type { CompanyToClassify } from "../src/lib/icp/institution-classifier-core";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";

type Row = CompanyToClassify & { size: string | null; emp: string | null };
function empLow(emp: string | null, size: string | null): number | null {
  if (emp && /^\d+$/.test(emp)) { const n = parseInt(emp, 10); if (n > 0) return n; }
  if (!size) return null;
  const nums = size.replace(/,/g, "").match(/\d+/g);
  return nums ? parseInt(nums[0], 10) : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle({ client, schema });

  const rows = (await db.execute(sql`
    SELECT id, name, industry, domain, size,
      left(coalesce(description, ''), 220) AS description,
      properties->>'employee_count' AS emp
    FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
  `)) as unknown as Row[];
  console.log(`Classifying ${rows.length} live companies...`);

  const verdicts = await classifyInstitutions(rows, TENANT);
  console.log(`Resolved: ${verdicts.size} / ${rows.length} (unresolved stay unwritten)\n`);

  const byKind: Record<string, number> = {};
  let inst = 0;
  for (const v of verdicts.values()) {
    byKind[v.kind] = (byKind[v.kind] || 0) + 1;
    if (v.isInstitution) inst++;
  }
  console.log(`Institutions: ${inst}   Commercial/other: ${verdicts.size - inst}`);
  console.log(`By kind: ${JSON.stringify(byKind)}\n`);

  // Quality check 1: the kept <50 set should all be institutions.
  const under50 = rows.filter((r) => { const n = empLow(r.emp, r.size); return n !== null && n < 50; });
  const under50Bad = under50.filter((r) => { const v = verdicts.get(r.id); return v && !v.isInstitution; });
  console.log(`Kept <50 set: ${under50.length}  flagged NOT-institution (false neg?): ${under50Bad.length}`);
  for (const r of under50Bad) console.log(`   ⚠ ${r.name} (${r.industry}) -> ${JSON.stringify(verdicts.get(r.id))}`);

  // Quality check 2: institutions hiding in the >=50 set (industry ICP misses these too).
  const newInst = rows.filter((r) => { const v = verdicts.get(r.id); const n = empLow(r.emp, r.size); return v?.isInstitution && n !== null && n >= 50; });
  console.log(`\nInstitutions found in the >=50 set (${newInst.length}):`);
  for (const r of newInst.slice(0, 40)) console.log(`   + ${(r.name || "").slice(0, 40).padEnd(40)} ${(r.industry || "-").padEnd(28)} ${JSON.stringify(verdicts.get(r.id))}`);

  if (!apply) {
    console.log(`\n(dry-run — pass --apply to write institutionClass + is_intl_institution)`);
    await client.end();
    return;
  }

  const now = new Date().toISOString();
  const updates = [...verdicts.entries()].map(([id, v]) => ({
    id,
    props: {
      institutionClass: { isInstitution: v.isInstitution, kind: v.kind, confidence: v.confidence, at: now, model: "claude-haiku-4-5" },
      is_intl_institution: v.isInstitution,
    },
  }));
  for (let i = 0; i < updates.length; i += 200) {
    const chunk = updates.slice(i, i + 200);
    await db.execute(sql`
      UPDATE companies AS c SET
        properties = COALESCE(c.properties, '{}'::jsonb) || v.props,
        updated_at = now()
      FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS v(id text, props jsonb)
      WHERE c.id = v.id AND c.tenant_id = ${TENANT}
    `);
  }
  console.log(`\nAPPLIED: wrote verdict on ${updates.length} companies.`);
  await client.end();
}
main().catch((e) => { console.error("ERR", e.message || e); process.exit(1); });
