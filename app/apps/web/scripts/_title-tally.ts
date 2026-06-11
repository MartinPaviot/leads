/** Read-only: contact title distribution + which properties keys exist
 * (does Apollo ingestion store seniority/departments?). Grounds the
 * title-chip design on real data. */
import postgres from "postgres";
async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const [counts] = await s`
    SELECT count(*)::int AS total,
           count(title)::int AS with_title,
           count(DISTINCT title)::int AS distinct_titles
    FROM contacts WHERE deleted_at IS NULL`;
  console.log("contacts:", JSON.stringify(counts));

  const keys = await s`
    SELECT k, count(*)::int n
    FROM contacts, LATERAL jsonb_object_keys(coalesce(properties,'{}'::jsonb)) k
    WHERE deleted_at IS NULL
    GROUP BY k ORDER BY n DESC LIMIT 25`;
  console.log("properties keys:", keys.map((r) => `${r.k}:${r.n}`).join(" | "));

  const seniority = await s`
    SELECT coalesce(properties->>'seniority','(none)') v, count(*)::int n
    FROM contacts WHERE deleted_at IS NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 15`;
  console.log("seniority values:", seniority.map((r) => `${r.v}:${r.n}`).join(" | "));

  const titles = await s`
    SELECT title, count(*)::int n FROM contacts
    WHERE deleted_at IS NULL AND title IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 40`;
  for (const t of titles) console.log(`  ${String(t.title).slice(0, 60).padEnd(62)} ${t.n}`);
  await s.end();
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
