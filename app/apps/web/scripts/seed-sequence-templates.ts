/**
 * Seed the proven sequence-template library into a tenant.
 *
 * Instantiates each template in `lib/sequences/templates/catalog.ts` as a
 * `sequences` row (status `draft` by default — CONFIGURED, not activated) +
 * its `sequence_steps`, carrying `campaignConfig.triggerSignalTypes` so the
 * autopilot router lands each trigger's cohort on its own cadence.
 *
 * SAFE BY DEFAULT: dry-run unless `--apply`. Idempotent — re-seeding skips any
 * template already present for the tenant (dedupe on campaignConfig.templateId).
 *
 *   Dry run:  tsx scripts/seed-sequence-templates.ts <tenantId>
 *   Apply:    tsx scripts/seed-sequence-templates.ts <tenantId> --apply
 *   Activate: tsx scripts/seed-sequence-templates.ts <tenantId> --apply --active
 *
 * Env: DATABASE_URL_OWNER (or DATABASE_URL) — required with --apply.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { PROVEN_TEMPLATES } from "../src/lib/sequences/templates/registry";
import {
  instantiateTemplates,
  type InstantiateDeps,
  type SequenceInsert,
  type StepInsert,
} from "../src/lib/sequences/templates/instantiate";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readEnv(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  const envPath = join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return undefined;
  const line = readFileSync(envPath, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") : undefined;
}
const maskUrl = (s: string) => s.replace(/:\/\/[^@\s]*@/g, "://***:***@");

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const active = args.includes("--active");
  const tenantId = args.find((a) => !a.startsWith("--"));
  if (!tenantId) {
    console.error("[seed-templates] usage: tsx scripts/seed-sequence-templates.ts <tenantId> [--apply] [--active]");
    process.exit(2);
  }

  console.log(
    `[seed-templates] tenant=${tenantId} templates=${PROVEN_TEMPLATES.length} ` +
      `status=${active ? "active" : "draft"} mode=${apply ? "APPLY" : "dry-run"}`,
  );

  let sql: ReturnType<typeof postgres> | null = null;
  const deps: InstantiateDeps = {
    findExisting: async (tid, templateId) => {
      if (!sql) return null; // dry-run: pretend nothing exists → show full plan
      const rows = await sql`
        select id from sequences
        where tenant_id = ${tid} and campaign_config->>'templateId' = ${templateId}
        limit 1`;
      return rows[0] ? { id: rows[0].id as string } : null;
    },
    insertSequence: async (row: SequenceInsert) => {
      const id = randomUUID();
      if (sql) {
        await sql`
          insert into sequences (id, tenant_id, name, description, status, campaign_config, created_by, created_at, updated_at)
          values (${id}, ${row.tenantId}, ${row.name}, ${row.description}, ${row.status},
                  ${sql.json(row.campaignConfig)}, ${row.createdBy}, now(), now())`;
      }
      return { id };
    },
    insertSteps: async (rows: StepInsert[]) => {
      if (!sql) return;
      for (const s of rows) {
        await sql`
          insert into sequence_steps (id, sequence_id, step_number, step_type, subject_template, body_template, delay_days, channel_config, created_at)
          values (${randomUUID()}, ${s.sequenceId}, ${s.stepNumber}, ${s.stepType}, ${s.subjectTemplate},
                  ${s.bodyTemplate}, ${s.delayDays}, ${sql.json(s.channelConfig)}, now())`;
      }
    },
  };

  if (apply) {
    const url = readEnv("DATABASE_URL_OWNER") ?? readEnv("DATABASE_URL");
    if (!url) {
      console.error("[seed-templates] --apply needs DATABASE_URL_OWNER (or DATABASE_URL)");
      process.exit(2);
    }
    console.log(`[seed-templates] db=${maskUrl(url)}`);
    sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 5 });
  }

  try {
    const results = await instantiateTemplates(tenantId, PROVEN_TEMPLATES, deps, {
      status: active ? "active" : "draft",
    });
    for (const r of results) {
      const tag = r.outcome === "created" ? "NEW " : "skip";
      console.log(`  ${tag} ${r.templateId.padEnd(20)} ${r.outcome}${apply ? `  → ${r.sequenceId}` : ""}`);
    }
    const created = results.filter((r) => r.outcome === "created").length;
    console.log(`\n[seed-templates] ${created}/${results.length} ${apply ? "created" : "would be created"}.`);
    if (!apply) console.log(`[seed-templates] dry-run — nothing written. Re-run with --apply.`);
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[seed-templates] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
