/**
 * One-shot purge of synthetic test rows on tenant 47dca783 (2026-06-10).
 *
 * Explicit id allowlist (human-reviewed, see _audit/2026-06-10-test-data-purge):
 * - 8 companies created 2026-04-02 by e2e/calibration runs (all already
 *   soft-deleted: E2E Corp variants, Demo Corp, ImportCo, XSS, unicode, AAAA…)
 * - 7 archived test contacts from the same day
 * - 3 ACTIVE seed contacts (+seed@ addresses: Zane Aardvark, Yara Borealis,
 *   Sarah Chen) — synthetic rows attached to real companies, companies kept.
 * KEPT (real organizations matched by the probe regexes): International
 * Testing Agency (ita.sport), Myotest SA, Outsight, Spineart.
 *
 * Hard delete (the archived ones already sat in the Archive view as junk).
 * Full row backup is written to _audit before any delete. DRY_RUN=1 to preview.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import postgres from "postgres";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const DRY = process.env.DRY_RUN === "1";

const COMPANY_IDS = [
  "b2eecb1f-27da-47bd-a51a-2c1635b98d37", // E2E Updated Corp
  "6821460e-9d39-4a5b-b8f1-668d9def1f84", // Demo Corp
  "ec83e21b-3828-47eb-8212-012fa9aa8a78", // E2E Test Corp
  "79382f17-94f6-4736-8597-b06c81c4d051", // unicode test
  "e5c2e3a3-779c-4d92-8a24-6a25fc814e64", // AAAA… long name
  "b6a83b0b-3a69-49b5-8cc2-c75296c058c5", // <script>alert(1)</script>Test
  "add2dbba-ef90-4a4d-b6e9-af78939a2c84", // E2E Full Test Corp
  "1ee138e0-b440-4478-8e0f-2514114679ca", // ImportCo
];
const CONTACT_IDS = [
  "f14942ab-6032-4530-a385-d46f2a1a3797", // Test Contact
  "f45098dd-f4b2-4e24-b341-6173cc35f499", // E2E Tester
  "240f1b53-b719-4de1-a524-2cb4f970e01b", // Import Test1
  "867f48a8-2385-4ee9-afd2-0d78a47c2a33", // Import Test2
  "b12b1863-25cf-4e37-8258-daee083e53ef", // Import Test3
  "fbe27f06-e493-4329-96b9-c02e6bafc7c1", // E2E TestContact
  "efade875-7e0e-4a92-ba1c-e7b926b6eaf3", // Fixed User
  "1a34e687-d409-4caa-a4a1-781a7ee82e41", // Zane Aardvark (+seed, ACTIVE)
  "af1a3bc1-866a-45c7-a049-8a00befa934f", // Yara Borealis (+seed, ACTIVE)
  "6d6bcbbf-206e-4f16-bc62-15178fab74a2", // Sarah Chen (+seed, ACTIVE)
];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const sql = postgres(env.DATABASE_URL, { prepare: false });

// Sweep scope: contacts explicitly listed PLUS any contact still attached to
// a purged company (defence against rows the probes missed).
const contactRows = await sql`
  select * from contacts
  where tenant_id = ${TENANT}
    and (id = any(${CONTACT_IDS}) or company_id = any(${COMPANY_IDS}))`;
const allContactIds = contactRows.map((r) => r.id);
const entityIds = [...COMPANY_IDS, ...allContactIds];

const companyRows = await sql`select * from companies where tenant_id = ${TENANT} and id = any(${COMPANY_IDS})`;
const dealRows = await sql`select * from deals where tenant_id = ${TENANT} and (company_id = any(${COMPANY_IDS}) or contact_id = any(${allContactIds}))`;
const activityRows = await sql`select * from activities where tenant_id = ${TENANT} and entity_id = any(${entityIds})`;
const noteRows = await sql`select * from notes where tenant_id = ${TENANT} and entity_id = any(${entityIds})`;
const taskRows = await sql`select * from tasks where tenant_id = ${TENANT} and entity_id = any(${entityIds})`;
const suppressionRows = await sql`select * from account_suppressions where tenant_id = ${TENANT} and company_id = any(${COMPANY_IDS})`;
const enrollmentRows = await sql`select * from sequence_enrollments where contact_id = any(${allContactIds})`;

console.log(`scope: ${companyRows.length} companies, ${contactRows.length} contacts, ${dealRows.length} deals, ${activityRows.length} activities, ${noteRows.length} notes, ${taskRows.length} tasks, ${suppressionRows.length} suppressions, ${enrollmentRows.length} enrollments`);
for (const c of companyRows) console.log(`  company: ${c.name}`);
for (const c of contactRows) console.log(`  contact: ${c.first_name ?? ""} ${c.last_name ?? ""} <${c.email ?? "-"}>${c.deleted_at ? " [archived]" : " [ACTIVE]"}`);

const backupDir = new URL("../../../../_audit/2026-06-10-test-data-purge/", import.meta.url);
mkdirSync(backupDir, { recursive: true });
writeFileSync(
  new URL("purged-rows-backup.json", backupDir),
  JSON.stringify({ purgedAt: new Date().toISOString(), tenant: TENANT, companies: companyRows, contacts: contactRows, deals: dealRows, activities: activityRows, notes: noteRows, tasks: taskRows, suppressions: suppressionRows, enrollments: enrollmentRows }, null, 2),
);
console.log("backup written to _audit/2026-06-10-test-data-purge/purged-rows-backup.json");

if (DRY) {
  console.log("DRY_RUN=1 — nothing deleted.");
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  const counts = {};
  counts.enrollments = (await tx`delete from sequence_enrollments where contact_id = any(${allContactIds}) returning id`).length;
  counts.activities = (await tx`delete from activities where tenant_id = ${TENANT} and entity_id = any(${entityIds}) returning id`).length;
  counts.notes = (await tx`delete from notes where tenant_id = ${TENANT} and entity_id = any(${entityIds}) returning id`).length;
  counts.tasks = (await tx`delete from tasks where tenant_id = ${TENANT} and entity_id = any(${entityIds}) returning id`).length;
  counts.deals = (await tx`delete from deals where tenant_id = ${TENANT} and (company_id = any(${COMPANY_IDS}) or contact_id = any(${allContactIds})) returning id`).length;
  counts.suppressions = (await tx`delete from account_suppressions where tenant_id = ${TENANT} and company_id = any(${COMPANY_IDS}) returning id`).length;
  counts.contacts = (await tx`delete from contacts where tenant_id = ${TENANT} and id = any(${allContactIds}) returning id`).length;
  counts.companies = (await tx`delete from companies where tenant_id = ${TENANT} and id = any(${COMPANY_IDS}) returning id`).length;
  console.log("deleted:", JSON.stringify(counts));
});

await sql.end();
console.log("purge complete");
