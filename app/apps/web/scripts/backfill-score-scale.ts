/**
 * Phase 0 backfill (_specs/icp-unification R1.4 + R8.1).
 *
 * Repairs the companies.score scale split and the empty-Default debris
 * left by the 2026-06-01 multi-ICP migration:
 *
 *   1. ×100 every companies.score in (0,1] (matrix/heuristic remnants
 *      written on the 0-1 scale) so every reader of the 0-100 contract
 *      (GRADE_RANGES, displayScore, calls/campaign) is honest again.
 *   2. Empty ACTIVE "Default" ICPs (0 criteria — inert shells):
 *      tenants with real legacy flat targeting get their Default
 *      populated via legacySettingsToCriteria (the retro-compat the
 *      migration was supposed to perform); tenants without get the
 *      shell soft-deleted.
 *   3. Re-runs the (chunked, coverage-aware, 0-100-mirroring) recompute
 *      for every tenant that now owns >= 1 active ICP with scorable
 *      criteria. Tenants with no active ICPs (e.g. 47dca783 after the
 *      2026-06-11 profile deletion) are intentionally untouched.
 *
 * READ-ONLY by default (prints the full plan). Pass --apply to write.
 *
 * Usage, from app/apps/web:
 *   npx tsx --env-file=.env.local scripts/backfill-score-scale.ts
 *   npx tsx --env-file=.env.local scripts/backfill-score-scale.ts --apply
 */

import postgres from "postgres";
import {
  legacySettingsToCriteria,
  type LegacyIcpSettings,
} from "../src/lib/icp/flat-to-criteria";
import { SOURCING_ONLY_FIELD_KEYS } from "../src/lib/icp/field-catalog";
import { runFullRecompute } from "../src/lib/icp/fit-recompute-core";

const APPLY = process.argv.includes("--apply");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });

  console.log(`\n=== Phase 0 score-scale backfill — ${APPLY ? "APPLY" : "DRY-RUN"} ===`);

  // ── 1. Scores stuck on the 0-1 scale ──
  const brokenByTenant = await sql<Array<{ tenant_id: string; n: number }>>`
    SELECT tenant_id, count(*)::int AS n
    FROM companies
    WHERE deleted_at IS NULL AND score > 0 AND score <= 1
    GROUP BY tenant_id ORDER BY n DESC`;
  const brokenTotal = brokenByTenant.reduce((s, r) => s + r.n, 0);
  console.log(`\n[1] scores in (0,1]: ${brokenTotal} across ${brokenByTenant.length} tenant(s)`);
  for (const r of brokenByTenant) console.log(`    ${r.tenant_id.slice(0, 8)}: ${r.n}`);

  if (APPLY && brokenTotal > 0) {
    const fixed = await sql`
      UPDATE companies
      SET score = LEAST(100, round(score * 100)), updated_at = now()
      WHERE deleted_at IS NULL AND score > 0 AND score <= 1
      RETURNING id`;
    console.log(`    -> multiplied ${fixed.length} scores by 100`);
  }

  // ── 2. Empty ACTIVE "Default" shells ──
  const shells = await sql<Array<{ id: string; tenant_id: string; settings: Record<string, unknown> | null }>>`
    SELECT i.id, i.tenant_id, t.settings
    FROM icps i JOIN tenants t ON t.id = i.tenant_id
    WHERE i.status = 'active' AND i.deleted_at IS NULL AND i.name = 'Default'
      AND NOT EXISTS (SELECT 1 FROM icp_criteria c WHERE c.icp_id = i.id)`;

  let toPopulate = 0;
  let toSoftDelete = 0;
  const populatedTenants = new Set<string>();
  for (const shell of shells) {
    const legacy = (shell.settings ?? {}) as LegacyIcpSettings;
    const criteria = legacySettingsToCriteria(legacy);
    if (criteria.length > 0) {
      toPopulate++;
      populatedTenants.add(shell.tenant_id);
      if (APPLY) {
        for (const c of criteria) {
          await sql`
            INSERT INTO icp_criteria (id, icp_id, field_key, operator, value, weight, is_required)
            VALUES (gen_random_uuid()::text, ${shell.id}, ${c.fieldKey}, ${c.operator},
                    ${sql.json(c.value as never)}, ${c.weight}, ${c.isRequired})`;
        }
      }
    } else {
      toSoftDelete++;
      if (APPLY) {
        await sql`UPDATE icps SET deleted_at = now(), updated_at = now() WHERE id = ${shell.id}`;
      }
    }
  }
  console.log(
    `\n[2] empty active "Default" shells: ${shells.length} — populate from legacy flats: ${toPopulate}, soft-delete: ${toSoftDelete}`,
  );

  // ── 3. Recompute every tenant with scorable active criteria ──
  const scorableTenants = await sql<Array<{ tenant_id: string }>>`
    SELECT DISTINCT i.tenant_id
    FROM icps i JOIN icp_criteria c ON c.icp_id = i.id
    WHERE i.status = 'active' AND i.deleted_at IS NULL
      AND c.field_key NOT IN ${sql([...SOURCING_ONLY_FIELD_KEYS])}`;
  const recomputeTenants = new Set<string>(scorableTenants.map((r) => r.tenant_id));
  for (const t of populatedTenants) recomputeTenants.add(t);
  console.log(`\n[3] tenants to recompute: ${recomputeTenants.size}`);
  for (const t of recomputeTenants) console.log(`    ${t.slice(0, 8)}`);

  if (APPLY) {
    for (const tenantId of recomputeTenants) {
      const summary = await runFullRecompute(tenantId);
      console.log(
        `    -> ${tenantId.slice(0, 8)}: ${summary ? `${summary.companies} companies, up ${summary.regradedUp} / down ${summary.regradedDown}, unowned ${summary.unowned}` : "skipped (guard)"}`,
      );
    }
  }

  // ── 4. Verify ──
  const [post] = await sql<Array<{ broken: number }>>`
    SELECT count(*)::int AS broken FROM companies
    WHERE deleted_at IS NULL AND score > 0 AND score <= 1`;
  console.log(`\n[4] verify — scores still in (0,1]: ${post.broken}${APPLY ? " (must be 0)" : " (pre-apply)"}`);
  if (APPLY && post.broken > 0) {
    console.error("    BROKEN SCORES REMAIN — investigate before deploying readers.");
    process.exitCode = 1;
  }

  const dist = await sql<Array<{ tenant_id: string; total: number; not_scored: number; a_plus: number; a: number; b: number; c: number; d_f: number }>>`
    SELECT tenant_id, count(*)::int AS total,
           count(*) FILTER (WHERE score IS NULL)::int AS not_scored,
           count(*) FILTER (WHERE score >= 90)::int AS a_plus,
           count(*) FILTER (WHERE score >= 80 AND score < 90)::int AS a,
           count(*) FILTER (WHERE score >= 60 AND score < 80)::int AS b,
           count(*) FILTER (WHERE score >= 40 AND score < 60)::int AS c,
           count(*) FILTER (WHERE score < 40 AND score IS NOT NULL)::int AS d_f
    FROM companies WHERE deleted_at IS NULL
    GROUP BY tenant_id HAVING count(*) > 50 ORDER BY total DESC LIMIT 10`;
  console.log(`\n[5] grade spread (tenants > 50 companies):`);
  for (const r of dist) {
    console.log(
      `    ${r.tenant_id.slice(0, 8)}: total ${r.total} | A+ ${r.a_plus} A ${r.a} B ${r.b} C ${r.c} D/F ${r.d_f} | not scored ${r.not_scored}`,
    );
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
