/**
 * Soft-delete helpers for core CRM tables.
 *
 * Instead of `DELETE FROM`, rows get `deleted_at = now()`. The partial
 * indexes created in migration 0030 ensure queries that filter
 * `WHERE deleted_at IS NULL` skip deleted rows efficiently.
 */

import { db } from "@/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { contacts, companies, deals, activities, notes, tasks } from "@/db/schema";

// Tables that support soft delete, keyed by their string name for
// dynamic dispatch from generic callers.
const SOFT_DELETE_TABLES: Record<string, PgTable> = {
  contacts,
  companies,
  deals,
  activities,
  notes,
  tasks,
};

/**
 * Resolve a table reference from either a PgTable object or a string name.
 */
function resolveTable(table: PgTable | string): PgTable {
  if (typeof table === "string") {
    const resolved = SOFT_DELETE_TABLES[table];
    if (!resolved) {
      throw new Error(`soft-delete: unknown table "${table}". Expected one of: ${Object.keys(SOFT_DELETE_TABLES).join(", ")}`);
    }
    return resolved;
  }
  return table;
}

/**
 * Soft-delete a row: sets `deleted_at = now()` instead of hard-deleting.
 *
 * @returns The number of rows affected (0 if not found or already deleted).
 */
export async function softDelete(
  table: PgTable | string,
  id: string,
  tenantId: string,
): Promise<number> {
  const t = resolveTable(table);
  // Use raw SQL to set deleted_at since column references are dynamic
  const result = await db.execute(sql`
    UPDATE ${t}
    SET deleted_at = now()
    WHERE id = ${id}
      AND tenant_id = ${tenantId}
      AND deleted_at IS NULL
  `);
  return Number((result as any).rowCount ?? (result as any).count ?? 0);
}

/**
 * Restore a soft-deleted row: sets `deleted_at = NULL`.
 *
 * @returns The number of rows affected (0 if not found or not deleted).
 */
export async function restoreDeleted(
  table: PgTable | string,
  id: string,
  tenantId: string,
): Promise<number> {
  const t = resolveTable(table);
  const result = await db.execute(sql`
    UPDATE ${t}
    SET deleted_at = NULL
    WHERE id = ${id}
      AND tenant_id = ${tenantId}
      AND deleted_at IS NOT NULL
  `);
  return Number((result as any).rowCount ?? (result as any).count ?? 0);
}

/**
 * Helper to build a `deleted_at IS NULL` filter for use in drizzle
 * query builders. Pass the specific table's `deletedAt` column.
 *
 * Usage:
 *   import { notDeleted } from "@/lib/infra/soft-delete";
 *   db.select().from(contacts).where(and(eq(contacts.tenantId, tid), notDeleted(contacts.deletedAt)))
 */
export function notDeleted(deletedAtColumn: typeof contacts.deletedAt) {
  return isNull(deletedAtColumn);
}

export { SOFT_DELETE_TABLES };
