/**
 * Seed the Pilae dogfood tenant.
 *
 * Idempotent — re-running is safe: ON CONFLICT DO NOTHING on `tenants.id`
 * (we use the deterministic id `pilae` rather than a random UUID so
 * ops scripts can reference it without a lookup).
 *
 * The ICP block is a *placeholder* shape. Edit `tenants.settings.icp`
 * in the DB (or via the future tenant-config admin UI) once the real
 * verticales / personas / anti-ICP list is decided. The structure
 * matches what the spec-v2.md §1 D5 wedge isolation reads.
 *
 * Why hard-coded values are OK as a seed:
 *   - deepDiveWeeklyCap=2 is the documented Pilae default (spec R9.1)
 *   - locale=fr-fr matches the FR/CH dogfood scope (D5)
 *   - placeholder verticales (saas_tech / fintech / sante / agence)
 *     are exactly what the spec proposed as the starting set —
 *     change in DB without a code change
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/seed-pilae-tenant.ts
 */

import postgres from "postgres";

const PILAE_TENANT_ID = "pilae";

const PILAE_SETTINGS = {
  // B7 capacity rule — Paul's weekly deep-dive cap.
  deepDiveWeeklyCap: 2,
  // D5 wedge isolation — locale drives message generator branching.
  // Templates that are FR-only live in this tenant's config store,
  // not in lib/ai/. Update to "fr-ch" if you switch the tenant's
  // primary GTM to Switzerland.
  locale: "fr-fr",
  // ICP — verticales, personas, anti-ICP. Edit these to match the
  // real GTM list. The shape is read by the priority-score formula
  // (R4.2) and the anti-ICP exclusion check (R2.3).
  icp: {
    verticales: ["saas_tech", "fintech", "sante", "agence"],
    geo: ["FR", "CH"],
    personas: {
      decideur: ["CTO", "Head of Platform"],
      influenceur: ["DevOps", "SRE"],
      bloqueur: ["RSSI", "DAF"],
    },
    anti_icp: ["pre_seed", "< 5 FTE"],
    // Signal taxonomy extension specific to Pilae's GTM.
    // The signal-monitor matches these to fired signals on companies.
    signal_taxonomy_extended: [
      "funding_recent",
      "hiring_sre",
      "hiring_platform_engineer",
      "nis2_mention",
      "dora_mention",
      "hds_mention",
      "saas_renewal_window",
      "incident_public",
    ],
  },
  // Approval mode — defaults to manual (founder reviews every draft).
  // Switch to "auto" once the tenant is well-calibrated.
  approvalMode: "manual",
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });

  // 1. Insert (or skip if already present).
  const [row] = await sql<
    Array<{ id: string; created: boolean }>
  >`
    WITH inserted AS (
      INSERT INTO tenants (id, name, plan, settings)
      VALUES (
        ${PILAE_TENANT_ID},
        'Pilae',
        'trial',
        ${sql.json(PILAE_SETTINGS)}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    )
    SELECT
      COALESCE((SELECT id FROM inserted), ${PILAE_TENANT_ID}) AS id,
      EXISTS (SELECT 1 FROM inserted) AS created
  `;

  if (row.created) {
    console.log(`[OK] Created tenant '${row.id}'.`);
  } else {
    console.log(`[--] Tenant '${row.id}' already exists. Skipped insert.`);
    // Surface current settings so the operator can verify shape.
    const [existing] = await sql<
      Array<{ name: string; settings: unknown }>
    >`
      SELECT name, settings FROM tenants WHERE id = ${PILAE_TENANT_ID}
    `;
    if (existing) {
      const keys = Object.keys(
        (existing.settings as Record<string, unknown>) ?? {},
      );
      console.log(
        `       Current settings keys: ${keys.join(", ") || "<empty>"}`,
      );
    }
  }

  console.log("\nNext steps:");
  console.log("  1. Connect a mailbox: /settings/sending-infrastructure");
  console.log("  2. Connect Unipile (once LinkedIn S1 merges): /settings/linkedin");
  console.log("  3. Set ANTHROPIC_API_KEY for the playbook LLM extractor");
  console.log("  4. Visit /insights/pilae to start watching");
  console.log("  5. Edit tenants.settings.icp in DB or via admin UI to refine the verticales / personas / anti-ICP list");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
