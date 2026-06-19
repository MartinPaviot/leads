/**
 * Per-thread assignment (INBOX-X01) — assign a conversation to a teammate so a
 * shared/team inbox (INBOX-X01 shared mailboxes) has a clear owner. Stored
 * tenant-wide in the existing `notes` table (entityType "inbox_assignment",
 * entityId = conversationKey, content = assignee users.id), so every member sees
 * the same assignment. No migration, no activity-enum change.
 */

export const INBOX_ASSIGNMENT_ENTITY_TYPE = "inbox_assignment";

export interface Member {
  id: string;
  name: string;
}

/** Resolve an assignee id to a display name against the tenant member list. */
export function resolveAssignee(
  assigneeId: string | null,
  members: Member[],
): Member | null {
  if (!assigneeId) return null;
  const found = members.find((m) => m.id === assigneeId);
  return found ?? { id: assigneeId, name: "Unknown member" };
}
