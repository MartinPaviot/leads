import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const webDir = path.resolve("app/apps/web");
const env = readFileSync(path.join(webDir, ".env.local"), "utf8");
const url = /^DATABASE_URL=["']?([^"'\r\n]+)/m.exec(env)?.[1];
const require = createRequire(path.join(webDir, "package.json"));
const postgres = require("postgres");
const sql = postgres(url, { max: 1, idle_timeout: 5 });
const T = "47dca783-dac0-45a5-85cb-d217b2a3174d";

const tenants = await sql`select id, name, created_at from tenants order by created_at desc limit 10`;
console.log("tenants:", JSON.stringify(tenants, null, 1));
const user = await sql`select id, email, tenant_id from users where id = ${"82aa3dc3-3f03-48d9-bcc8-96ce8ea52d46"}`;
console.log("app user:", JSON.stringify(user));
const counts = await sql`select
  (select count(*) from companies where tenant_id = ${T} and deleted_at is null) as accounts,
  (select count(*) from contacts where tenant_id = ${T} and deleted_at is null) as contacts,
  (select count(*) from deals where tenant_id = ${T}) as deals`;
console.log("counts 47dca783:", JSON.stringify(counts));
await sql.end();
