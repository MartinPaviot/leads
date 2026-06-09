/**
 * Cascade soft-delete for an Account (company) and its related data.
 *
 * Deleting a company only removes the company row by default; this lets the
 * caller ALSO soft-delete selected related sets in one action (so the user
 * doesn't have to visit each page). Everything is soft-delete (deleted_at),
 * so it's recoverable from the Archive view. Polymorphic entities
 * (activities/notes/tasks) are matched by entityId against the company id +
 * its contact ids — entityId is a UUID so cross-table collisions are nil.
 */

import { db } from "@/db";
import { contacts, deals, activities, notes, tasks } from "@/db/schema";
import { and, eq, isNull, inArray } from "drizzle-orm";

export const CASCADE_TYPES = ["contacts", "deals", "activities", "notes", "tasks"] as const;
export type CascadeType = (typeof CASCADE_TYPES)[number];

export interface RelatedCounts {
  contacts: number;
  deals: number;
  activities: number;
  notes: number;
  tasks: number;
}

async function companyContactIds(tenantId: string, companyId: string): Promise<string[]> {
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.companyId, companyId), isNull(contacts.deletedAt)));
  return rows.map((r) => r.id);
}

/** Live (non-deleted) counts of each related set, for the delete modal. */
export async function getCompanyRelatedCounts(tenantId: string, companyId: string): Promise<RelatedCounts> {
  const cids = await companyContactIds(tenantId, companyId);
  const entityIds = [companyId, ...cids];
  const n = async (rows: { id: string }[]) => rows.length;
  const [c, d, a, nt, tk] = await Promise.all([
    db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.tenantId, tenantId), eq(contacts.companyId, companyId), isNull(contacts.deletedAt))).then(n),
    db.select({ id: deals.id }).from(deals).where(and(eq(deals.tenantId, tenantId), eq(deals.companyId, companyId), isNull(deals.deletedAt))).then(n),
    db.select({ id: activities.id }).from(activities).where(and(eq(activities.tenantId, tenantId), inArray(activities.entityId, entityIds), isNull(activities.deletedAt))).then(n),
    db.select({ id: notes.id }).from(notes).where(and(eq(notes.tenantId, tenantId), inArray(notes.entityId, entityIds), isNull(notes.deletedAt))).then(n),
    db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.tenantId, tenantId), inArray(tasks.entityId, entityIds), isNull(tasks.deletedAt))).then(n),
  ]);
  return { contacts: c, deals: d, activities: a, notes: nt, tasks: tk };
}

/**
 * Soft-delete the selected related sets for a company. Does NOT delete the
 * company itself (the caller does that). Returns the count deleted per type.
 * Computes contact ids BEFORE deleting contacts so the polymorphic sweep is
 * complete.
 */
export async function cascadeSoftDeleteCompany(
  tenantId: string,
  companyId: string,
  types: CascadeType[],
  at: Date = new Date(),
): Promise<Partial<Record<CascadeType, number>>> {
  if (types.length === 0) return {};
  const needsContactScope = types.some((t) => t === "activities" || t === "notes" || t === "tasks");
  const cids = needsContactScope ? await companyContactIds(tenantId, companyId) : [];
  const entityIds = [companyId, ...cids];
  const out: Partial<Record<CascadeType, number>> = {};

  if (types.includes("deals")) {
    const r = await db.update(deals).set({ deletedAt: at }).where(and(eq(deals.tenantId, tenantId), eq(deals.companyId, companyId), isNull(deals.deletedAt))).returning({ id: deals.id });
    out.deals = r.length;
  }
  if (types.includes("activities")) {
    const r = await db.update(activities).set({ deletedAt: at }).where(and(eq(activities.tenantId, tenantId), inArray(activities.entityId, entityIds), isNull(activities.deletedAt))).returning({ id: activities.id });
    out.activities = r.length;
  }
  if (types.includes("notes")) {
    const r = await db.update(notes).set({ deletedAt: at }).where(and(eq(notes.tenantId, tenantId), inArray(notes.entityId, entityIds), isNull(notes.deletedAt))).returning({ id: notes.id });
    out.notes = r.length;
  }
  if (types.includes("tasks")) {
    const r = await db.update(tasks).set({ deletedAt: at }).where(and(eq(tasks.tenantId, tenantId), inArray(tasks.entityId, entityIds), isNull(tasks.deletedAt))).returning({ id: tasks.id });
    out.tasks = r.length;
  }
  // Contacts last so their ids were available for the polymorphic sweep above.
  if (types.includes("contacts")) {
    const r = await db.update(contacts).set({ deletedAt: at }).where(and(eq(contacts.tenantId, tenantId), eq(contacts.companyId, companyId), isNull(contacts.deletedAt))).returning({ id: contacts.id });
    out.contacts = r.length;
  }
  return out;
}

/** Contact ids for a company REGARDLESS of deleted state — the polymorphic
 *  restore scope must include the contacts that were cascade-deleted too. */
async function allCompanyContactIds(tenantId: string, companyId: string): Promise<string[]> {
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.companyId, companyId)));
  return rows.map((r) => r.id);
}

/**
 * Symmetric inverse of cascadeSoftDeleteCompany: restore exactly the related
 * rows that were cascade-deleted together with the company. They are identified
 * by the shared delete timestamp `at` (= the company's deleted_at at the time
 * of deletion), so a contact/deal that was deleted standalone at a different
 * moment is left untouched. Returns the count restored per type.
 */
export async function cascadeSoftRestoreCompany(
  tenantId: string,
  companyId: string,
  at: Date,
): Promise<Partial<Record<CascadeType, number>>> {
  const cids = await allCompanyContactIds(tenantId, companyId);
  const entityIds = [companyId, ...cids];
  const out: Partial<Record<CascadeType, number>> = {};

  const d = await db.update(deals).set({ deletedAt: null }).where(and(eq(deals.tenantId, tenantId), eq(deals.companyId, companyId), eq(deals.deletedAt, at))).returning({ id: deals.id });
  if (d.length) out.deals = d.length;
  const a = await db.update(activities).set({ deletedAt: null }).where(and(eq(activities.tenantId, tenantId), inArray(activities.entityId, entityIds), eq(activities.deletedAt, at))).returning({ id: activities.id });
  if (a.length) out.activities = a.length;
  const nt = await db.update(notes).set({ deletedAt: null }).where(and(eq(notes.tenantId, tenantId), inArray(notes.entityId, entityIds), eq(notes.deletedAt, at))).returning({ id: notes.id });
  if (nt.length) out.notes = nt.length;
  const tk = await db.update(tasks).set({ deletedAt: null }).where(and(eq(tasks.tenantId, tenantId), inArray(tasks.entityId, entityIds), eq(tasks.deletedAt, at))).returning({ id: tasks.id });
  if (tk.length) out.tasks = tk.length;
  // Contacts last — their ids were gathered above for the polymorphic scope.
  const c = await db.update(contacts).set({ deletedAt: null }).where(and(eq(contacts.tenantId, tenantId), eq(contacts.companyId, companyId), eq(contacts.deletedAt, at))).returning({ id: contacts.id });
  if (c.length) out.contacts = c.length;

  return out;
}
