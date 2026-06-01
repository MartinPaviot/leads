/**
 * Seed Pilae's 4 verticals as 4 real ICPs (P1b, _specs/multi-icp R10.4).
 *
 * Supersedes the inert nested `settings.icp.verticales` that
 * seed-pilae-tenant.ts wrote (which scoring never read). Creates 4
 * distinct ICPs with real Apollo-anchored criteria + Pilae's
 * FR/CH geo, and archives the empty "Default" ICP the retro-compat
 * migration auto-created for the Pilae tenant.
 *
 * Idempotent: skips ICPs whose name already exists for the tenant.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/seed-pilae-icps.ts
 *
 * Criteria are a starting point — refine via the rule-builder (Phase 2)
 * or SQL. The point is 4 distinct scoring profiles so a SaaS company
 * scores high on "SaaS / Tech" and ~0 on "Santé", instead of one
 * blended tenant ICP.
 */

import postgres from "postgres";

const PILAE_TENANT_ID = "pilae";
const FR_CH_GEO = ["France", "Switzerland"];

type IcpSeed = {
  name: string;
  description: string;
  priority: number;
  criteria: Array<{
    fieldKey: string;
    operator: string;
    value: unknown;
    weight: number;
    isRequired: boolean;
  }>;
};

const PILAE_ICPS: IcpSeed[] = [
  {
    name: "SaaS / Tech",
    description: "Scale-up SaaS et éditeurs tech, FR/CH, équipe plateforme constituée.",
    priority: 0,
    criteria: [
      { fieldKey: "industry", operator: "in", value: ["Computer Software", "Information Technology and Services", "Internet"], weight: 3, isRequired: false },
      { fieldKey: "geography", operator: "in", value: FR_CH_GEO, weight: 1, isRequired: true },
      { fieldKey: "employee_count", operator: "between", value: { min: 20, max: 500 }, weight: 2, isRequired: false },
      { fieldKey: "person_seniorities", operator: "in", value: ["c_suite", "vp", "head", "director"], weight: 1, isRequired: false },
    ],
  },
  {
    name: "Fintech",
    description: "Fintech et services financiers, FR/CH — sensibilité réglementaire DORA/NIS2.",
    priority: 1,
    criteria: [
      { fieldKey: "industry", operator: "in", value: ["Financial Services", "Banking", "Capital Markets", "Investment Management"], weight: 3, isRequired: false },
      { fieldKey: "geography", operator: "in", value: FR_CH_GEO, weight: 1, isRequired: true },
      { fieldKey: "employee_count", operator: "between", value: { min: 20, max: 2000 }, weight: 2, isRequired: false },
    ],
  },
  {
    name: "Santé",
    description: "Santé / medtech / pharma, FR/CH — contrainte hébergement données HDS.",
    priority: 2,
    criteria: [
      { fieldKey: "industry", operator: "in", value: ["Hospital & Health Care", "Medical Devices", "Pharmaceuticals", "Biotechnology", "Health, Wellness and Fitness"], weight: 3, isRequired: false },
      { fieldKey: "geography", operator: "in", value: FR_CH_GEO, weight: 1, isRequired: true },
      { fieldKey: "employee_count", operator: "between", value: { min: 50, max: 5000 }, weight: 2, isRequired: false },
    ],
  },
  {
    name: "Agence",
    description: "Agences marketing / design / conseil, FR/CH.",
    priority: 3,
    criteria: [
      { fieldKey: "industry", operator: "in", value: ["Marketing and Advertising", "Design", "Graphic Design", "Public Relations and Communications", "Management Consulting"], weight: 3, isRequired: false },
      { fieldKey: "geography", operator: "in", value: FR_CH_GEO, weight: 1, isRequired: true },
      { fieldKey: "employee_count", operator: "between", value: { min: 10, max: 300 }, weight: 2, isRequired: false },
    ],
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });

  // Confirm the Pilae tenant exists.
  const [tenant] = await sql`SELECT id FROM tenants WHERE id = ${PILAE_TENANT_ID} LIMIT 1`;
  if (!tenant) {
    console.error(
      `Tenant '${PILAE_TENANT_ID}' not found. Run seed-pilae-tenant.ts first.`,
    );
    process.exit(1);
  }

  console.log("\n=== Seed Pilae 4 ICPs ===");
  let created = 0;
  for (const seed of PILAE_ICPS) {
    const [existing] = await sql`
      SELECT id FROM icps WHERE tenant_id = ${PILAE_TENANT_ID} AND name = ${seed.name} LIMIT 1
    `;
    if (existing) {
      console.log(`  [--] "${seed.name}" already exists`);
      continue;
    }
    const [icp] = await sql<Array<{ id: string }>>`
      INSERT INTO icps (id, tenant_id, name, description, status, priority, metadata)
      VALUES (
        gen_random_uuid()::text, ${PILAE_TENANT_ID}, ${seed.name}, ${seed.description},
        'active', ${seed.priority}, ${sql.json({ source: "pilae_vertical_seed" })}
      )
      RETURNING id
    `;
    for (const c of seed.criteria) {
      await sql`
        INSERT INTO icp_criteria (id, icp_id, field_key, operator, value, weight, is_required)
        VALUES (
          gen_random_uuid()::text, ${icp.id}, ${c.fieldKey}, ${c.operator},
          ${sql.json(c.value as object)}, ${c.weight}, ${c.isRequired}
        )
      `;
    }
    console.log(`  [OK] "${seed.name}" (priority ${seed.priority}) + ${seed.criteria.length} criteria`);
    created++;
  }

  // Archive the empty auto-created "Default" ICP so it doesn't compete
  // for primary. Keep it (don't delete) for audit; just deactivate.
  const archived = await sql`
    UPDATE icps SET status = 'archived', updated_at = now()
    WHERE tenant_id = ${PILAE_TENANT_ID} AND name = 'Default' AND status = 'active'
    RETURNING id
  `;
  if (archived.length > 0) {
    console.log(`  [OK] archived ${archived.length} empty Default ICP`);
  }

  console.log(`\n  ${created} ICPs created.`);
  console.log("  Trigger recompute: inngest event icp/recompute-tenant { tenantId: 'pilae' }");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
