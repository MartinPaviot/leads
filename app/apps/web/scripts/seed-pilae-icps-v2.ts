/**
 * Seed Pilae's TWO real ICPs as specified by Martin (2026-06).
 * Supersedes the 4 placeholder verticals from seed-pilae-icps.ts —
 * archives them, creates these two with precise Apollo-anchored
 * criteria.
 *
 * ICP-1 (priority 0) — Scale-up Tech / SaaS B2B & product studios
 * ICP-2 (priority 1) — Swiss tech-native finance (fintech / crypto-DLT / digital asset mgmt)
 *
 * Run ICP-1 first per Martin's note (rode the script on the most
 * reachable terrain before opening ICP-2).
 *
 * Idempotent: skips ICPs whose name already exists for the tenant.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/seed-pilae-icps-v2.ts
 */

import postgres from "postgres";

const PILAE_TENANT_ID = "pilae";

// Funding window: last raise 12-30 months ago = the bill has compounded.
const now = Date.now();
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const FUNDING_MIN = now - 30 * MONTH_MS; // oldest acceptable raise
const FUNDING_MAX = now - 12 * MONTH_MS; // most recent acceptable raise

type Crit = {
  fieldKey: string;
  operator: string;
  value: unknown;
  weight: number;
  isRequired: boolean;
};

type IcpSeed = { name: string; description: string; priority: number; criteria: Crit[] };

const ICPS: IcpSeed[] = [
  {
    name: "Scale-up Tech / SaaS B2B",
    description:
      "Éditeur logiciel / produit digital, 50-150 FTE (cœur ; widen 30-200), Suisse romande + France, founder/CTO-led, avec dépense SaaS remplaçable structurelle.",
    priority: 0,
    criteria: [
      // Geography — the FR/CH-romande wedge, hard filter.
      {
        fieldKey: "geography",
        operator: "in",
        value: [
          "Vaud", "Geneva", "Neuchâtel", "Fribourg", "Valais",
          "Île-de-France", "Auvergne-Rhône-Alpes", "Occitanie", "Nouvelle-Aquitaine",
        ],
        weight: 1,
        isRequired: true,
      },
      // Core size band.
      { fieldKey: "employee_count", operator: "between", value: { min: 50, max: 150 }, weight: 3, isRequired: false },
      // Industry.
      {
        fieldKey: "industry",
        operator: "in",
        value: ["Computer Software", "Information Technology and Services", "Internet"],
        weight: 2,
        isRequired: false,
      },
      // Proof-of-spend technologies — the replaceable-bill filter. Highest weight.
      {
        fieldKey: "technologies",
        operator: "in",
        value: [
          "Datadog", "New Relic", "Snowflake", "Okta", "Auth0", "Segment",
          "Vercel", "LaunchDarkly", "PagerDuty", "Looker", "Tableau",
          "MongoDB Atlas", "Confluent",
        ],
        weight: 3,
        isRequired: false,
      },
      // Business keywords.
      { fieldKey: "keywords", operator: "in", value: ["SaaS", "B2B", "API", "cloud-native", "platform"], weight: 1, isRequired: false },
      // Decision-maker persona (people-search post-filter).
      {
        fieldKey: "person_titles",
        operator: "in",
        value: [
          "CTO", "Chief Technology Officer", "VP Engineering", "Head of Engineering",
          "Head of Platform", "Head of Infrastructure", "Co-Founder", "Founder", "CEO",
        ],
        weight: 1,
        isRequired: false,
      },
      { fieldKey: "person_seniorities", operator: "in", value: ["c_suite", "founder", "vp", "director"], weight: 1, isRequired: false },
      // Funding: stage + the 12-30 month window.
      { fieldKey: "latest_funding_stage", operator: "in", value: ["seed", "series_a", "series_b"], weight: 1, isRequired: false },
      { fieldKey: "latest_funding_date", operator: "between", value: { min: FUNDING_MIN, max: FUNDING_MAX }, weight: 1, isRequired: false },
    ],
  },
  {
    name: "Finance suisse tech-native",
    description:
      "Services financiers hors banque tier-1 / privée traditionnelle — fintech, crypto/DLT, gestion d'actifs digitale, 30-150 FTE, Genève/Vaud/Zoug/Zurich, founder/CTO-led.",
    priority: 1,
    criteria: [
      {
        fieldKey: "geography",
        operator: "in",
        value: ["Geneva", "Vaud", "Zug", "Zurich"],
        weight: 1,
        isRequired: true,
      },
      { fieldKey: "employee_count", operator: "between", value: { min: 30, max: 150 }, weight: 3, isRequired: false },
      {
        fieldKey: "industry",
        operator: "in",
        value: ["Financial Services", "Banking", "Investment Management", "Capital Markets"],
        weight: 2,
        isRequired: false,
      },
      {
        fieldKey: "keywords",
        operator: "in",
        value: [
          "fintech", "crypto", "blockchain", "digital assets", "tokenization", "DLT",
          "wealthtech", "asset management", "payments", "neobank", "FINMA", "regulated",
        ],
        weight: 2,
        isRequired: false,
      },
      { fieldKey: "technologies", operator: "in", value: ["Okta", "Auth0", "AWS", "Azure", "Segment"], weight: 2, isRequired: false },
      {
        fieldKey: "person_titles",
        operator: "in",
        value: [
          "CTO", "Co-Founder", "Founder", "CEO", "Head of Engineering",
          "Head of Infrastructure", "CISO", "Head of Compliance",
        ],
        weight: 1,
        isRequired: false,
      },
      { fieldKey: "person_seniorities", operator: "in", value: ["c_suite", "founder"], weight: 1, isRequired: false },
      { fieldKey: "latest_funding_stage", operator: "in", value: ["seed", "series_a", "series_b"], weight: 1, isRequired: false },
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

  const [tenant] = await sql`SELECT id FROM tenants WHERE id = ${PILAE_TENANT_ID} LIMIT 1`;
  if (!tenant) {
    console.error(`Tenant '${PILAE_TENANT_ID}' not found. Run seed-pilae-tenant.ts first.`);
    process.exit(1);
  }

  // Archive the 4 placeholder verticals (keep for audit, deactivate).
  const archived = await sql`
    UPDATE icps SET status = 'archived', updated_at = now()
    WHERE tenant_id = ${PILAE_TENANT_ID}
      AND status = 'active'
      AND name IN ('SaaS / Tech', 'Fintech', 'Santé', 'Agence')
    RETURNING name
  `;
  if (archived.length > 0) {
    console.log(`Archived ${archived.length} placeholder ICPs: ${archived.map((r) => r.name).join(", ")}`);
  }

  console.log("\n=== Seed Pilae v2 ICPs ===");
  let created = 0;
  for (const seed of ICPS) {
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
        'active', ${seed.priority}, ${sql.json({ source: "pilae_icp_v2" })}
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

  console.log(`\n  ${created} ICPs created. Funding window: ${new Date(FUNDING_MIN).toISOString().slice(0, 10)} → ${new Date(FUNDING_MAX).toISOString().slice(0, 10)}`);
  console.log("  Build TAM (ICP-1 first): /settings/icp-profiles → 'Build TAM', or");
  console.log("  POST /api/tam/build { icpId: '<Scale-up Tech / SaaS B2B id>' }");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
