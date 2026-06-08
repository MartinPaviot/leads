/**
 * Cascade soft-delete for a Contact and its related data.
 *
 * Deleting a contact only soft-deletes the contact row by default; this lets
 * the caller ALSO soft-delete its polymorphic activities / notes / tasks in one
 * action (so the user doesn't have to visit each page). Deals are intentionally
 * NOT a cascade option — a deal belongs to the company, not to a single
 * contact. Everything is soft-delete (deleted_at), recoverable from Archive.
 * Polymorphic rows are matched by entityId == contactId (a UUID, so there's no
 * cross-entity collision).
 */

import { db } from "@/db";
import { activities, notes, tasks } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const CONTACT_CASCADE_TYPES = ["activities", "notes", "tasks"] as const;
export type ContactCascadeType = (typeof CONTACT_CASCADE_TYPES)[number];

export interface ContactRelatedCounts {
  activities: number;
  notes: number;
  tasks: number;
}

/** Live (non-deleted) counts of each related set, for the delete modal. */
export async function getContactRelatedCounts(tenantId: string, contactId: string): Promise<ContactRelatedCounts> {
  const n = async (rows: { id: string }[]) => rows.length;
  const [a, nt, tk] = await Promise.all([
    db.select({ id: activities.id }).from(activities).where(and(eq(activities.tenantId, tenantId), eq(activities.entityId, contactId), isNull(activities.deletedAt))).then(n),
    db.select({ id: notes.id }).from(notes).where(and(eq(notes.tenantId, tenantId), eq(notes.entityId, contactId), isNull(notes.deletedAt))).then(n),
    db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.tenantId, tenantId), eq(tasks.entityId, contactId), isNull(tasks.deletedAt))).then(n),
  ]);
  return { activities: a, notes: nt, tasks: tk };
}

/**
 * Soft-delete the selected related sets for a contact. Does NOT delete the
 * contact itself (the caller does that). Returns the count deleted per type.
 */
export async function cascadeSoftDeleteContact(
  tenantId: string,
  contactId: string,
  types: ContactCascadeType[],
): Promise<Partial<Record<ContactCascadeType, number>>> {
  if (types.length === 0) return {};
  const now = new Date();
  const out: Partial<Record<ContactCascadeType, number>> = {};

  if (types.includes("activities")) {
    const r = await db.update(activities).set({ deletedAt: now }).where(and(eq(activities.tenantId, tenantId), eq(activities.entityId, contactId), isNull(activities.deletedAt))).returning({ id: activities.id });
    out.activities = r.length;
  }
  if (types.includes("notes")) {
    const r = await db.update(notes).set({ deletedAt: now }).where(and(eq(notes.tenantId, tenantId), eq(notes.entityId, contactId), isNull(notes.deletedAt))).returning({ id: notes.id });
    out.notes = r.length;
  }
  if (types.includes("tasks")) {
    const r = await db.update(tasks).set({ deletedAt: now }).where(and(eq(tasks.tenantId, tenantId), eq(tasks.entityId, contactId), isNull(tasks.deletedAt))).returning({ id: tasks.id });
    out.tasks = r.length;
  }
  return out;
}
