/**
 * Tenant context wrapper for Inngest workers.
 *
 * The 49 Inngest workers in this codebase access the DB without setting
 * `app.tenant_id`. With the full-coverage RLS policies (migration 0038),
 * this means workers see ZERO rows on RLS-protected tables — UNLESS the
 * DB connection user has BYPASSRLS, which silently disables all tenant
 * isolation.
 *
 * This wrapper enforces explicit tenant context per worker step:
 *
 *   await runWithTenant(tenantId, async () => {
 *     return db.select().from(contacts);
 *   });
 *
 * For cross-tenant operations (cron jobs that iterate every tenant),
 * use `runAcrossTenants` which sets the variable per iteration:
 *
 *   const tenants = await runAsAdmin(() => db.select().from(tenants));
 *   for (const t of tenants) {
 *     await runWithTenant(t.id, async () => { ... });
 *   }
 *
 * `runAsAdmin` requires the DB user to have BYPASSRLS — it should only
 * be used for cron-level enumeration, never for tenant data access.
 */

import { setTenantId, clearTenantId } from "@/db/rls";

export async function runWithTenant<T>(
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new Error("runWithTenant: tenantId is required");
  }
  await setTenantId(tenantId);
  try {
    return await fn();
  } finally {
    await clearTenantId();
  }
}

/**
 * Run a function without any tenant context. Use ONLY for:
 *   - Listing all tenants (cron enumeration)
 *   - Cross-tenant maintenance (data retention, anonymized aggregation)
 *
 * Requires the DB user to have BYPASSRLS. If your deploy uses a
 * non-superuser, create a dedicated role:
 *   CREATE ROLE elevay_admin BYPASSRLS;
 *   GRANT elevay_admin TO your_app_user;
 */
export async function runAsAdmin<T>(fn: () => Promise<T>): Promise<T> {
  // Explicit no-op — but exists as a documentation marker so reviewers
  // can audit "where do we cross tenant boundaries".
  return fn();
}
