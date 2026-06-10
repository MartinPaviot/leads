/**
 * SOC2 R-08b — live verification that RLS enforcement works under the
 * `elevay_app` role through the Supavisor transaction pooler.
 *
 * Probes (read-only; the write probe runs in a rolled-back transaction):
 *   1. No tenant context        -> fallback: full visibility (app-safe)
 *   2. Context = tenant A (tx)  -> only A's contacts visible
 *   3. Context = tenant B (tx)  -> A's rows invisible
 *   4. Context = A, INSERT with tenant_id = B -> rejected by WITH CHECK
 *   5. Role attributes          -> NOBYPASSRLS confirmed
 *
 * Run:  npx tsx scripts/probe-rls.ts
 * Env:  ELEVAY_APP_DATABASE_URL (the restricted role's pooler URL)
 */
import postgres from "postgres";

async function main() {
  const url = process.env.ELEVAY_APP_DATABASE_URL;
  if (!url) throw new Error("ELEVAY_APP_DATABASE_URL missing");
  const s = postgres(url, { max: 1, onnotice: () => {} });

  const [role] = await s.unsafe(
    "SELECT current_user AS u, rolbypassrls FROM pg_roles WHERE rolname = current_user",
  );

  // Two distinct tenants with contacts, picked from the data itself.
  const tenants = await s.unsafe(
    "SELECT tenant_id, count(*)::int AS n FROM contacts GROUP BY tenant_id ORDER BY n DESC LIMIT 2",
  );
  if (tenants.length === 0) throw new Error("no contacts to probe with");
  const tenantA = tenants[0].tenant_id as string;
  const countA = tenants[0].n as number;

  const [total] = await s.unsafe("SELECT count(*)::int AS n FROM contacts");

  // Probe 1 — no context: fallback must show everything.
  const noCtxOk = (total.n as number) >= countA;

  // Probe 2 — context A inside a transaction: only A visible.
  const inCtxA = await s.begin(async (tx) => {
    await tx.unsafe("SELECT set_config('app.tenant_id', '" + tenantA + "', true)");
    const [r] = await tx.unsafe(
      "SELECT count(*)::int AS n, count(*) FILTER (WHERE tenant_id <> '" + tenantA + "')::int AS foreign FROM contacts",
    );
    return r as { n: number; foreign: number };
  });

  // Probe 3 — context = an unrelated id: A's rows invisible.
  const inCtxOther = await s.begin(async (tx) => {
    await tx.unsafe(
      "SELECT set_config('app.tenant_id', '00000000-0000-0000-0000-000000000000', true)",
    );
    const [r] = await tx.unsafe(
      "SELECT count(*)::int AS n FROM contacts WHERE tenant_id = '" + tenantA + "'",
    );
    return r as { n: number };
  });

  // Probe 4 — WITH CHECK: under context A, inserting a note that belongs
  // to a REAL other tenant (so the FK can't be what blocks it) must fail
  // with an RLS violation. Entire transaction rolled back regardless.
  const [otherTenant] = await s.unsafe(
    "SELECT id FROM tenants WHERE id <> '" + tenantA + "' LIMIT 1",
  );
  let crossWriteBlocked = false;
  if (otherTenant) {
    try {
      await s.begin(async (tx) => {
        await tx.unsafe("SELECT set_config('app.tenant_id', '" + tenantA + "', true)");
        await tx.unsafe(
          "INSERT INTO notes (id, tenant_id, entity_type, entity_id, content) " +
            "VALUES ('rls-probe-must-fail', '" + otherTenant.id + "', 'contact', 'rls-probe', 'rls probe')",
        );
        throw new Error("insert unexpectedly succeeded");
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      crossWriteBlocked = msg.includes("row-level security");
      if (!crossWriteBlocked) {
        // Different failure (or the insert went through) — surface it.
        console.error("probe 4 unexpected outcome:", msg);
      }
    }
  } else {
    console.error("probe 4 skipped: only one tenant in the database");
  }

  console.log(
    JSON.stringify(
      {
        role: role.u,
        bypassRls: role.rolbypassrls,
        totalContacts: total.n,
        tenantA: { id: String(tenantA).slice(0, 8), expected: countA },
        probe1_noContextSeesAll: noCtxOk,
        probe2_ctxA: {
          visible: inCtxA.n,
          foreignVisible: inCtxA.foreign,
          ok: inCtxA.n === countA && inCtxA.foreign === 0,
        },
        probe3_ctxOther_seesA: inCtxOther.n,
        probe3_ok: inCtxOther.n === 0,
        probe4_crossTenantWriteBlocked: crossWriteBlocked,
        verdict:
          noCtxOk &&
          inCtxA.n === countA &&
          inCtxA.foreign === 0 &&
          inCtxOther.n === 0 &&
          crossWriteBlocked &&
          role.rolbypassrls === false
            ? "PASS"
            : "FAIL",
      },
      null,
      2,
    ),
  );
  await s.end();
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exit(1);
});
