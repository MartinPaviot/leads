import postgres from "postgres";
import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)?.[1];
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 5 });
const IDS = { test: "eba0842b-28fd-4c9c-9c17-d23395ac0a02", elevay: "82aa3dc3-3f03-48d9-bcc8-96ce8ea52d46", pilae: "e98c45b9-4080-4000-abaf-e8b4a884ca9b" };

// Every FK column in the DB that references users(id)
const fks = await sql`
  SELECT tc.table_name, kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'users' AND ccu.column_name = 'id'`;
console.log(`FK columns referencing users.id: ${fks.length}`);
for (const who of ["test","elevay"]) {
  console.log(`\nROWS REFERENCING ${who} (${IDS[who]}):`);
  let total = 0;
  for (const f of fks) {
    const [{ n }] = await sql.unsafe(`SELECT count(*)::int AS n FROM "${f.table_name}" WHERE "${f.column_name}" = $1`, [IDS[who]]);
    if (n > 0) { console.log(`  ${f.table_name}.${f.column_name}: ${n}`); total += n; }
  }
  console.log(`  TOTAL: ${total}`);
}
// auth side
const au = await sql`SELECT id, email FROM auth_user WHERE email IN ('test@leadsens.com','martin@elevay.dev','martin.paviot@pilae.ch')`;
console.log("\nAUTH_USER rows:"); for (const a of au) console.log(`  ${a.email}  ${a.id}`);
const inv = await sql`SELECT email, role FROM pending_invites WHERE tenant_id = '47dca783-dac0-45a5-85cb-d217b2a3174d'`.catch(() => []);
console.log("PENDING INVITES:", inv.length ? inv : "(none)");
await sql.end();
