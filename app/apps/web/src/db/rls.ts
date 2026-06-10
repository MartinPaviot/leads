/**
 * SOC2 R-08b — tenant-context primitive for the 0074 RLS policies.
 *
 * `withTenantTx` is the ONLY way to bind `app.tenant_id`. Production
 * connects through Supavisor in TRANSACTION mode (port 6543): outside an
 * explicit transaction, consecutive statements can land on different
 * backend connections, so a session-scoped `set_config(..., false)`
 * does NOT reliably bind the variable to the queries that follow it —
 * and worse, it PERMANENTLY poisons whichever pooled backend it lands
 * on, because the matching "clear" lands on a different one.
 *
 * That poisoning is not theoretical: on 2026-06-10 (the day the app
 * switched to the non-owner `elevay_app` role), pooled backends carrying
 * a stale `app.tenant_id` made the 0074 WITH CHECK reject the
 * first-sign-in `INSERT INTO users` for every NEW tenant — new users
 * couldn't sign in at all (42501, surfaced as CallbackRouteError).
 * Post-mortem: _audit/2026-06-10-rls-session-poison.md.
 *
 * Therefore: NO session-scoped set_config('app.tenant_id', ..., false)
 * anywhere in the app. A tripwire test (rls.test.ts) greps the source
 * tree to keep it that way. Without a bound context, the 0074 fallback
 * policies allow everything and the app-layer `WHERE tenant_id = ?`
 * filters remain the enforcement — identical to the long-standing
 * behaviour. Strict mode (dropping the fallback) becomes possible once
 * every read path runs under `withTenantTx` — tracked as the R-08b
 * follow-up.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Execute `fn` inside a real transaction with `app.tenant_id` bound via
 * SET LOCAL semantics (`set_config(..., true)`). The transaction pins a
 * single pooled backend for its duration and the variable dies with the
 * transaction, so this is the only form that is sound through the
 * Supavisor transaction pooler — verified live by scripts/probe-rls.ts.
 *
 * Queries MUST go through the provided `tx`, not the global `db`,
 * or they escape the transaction (and therefore the context).
 */
export async function withTenantTx<T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    );
    return fn(tx);
  });
}
