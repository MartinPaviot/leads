/**
 * Pre-cutover smoke test for the elevay_app role: confirm it can read the
 * core tables and run a full write cycle (insert/update/delete) — all in a
 * rolled-back transaction so prod data is untouched. No tenant context set,
 * so this exercises exactly the app's current (fallback) behaviour.
 */
import postgres from "postgres";

async function main() {
  const s = postgres(process.env.ELEVAY_APP_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const reads: Record<string, number> = {};
  for (const t of ["companies", "contacts", "deals", "activities", "users", "auth_user", "tenants", "notes", "sequences"]) {
    const [r] = await s.unsafe(`SELECT count(*)::int AS n FROM ${t}`);
    reads[t] = r.n as number;
  }

  const [tenant] = await s.unsafe("SELECT id FROM tenants LIMIT 1");
  let writeCycle = "skipped";
  await s
    .begin(async (tx) => {
      const id = "smoke-" + Date.now();
      await tx.unsafe(
        "INSERT INTO notes (id, tenant_id, entity_type, entity_id, content) VALUES ($1,$2,'contact','smoke','before')",
        [id, tenant.id],
      );
      await tx.unsafe("UPDATE notes SET content = 'after' WHERE id = $1", [id]);
      const [chk] = await tx.unsafe("SELECT content FROM notes WHERE id = $1", [id]);
      await tx.unsafe("DELETE FROM notes WHERE id = $1", [id]);
      writeCycle = chk?.content === "after" ? "ok" : "unexpected";
      throw new Error("rollback");
    })
    .catch((e) => {
      if (!(e instanceof Error) || e.message !== "rollback") throw e;
    });

  console.log(JSON.stringify({ reads, writeCycle, verdict: writeCycle === "ok" ? "PASS" : "FAIL" }, null, 2));
  await s.end();
}
main().catch((e) => { console.error("ERR", e instanceof Error ? e.message : e); process.exit(1); });
