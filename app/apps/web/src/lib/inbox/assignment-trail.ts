/**
 * Assignment trail (B8, INBOX-X01 audit). assignment-store.ts OVERWRITES the
 * assignee (soft-deletes the prior row), so there's no history of who reassigned a
 * thread to whom. This module is the PURE half of an append-only trail: the event
 * shape + a one-line human formatter. The store appends events; this renders them.
 */

/** entityType for an append-only assignment event (stored alongside the assignee). */
export const INBOX_ASSIGNMENT_EVENT_ENTITY_TYPE = "inbox_assignment_event";

export interface AssignmentEvent {
  /** Who made the change. */
  actorId: string;
  /** Prior assignee id, or null when it was unassigned before. */
  fromAssigneeId: string | null;
  /** New assignee id, or null when this unassigns. */
  toAssigneeId: string | null;
  /** ISO timestamp of the change. */
  at: string;
}

/** Resolve a user id to a display name, with a non-empty fallback. */
function nameOf(id: string | null, names: Record<string, string>): string {
  if (!id) return "no one";
  return names[id]?.trim() || "a teammate";
}

/** Injectable relative time (mirrors the inbox row's timeAgo thresholds). */
function relativeTime(atMs: number, nowMs: number): string {
  const mins = Math.floor(Math.max(0, nowMs - atMs) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * One-line audit string for an assignment event, e.g.
 * "Ada assigned this to Bob · 2h ago" / "Ada reassigned this from Bob to Cleo · …"
 * / "Ada unassigned this · …". `now` is the epoch-ms clock (injectable, pure).
 */
export function formatAssignmentEvent(
  ev: AssignmentEvent,
  names: Record<string, string>,
  now: number,
): string {
  const actor = nameOf(ev.actorId, names);
  const when = relativeTime(new Date(ev.at).getTime(), now);
  let action: string;
  if (ev.toAssigneeId === null) {
    action = "unassigned this";
  } else if (ev.fromAssigneeId === null) {
    action = `assigned this to ${nameOf(ev.toAssigneeId, names)}`;
  } else {
    action = `reassigned this from ${nameOf(ev.fromAssigneeId, names)} to ${nameOf(ev.toAssigneeId, names)}`;
  }
  return `${actor} ${action} · ${when}`;
}
