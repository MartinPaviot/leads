// One-off recon: user_mfa_secrets columns (table exists in prod but not in
// the Drizzle schema) + DB role RLS posture (SOC2 T8). Read-only.
import postgres from "postgres";

async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const cols = await s.unsafe(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_mfa_secrets' ORDER BY ordinal_position",
  );
  console.log("user_mfa_secrets columns:", JSON.stringify(cols));
  const role = await s.unsafe(
    "SELECT current_user AS user, r.rolbypassrls, r.rolsuper FROM pg_roles r WHERE r.rolname = current_user",
  );
  console.log("db role:", JSON.stringify(role));
  const pol = await s.unsafe(
    "SELECT tablename, count(*)::int AS n FROM pg_policies GROUP BY tablename ORDER BY tablename",
  );
  console.log("rls policies:", JSON.stringify(pol));
  const rls = await s.unsafe(
    "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('contacts','companies','deals','activities') ORDER BY relname",
  );
  console.log("rls enabled:", JSON.stringify(rls));
  await s.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
