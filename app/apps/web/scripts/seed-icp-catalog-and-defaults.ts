/**
 * Phase 1b retro-compat (_specs/multi-icp R10). Two idempotent steps:
 *
 *   1. Seed the GLOBAL field catalog (tenant_id NULL) from the
 *      standard Apollo-anchored definitions. Safe to re-run — uses the
 *      global unique index on field_key.
 *
 *   2. For every tenant that has legacy flat ICP settings but no ICP
 *      row yet, auto-create a "Default" ICP (status=active, priority=0)
 *      with criteria translated from the flat target* fields. Marks the
 *      tenant settings.multiIcpMigratedAt so re-runs skip it.
 *
 * After this runs, every tenant has at least one real ICP and the
 * recompute job (inngest/icp-fit-recompute.ts) can populate the matrix.
 * Existing single-ICP behavior is preserved: the Default ICP encodes
 * exactly the old targeting.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/seed-icp-catalog-and-defaults.ts
 */

import postgres from "postgres";
import { standardCatalogSeedRows } from "../src/lib/icp/field-catalog";
import {
  legacySettingsToCriteria,
  type LegacyIcpSettings,
} from "../src/lib/icp/flat-to-criteria";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });

  // ── 1. Global field catalog seed ──
  console.log("\n=== 1. Seed global field catalog ===");
  const rows = standardCatalogSeedRows();
  let catInserted = 0;
  for (const r of rows) {
    const res = await sql`
      INSERT INTO icp_field_catalog
        (id, tenant_id, field_key, label, source, value_type, operators, apollo_param)
      VALUES (
        gen_random_uuid()::text, NULL, ${r.fieldKey}, ${r.label},
        ${r.source}, ${r.valueType}, ${sql.json(r.operators)}, ${r.apolloParam}
      )
      ON CONFLICT (field_key) WHERE tenant_id IS NULL
      DO NOTHING
      RETURNING id
    `;
    if (res.length > 0) catInserted++;
  }
  console.log(`  ${catInserted} inserted, ${rows.length - catInserted} already present (of ${rows.length})`);

  // ── 2. Default ICP per tenant ──
  console.log("\n=== 2. Auto-create Default ICP per tenant ===");
  const tenants = await sql<
    Array<{ id: string; settings: Record<string, unknown> | null }>
  >`SELECT id, settings FROM tenants`;

  let createdIcps = 0;
  let skipped = 0;
  for (const t of tenants) {
    const settings = (t.settings ?? {}) as Record<string, unknown>;

    // Skip if already migrated.
    if (settings.multiIcpMigratedAt) {
      skipped++;
      continue;
    }
    // Skip if the tenant already has any ICP (manually created).
    const [existingIcp] = await sql`SELECT id FROM icps WHERE tenant_id = ${t.id} LIMIT 1`;
    if (existingIcp) {
      await sql`
        UPDATE tenants
        SET settings = jsonb_set(CASE WHEN jsonb_typeof(settings) = 'object' THEN settings ELSE '{}'::jsonb END, '{multiIcpMigratedAt}', to_jsonb(now()::text))
        WHERE id = ${t.id}
      `;
      skipped++;
      continue;
    }

    const legacy: LegacyIcpSettings = {
      targetIndustries: settings.targetIndustries as string[] | undefined,
      targetCompanySizes: settings.targetCompanySizes as string[] | undefined,
      targetGeographies: settings.targetGeographies as string[] | undefined,
      targetSeniorities: settings.targetSeniorities as string[] | undefined,
      targetDepartments: settings.targetDepartments as string[] | undefined,
    };
    const criteria = legacySettingsToCriteria(legacy);

    // Create the Default ICP even when there are no criteria — so the
    // tenant has a home ICP to attach future criteria to. It just
    // won't match anything until configured.
    const [icp] = await sql<Array<{ id: string }>>`
      INSERT INTO icps (id, tenant_id, name, description, status, priority, metadata)
      VALUES (
        gen_random_uuid()::text, ${t.id}, 'Default',
        'Auto-created from legacy ICP settings during the multi-ICP migration.',
        'active', 0,
        ${sql.json({ source: "retro_compat_migration" })}
      )
      RETURNING id
    `;
    createdIcps++;

    for (const c of criteria) {
      await sql`
        INSERT INTO icp_criteria (id, icp_id, field_key, operator, value, weight, is_required)
        VALUES (
          gen_random_uuid()::text, ${icp.id}, ${c.fieldKey}, ${c.operator},
          ${sql.json(c.value as object)}, ${c.weight}, ${c.isRequired}
        )
      `;
    }

    await sql`
      UPDATE tenants
      SET settings = jsonb_set(CASE WHEN jsonb_typeof(settings) = 'object' THEN settings ELSE '{}'::jsonb END, '{multiIcpMigratedAt}', to_jsonb(now()::text))
      WHERE id = ${t.id}
    `;
    console.log(`  [OK] tenant ${t.id}: Default ICP + ${criteria.length} criteria`);
  }

  console.log(`\n  Created ${createdIcps} Default ICPs, skipped ${skipped} (already migrated / has ICP).`);
  console.log("\nNext: run the recompute job to populate company_icp_fit + mirror companies.score.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
