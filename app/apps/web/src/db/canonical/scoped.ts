/**
 * Tenant-scoping guard for the canonical layer (spec 00, AC5). Pure — no DB.
 * Every canonical read/write must supply a workspace (tenant) predicate; a call
 * without one throws rather than silently returning cross-tenant rows. This is
 * the enforced layer the audit found missing (RLS is fallback-permissive, see
 * RECONCILE.md AC5). Repo column is `tenant_id` (= the spec's workspace_id).
 */
import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export class WorkspaceScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceScopeError";
  }
}

/**
 * Assert a usable workspace id and return it. Throws WorkspaceScopeError on
 * null/empty/non-string — the single chokepoint that makes "reject any query
 * lacking a workspace predicate" a hard guarantee.
 */
export function requireWorkspace(tenantId: unknown): string {
  if (typeof tenantId !== "string" || tenantId.trim() === "") {
    throw new WorkspaceScopeError(
      "canonical query is missing a workspace (tenant_id) predicate",
    );
  }
  return tenantId;
}

/**
 * Build a tenant-scoped WHERE condition: requireWorkspace + eq(tenant_id) AND
 * any extra predicates. Use for every canonical select/update so the tenant
 * filter can never be forgotten.
 */
export function workspacePredicate(
  tenantColumn: AnyPgColumn,
  tenantId: unknown,
  ...extra: Array<SQL | undefined>
): SQL {
  const ws = requireWorkspace(tenantId);
  const conds = [eq(tenantColumn, ws), ...extra.filter((c): c is SQL => !!c)];
  return conds.length === 1 ? conds[0] : (and(...conds) as SQL);
}
