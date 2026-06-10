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

const cols = await sql`select column_name from information_schema.columns where table_name = 'call_campaigns'`;
console.log("cols:", cols.map((c) => c.column_name).join(", "));
const rows = await sql`select * from call_campaigns where tenant_id = ${T} order by created_at desc limit 5`;
for (const r of rows) console.log(JSON.stringify(r));
await sql.end();
