/**
 * Dev helper: promote the current test user to "admin" for a given
 * tenant. Used when validating admin-gated endpoints (custom
 * signals POST, tenant-settings PUT, etc.) without standing up a
 * fresh workspace with the admin seed.
 *
 * Run: `npx tsx scripts/grant-self-admin.ts <email>`
 */

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const email = process.argv[2];
if (!email) {
  console.error("usage: npx tsx scripts/grant-self-admin.ts <email>");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1, prepare: false });

async function main() {
  const before = await sql<Array<{ id: string; email: string; role: string; tenant_id: string }>>`
    SELECT id, email, role, tenant_id FROM users WHERE email = ${email} LIMIT 1
  `;
  if (before.length === 0) {
    console.error(`user not found: ${email}`);
    await sql.end({ timeout: 1 });
    process.exit(2);
  }
  const u = before[0];
  console.log(`before: ${u.email} role=${u.role} tenant=${u.tenant_id}`);
  if (u.role === "admin") {
    console.log("already admin — nothing to do");
    await sql.end({ timeout: 1 });
    process.exit(0);
  }
  await sql`UPDATE users SET role = 'admin' WHERE id = ${u.id}`;
  const after = await sql<Array<{ role: string }>>`SELECT role FROM users WHERE id = ${u.id}`;
  console.log(`after:  ${u.email} role=${after[0].role}`);
  await sql.end({ timeout: 1 });
  process.exit(0);
}

main();
