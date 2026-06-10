import postgres from "postgres";
import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)?.[1];
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 5 });
const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const U = { test: "eba0842b-28fd-4c9c-9c17-d23395ac0a02", elevay: "82aa3dc3-3f03-48d9-bcc8-96ce8ea52d46", pilae: "e98c45b9-4080-4000-abaf-e8b4a884ca9b" };
const A = { test: "403f9ebb-0857-4aa3-b4b8-790cb832d533", elevay: "890bac78-0347-47f0-a36c-9cbafeed4348" };

// Identity guards — abort if the DB doesn't match what we inspected.
const rows = await sql`SELECT id, email FROM users WHERE tenant_id = ${TENANT} ORDER BY email`;
const expect = { [U.test]: "test@leadsens.com", [U.elevay]: "martin@elevay.dev", [U.pilae]: "martin.paviot@pilae.ch" };
if (rows.length !== 3 || rows.some(r => expect[r.id] !== r.email)) {
  console.log("ABORT — membership changed since inspection:", rows); process.exit(1);
}

await sql.begin(async (tx) => {
  const threads = await tx`UPDATE chat_threads SET user_id = ${U.pilae} WHERE user_id = ${U.elevay}`;
  const notes   = await tx`UPDATE notes SET author_id = ${U.pilae} WHERE author_id = ${U.elevay}`;
  const notifs  = await tx`DELETE FROM notifications WHERE user_id IN (${U.test}, ${U.elevay})`;
  const prefs   = await tx`DELETE FROM notification_preferences WHERE user_id = ${U.elevay}`;
  const users   = await tx`DELETE FROM users WHERE id IN (${U.test}, ${U.elevay})`;
  const owner   = await tx`UPDATE users SET role = 'admin', updated_at = now() WHERE id = ${U.pilae}`;
  const auths   = await tx`DELETE FROM auth_user WHERE id IN (${A.test}, ${A.elevay})`; // sessions+accounts cascade
  console.log(`reassigned: chat_threads=${threads.count} notes=${notes.count}`);
  console.log(`deleted: notifications=${notifs.count} notif_prefs=${prefs.count} users=${users.count} auth_users=${auths.count}`);
  console.log(`promoted: pilae role->admin (${owner.count})`);
});

const after = await sql`SELECT email, role FROM users WHERE tenant_id = ${TENANT}`;
console.log("\nAFTER — workspace members:"); for (const m of after) console.log(`  ${m.email}  role=${m.role}`);
const authAfter = await sql`SELECT email FROM auth_user WHERE email IN ('test@leadsens.com','martin@elevay.dev')`;
console.log("auth_user leftovers for removed:", authAfter.length === 0 ? "(none — logins dead)" : authAfter);
await sql.end();
