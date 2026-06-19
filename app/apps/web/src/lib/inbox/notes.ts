/**
 * Private thread notes (INBOX-X06, internal-note subset). A note a founder jots
 * on a conversation for themselves — never quoted, never sent. Stored in the
 * existing `notes` table under a synthetic entity (entityType "inbox_thread",
 * entityId = conversationKey) so NO capture/outbound/AI path can surface it: it
 * is internal-only by construction, with zero migration.
 *
 * Scope note: the X06 spec's other half — handoff/reassign to a teammate with a
 * note — needs the team-inbox model the personal inbox lacks (a member can't see
 * another's mailbox), so only the private note ships here.
 */

/** entityType used to attach a note to an inbox conversation (never a real CRM entity). */
export const INBOX_NOTE_ENTITY_TYPE = "inbox_thread";

const MAX_NOTE_LEN = 50000;

/** Trim + cap note content; null when there's nothing to save. */
export function normalizeNoteContent(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_NOTE_LEN);
}

export interface ThreadNote {
  id: string;
  content: string;
  createdAt: string;
}
