import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const webDir = path.resolve("app/apps/web");
const env = readFileSync(path.join(webDir, ".env.local"), "utf8");
const url = /^DATABASE_URL=["']?([^"'\r\n]+)/m.exec(env)?.[1];
const require = createRequire(path.join(webDir, "package.json"));
const postgres = require("postgres");
const sql = postgres(url, { max: 1, idle_timeout: 5 });
const rows = await sql`select id, email, tenant_id, clerk_id from users where id in ('e98c45b9-4080-4000-abaf-e8b4a884ca9b','82aa3dc3-3f03-48d9-bcc8-96ce8ea52d46')`;
console.log(JSON.stringify(rows, null, 1));
await sql.end();
