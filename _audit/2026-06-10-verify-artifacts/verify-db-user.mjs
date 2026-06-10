import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const webDir = path.resolve("app/apps/web");
const env = readFileSync(path.join(webDir, ".env.local"), "utf8");
const url = /^DATABASE_URL=["']?([^"'\r\n]+)/m.exec(env)?.[1];
console.log("db host:", url?.replace(/\/\/[^@]*@/, "//***@").slice(0, 80));
const require = createRequire(path.join(webDir, "package.json"));
const postgres = require("postgres");
const sql = postgres(url, { max: 1, idle_timeout: 5 });
const users = await sql`select id, clerk_id, email, tenant_id, deleted_at from users where id = ${"82aa3dc3-3f03-48d9-bcc8-96ce8ea52d46"} or email = 'martin@elevay.dev' limit 5`.catch((e) => ({ err: e.message }));
console.log("users:", JSON.stringify(users, null, 1).slice(0, 800));
const authUser = await sql`select id, email from auth_user where id = ${"890bac78-0347-47f0-a36c-9cbafeed4348"} limit 1`.catch((e) => ({ err: e.message }));
console.log("auth_user:", JSON.stringify(authUser).slice(0, 400));
const tenant = await sql`select id, name from tenants where id = ${"47dca783-dac0-45a5-85cb-d217b2a3174d"} limit 1`.catch((e) => ({ err: e.message }));
console.log("tenant:", JSON.stringify(tenant).slice(0, 300));
await sql.end();
