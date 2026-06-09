/**
 * Cascade soft-delete for a Deal (opportunity) and its related data.
 *
 * Deleting a deal only soft-deletes the deal row by default; this lets the
 * caller ALSO soft-delete its polymorphic activities / notes / tasks in one
 * action. The deal's company + contact are NOT touched (they exist
 * independently of the deal). Everything is soft-delete (deleted_at),
 * recoverable from Archive. Polymorphic rows are matched by entityId == dealId
 * (a UUID, so there's no cross-entity collision).
 */

import { db } from "@/db";
import { activities, notes, tasks } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const DEAL_CASCADE_TYPES = ["activities", "notes", "tasks"] as const;
export type DealCascadeType = (typeof DEAL_CASCADE_TYPES)[number];

export interface DealRelatedCounts {
  activities: number;
  notes: number;
  tasks: number;
}

/** Live (non-deleted) counts of each related set, for the delete modal. */
export async function getDealRelatedCounts(tenantId: string, dealId: string): Promise<DealRelatedCounts> {
  const n = async (rows: { id: string }[]) => rows.length;
  const [a, nt, tk] = await Promise.all([
    db.select({ id: activities.id }).from(activities).where(and(eq(activities.tenantId, tenantId), eq(activities.entityId, dealId), isNull(activities.deletedAt))).then(n),
    db.select({ id: notes.id }).from(notes).where(and(eq(notes.tenantId, tenantId), eq(notes.entityId, dealId), isNull(notes.deletedAt))).then(n),
    db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.tenantId, tenantId), eq(tasks.entityId, dealId), isNull(tasks.deletedAt))).then(n),
  ]);
  return { activities: a, notes: nt, tasks: tk };
}

/**
 * Soft-delete the selected related sets for a deal. Does NOT delete the deal
 * itself (the caller does that). Returns the count deleted per type.
 */
export async function cascadeSoftDeleteDeal(
  tenantId: string,
  dealId: string,
  types: DealCascadeType[],
  at: Date = new Date(),
): Promise<Partial<Record<DealCascadeType, number>>> {
  if (types.length === 0) return {};
  const out: Partial<Record<DealCascadeType, number>> = {};

  if (types.includes("activities")) {
    const r = await db.update(activities).set({ deletedAt: at }).where(and(eq(activities.tenantId, tenantId), eq(activities.entityId, dealId), isNull(activities.deletedAt))).returning({ id: activities.id });
    out.activities = r.length;
  }
  if (types.includes("notes")) {
    const r = await db.update(notes).set({ deletedAt: at }).where(and(eq(notes.tenantId, tenantId), eq(notes.entityId, dealId), isNull(notes.deletedAt))).returning({ id: notes.id });
    out.notes = r.length;
  }
  if (types.includes("tasks")) {
    const r = await db.update(tasks).set({ deletedAt: at }).where(and(eq(tasks.tenantId, tenantId), eq(tasks.entityId, dealId), isNull(tasks.deletedAt))).returning({ id: tasks.id });
    out.tasks = r.length;
  }
  return out;
}

/**
 * Symmetric inverse of cascadeSoftDeleteDeal: restore exactly the polymorphic
 * rows cascade-deleted together with the deal, identified by the shared delete
 * timestamp `at` (= the deal's deleted_at at delete time). Rows deleted
 * standalone at another moment are left untouched. Returns count restored.
 */
export async function cascadeSoftRestoreDeal(
  tenantId: string,
  dealId: string,
  at: Date,
): Promise<Partial<Record<DealCascadeType, number>>> {
  const out: Partial<Record<DealCascadeType, number>> = {};
  const a = await db.update(activities).set({ deletedAt: null }).where(and(eq(activities.tenantId, tenantId), eq(activities.entityId, dealId), eq(activities.deletedAt, at))).returning({ id: activities.id });
  if (a.length) out.activities = a.length;
  const nt = await db.update(notes).set({ deletedAt: null }).where(and(eq(notes.tenantId, tenantId), eq(notes.entityId, dealId), eq(notes.deletedAt, at))).returning({ id: notes.id });
  if (nt.length) out.notes = nt.length;
  const tk = await db.update(tasks).set({ deletedAt: null }).where(and(eq(tasks.tenantId, tenantId), eq(tasks.entityId, dealId), eq(tasks.deletedAt, at))).returning({ id: tasks.id });
  if (tk.length) out.tasks = tk.length;
  return out;
}
