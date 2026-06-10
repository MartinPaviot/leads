import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const file = join(__dirname, "..", "drizzle", "0074_rls_enforced.sql");
  const s = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await s.unsafe(readFileSync(file, "utf8"));
  const [pol] = await s.unsafe("SELECT count(*)::int AS n FROM pg_policies");
  const [rls] = await s.unsafe(
    "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'public' AND c.relrowsecurity",
  );
  console.log(`policies: ${pol.n}, tables with RLS enabled: ${rls.n}`);
  await s.end();
  console.log("0074 applied.");
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
