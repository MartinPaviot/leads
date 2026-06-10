/**
 * FINDING-007: Row-Level Security session variable helper.
 *
 * Before executing tenant-scoped queries, call `setTenantId(tenantId)`
 * to bind the PostgreSQL session variable `app.tenant_id`. RLS policies
 * on contacts, companies, deals, and activities use this variable to
 * enforce tenant isolation at the database level.
 *
 * This is defense-in-depth — the app layer continues to filter by
 * tenantId in every query. RLS catches any query that forgets the
 * WHERE clause.
 *
 * Usage in API routes / server actions:
 *
 *   import { withTenantRLS } from "@/db/rls";
 *   const results = await withTenantRLS(tenantId, async () => {
 *     return db.select().from(contacts); // RLS restricts to tenant
 *   });
 *
 * Usage in Inngest functions (where you control the connection):
 *
 *   await setTenantId(tenantId);
 *   // ... queries ...
 *   await clearTenantId();
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Set the PostgreSQL session variable `app.tenant_id` so RLS policies
 * can enforce tenant isolation. Must be called before any tenant-scoped
 * query on an RLS-protected table.
 */
export async function setTenantId(tenantId: string): Promise<void> {
  // Use SET LOCAL so the variable is scoped to the current transaction.
  // If not inside a transaction, SET (without LOCAL) scopes to the session.
  // The parameterised form prevents SQL injection.
  await db.execute(
    sql`SELECT set_config('app.tenant_id', ${tenantId}, false)`
  );
}

/**
 * Clear the tenant context. Call this after completing tenant-scoped
 * work to prevent leaking context to subsequent queries on the same
 * connection (important for connection-pooled setups).
 */
export async function clearTenantId(): Promise<void> {
  await db.execute(
    sql`SELECT set_config('app.tenant_id', '', false)`
  );
}

/**
 * Execute a callback with `app.tenant_id` set for the duration, then
 * clear it. This is the recommended wrapper for API routes and server
 * actions that need RLS enforcement.
 *
 * @example
 * const rows = await withTenantRLS(tenantId, () =>
 *   db.select().from(contacts).where(eq(contacts.email, email))
 * );
 */
export async function withTenantRLS<T>(
  tenantId: string,
  fn: () => Promise<T>
): Promise<T> {
  await setTenantId(tenantId);
  try {
    return await fn();
  } finally {
    await clearTenantId();
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * SOC2 R-08b — the POOLER-SOUND tenant context primitive.
 *
 * Production connects through Supavisor in TRANSACTION mode (port 6543):
 * outside an explicit transaction, consecutive statements can land on
 * different backend connections, so the session-scoped `setTenantId`
 * above does NOT reliably bind the RLS variable to the queries that
 * follow it. This wrapper opens a real transaction (pinned to one
 * backend for its duration) and uses SET LOCAL semantics
 * (set_config(..., true)), so every query made through `tx` runs with
 * the tenant context enforced by the 0074 policies — verified live by
 * scripts/probe-rls.ts.
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
