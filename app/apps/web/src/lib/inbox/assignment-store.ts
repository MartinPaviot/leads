/**
 * Persistence for per-thread assignment (INBOX-X01) over the existing `notes`
 * table. Tenant-scoped (every member reads the same assignment), so — unlike the
 * private X06 notes — it is NOT filtered by author. No migration.
 */

import { db } from "@/db";
import { notes } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { INBOX_ASSIGNMENT_ENTITY_TYPE } from "./assignment";

/** The current assignee's users.id for a thread, or null when unassigned. */
export async function getAssigneeId(tenantId: string, conversationKey: string): Promise<string | null> {
  const [row] = await db
    .select({ content: notes.content })
    .from(notes)
    .where(
      and(
        eq(notes.tenantId, tenantId),
        eq(notes.entityType, INBOX_ASSIGNMENT_ENTITY_TYPE),
        eq(notes.entityId, conversationKey),
        isNull(notes.deletedAt),
      ),
    )
    .orderBy(desc(notes.createdAt))
    .limit(1);
  return row?.content || null;
}

/** Assign a thread to a member (replaces any prior assignment). */
export async function setAssignee(
  tenantId: string,
  conversationKey: string,
  assigneeId: string,
  assignedBy: string,
): Promise<void> {
  await clearAssignee(tenantId, conversationKey);
  await db.insert(notes).values({
    tenantId,
    authorId: assignedBy,
    entityType: INBOX_ASSIGNMENT_ENTITY_TYPE,
    entityId: conversationKey,
    content: assigneeId,
  });
}

/** Soft-delete the active assignment(s) for a thread. */
export async function clearAssignee(tenantId: string, conversationKey: string): Promise<void> {
  await db
    .update(notes)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(notes.tenantId, tenantId),
        eq(notes.entityType, INBOX_ASSIGNMENT_ENTITY_TYPE),
        eq(notes.entityId, conversationKey),
        isNull(notes.deletedAt),
      ),
    );
}
