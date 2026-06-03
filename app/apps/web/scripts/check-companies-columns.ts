import postgres from "postgres";
async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const cols = await s`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='companies' ORDER BY ordinal_position`;
  const have = new Set(cols.map((c) => c.column_name as string));
  console.log("DB companies columns:", [...have].join(", "));
  const expected: Record<string, string> = {
    resolved_logo_url: "text",
    resolved_logo_tier: "integer",
    logo_resolved_at: "timestamptz",
    user_uploaded_logo_url: "text",
    excluded_reason: "text",
    excluded_at: "timestamptz",
    priority_score: "real",
    priority_score_computed_at: "timestamptz",
  };
  console.log("\nMISSING (schema declares, DB lacks):");
  for (const [c, t] of Object.entries(expected)) {
    if (!have.has(c)) console.log(`   ${c}  ${t}`);
  }
  await s.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
