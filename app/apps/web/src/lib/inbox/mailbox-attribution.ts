/**
 * Mailbox attribution for the unified multi-mailbox inbox (L1).
 *
 * A user can own many connected mailboxes (e.g. 15 outreach boxes). The inbox
 * read-model already MERGES them into one feed (lib/inbox/user-scope.ts), but a
 * conversation never said WHICH of the user's boxes it belongs to. This pure,
 * DB-free module derives that, so the cockpit can show a "received on X" chip
 * and drive a per-mailbox filter.
 *
 * Rule — scan the conversation's messages newest-first; the first message that
 * touches one of the user's OWN mailboxes wins:
 *   - inbound  → the recipient (`to`) equal to one of the user's addresses is
 *                the box that RECEIVED it,
 *   - outbound → the sender (`from`) equal to one of the user's addresses is
 *                the box that SENT it.
 * Deterministic and unit-tested. A conversation that touches none of the user's
 * boxes (shouldn't happen for in-scope rows) attributes to null.
 */

import { headerAddresses } from "./user-scope";

export interface MailboxRef {
  id: string;
  /** Lowercased mailbox address. */
  address: string;
  /** Human label — displayName || address. */
  label: string;
}

export interface MailboxAttribution {
  mailboxId: string | null;
  mailboxAddress: string | null;
  mailboxLabel: string | null;
}

/** The minimal message shape attribution needs (a subset of ConversationMessage). */
export interface AttributableMessage {
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  /** ISO timestamp, or null. */
  at: string | null;
}

const UNATTRIBUTED: MailboxAttribution = {
  mailboxId: null,
  mailboxAddress: null,
  mailboxLabel: null,
};

/** Index mailbox refs by lowercased address for O(1) matching during attribution. */
export function indexMailboxes(mailboxes: MailboxRef[]): Map<string, MailboxRef> {
  const byAddress = new Map<string, MailboxRef>();
  for (const mb of mailboxes) {
    const a = mb.address?.toLowerCase().trim();
    if (a) byAddress.set(a, mb);
  }
  return byAddress;
}

function toMs(at: string | null): number {
  if (!at) return 0;
  const ms = new Date(at).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Attribute one conversation to its owning mailbox, scanning messages newest
 * first. `byAddress` is the pre-indexed map (see `indexMailboxes`) so
 * attributing a whole list stays O(messages), not O(messages × mailboxes).
 */
export function attributeMailbox(
  messages: AttributableMessage[],
  byAddress: Map<string, MailboxRef>,
): MailboxAttribution {
  if (byAddress.size === 0 || messages.length === 0) return UNATTRIBUTED;
  const newestFirst = [...messages].sort((a, b) => toMs(b.at) - toMs(a.at));
  for (const m of newestFirst) {
    // The address that identifies OUR box: the recipient on inbound, the
    // sender on outbound.
    const header = m.direction === "inbound" ? m.to : m.from;
    for (const addr of headerAddresses(header)) {
      const mb = byAddress.get(addr);
      if (mb) {
        return { mailboxId: mb.id, mailboxAddress: mb.address, mailboxLabel: mb.label };
      }
    }
  }
  return UNATTRIBUTED;
}
