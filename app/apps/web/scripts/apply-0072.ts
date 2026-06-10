import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const file = join(__dirname, "..", "drizzle", "0072_user_offboarding.sql");
  const raw = await readFile(file, "utf8");
  const statements = raw
    .split("--> statement-breakpoint")
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  for (const stmt of statements) {
    await s.unsafe(stmt);
    console.log("applied:", stmt.slice(0, 70).replace(/\s+/g, " "), "...");
  }
  const chk = await s.unsafe(
    "SELECT table_name, column_name FROM information_schema.columns WHERE (table_name='users' AND column_name='deactivated_at') OR (table_name='auth_user' AND column_name='password_changed_at')",
  );
  console.log("verified columns:", JSON.stringify(chk));
  await s.end();
  console.log("0072 applied.");
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
