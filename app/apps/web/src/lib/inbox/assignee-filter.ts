/**
 * Assignee-lane predicates (B8, INBOX-X01). Pure partition of a conversation by
 * who owns it — me / unassigned / someone else — for the "assigned to me" style
 * lanes. INERT in a solo workspace (memberCount < 2): every lane matches, so the
 * lanes add nothing until a teammate joins.
 */

export type AssigneeLane = "me" | "unassigned" | "others";

export function isAssignedToMe(assigneeId: string | null, me: string): boolean {
  return assigneeId != null && assigneeId === me;
}

export function isUnassigned(assigneeId: string | null): boolean {
  return assigneeId == null;
}

export function isAssignedToOther(assigneeId: string | null, me: string): boolean {
  return assigneeId != null && assigneeId !== me;
}

/**
 * Whether a conversation with `assigneeId` belongs in `lane` for viewer `me`. When
 * the workspace has fewer than 2 members the lanes are meaningless, so this returns
 * true for every lane (the UI hides them anyway) — keeping a solo inbox unchanged.
 */
export function matchesAssigneeLane(
  lane: AssigneeLane,
  assigneeId: string | null,
  me: string,
  memberCount: number,
): boolean {
  if (memberCount < 2) return true;
  switch (lane) {
    case "me":
      return isAssignedToMe(assigneeId, me);
    case "unassigned":
      return isUnassigned(assigneeId);
    case "others":
      return isAssignedToOther(assigneeId, me);
  }
}
