/**
 * From-mailbox default picker (A2 R2). Pure, DB-free, unit-tested.
 *
 * Given a preferred mailbox id (the thread's own mailbox when replying) and the
 * user's SENDABLE boxes, choose which one the composer From should default to:
 *   - the preferred box when it is still sendable (R2.1),
 *   - else the primary (first; the list arrives created_at-ordered) (R2.2-R2.4),
 *   - else undefined (no sendable box — the server gate refuses, R4.5).
 */

export interface SendableMailbox {
  id: string;
  address: string;
  label: string;
}

export function pickDefaultFrom(
  preferredId: string | undefined,
  sendable: SendableMailbox[],
): string | undefined {
  if (preferredId && sendable.some((m) => m.id === preferredId)) return preferredId;
  if (sendable.length > 0) return sendable[0].id;
  return undefined;
}

/** Display string for an option: the label when it adds info, else the address. */
export function mailboxDisplay(m: SendableMailbox): string {
  return m.label && m.label !== m.address ? m.label : m.address;
}
