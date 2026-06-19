/**
 * Per-user inbox scoping.
 *
 * A connected mailbox is PERSONAL — only its owner reads it, exactly like the
 * calendar (both are connected per-user on /settings/mail-calendar). The inbox
 * read-model, however, was assembled tenant-wide, so every member saw the whole
 * workspace's mail (in practice: the founder's mailbox). This module scopes the
 * inbox to the signed-in user's own mailbox(es).
 *
 * Attribution key (no extra column / migration needed — derived from data the
 * rows already carry):
 *   - outbound: the sending mailbox (`outbound_emails.mailbox_id`), or, as a
 *     fallback for rows without one, a `from_address` that equals the user's
 *     mailbox address.
 *   - inbound : the recipient of the captured `email_received` activity
 *     (`metadata.to`) equals one of the user's mailbox addresses.
 *
 * A user with NO connected mailbox has an empty scope → they see nothing until
 * they connect their own mailbox. `connected_mailboxes.user_id` holds the
 * auth-user id (same space as `authCtx.userId`).
 */

import { db } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface InboxScope {
  /** false → the user has no readable mailbox in this tenant (own or shared). */
  hasMailbox: boolean;
  /** Lowercased mailbox addresses the user can read in this tenant. */
  addresses: Set<string>;
  /** connected_mailboxes.id values the user can read in this tenant. */
  mailboxIds: Set<string>;
  /**
   * The readable mailboxes as {id,address,label,shared} — feeds the per-mailbox
   * navigation + attribution of the unified inbox (lib/inbox/mailbox-attribution).
   * `shared` flags a teammate's mailbox surfaced via team inbox (INBOX-X01).
   * Kept as an inline shape to avoid a circular import (mailbox-attribution
   * imports `headerAddresses` from here).
   */
  mailboxes: { id: string; address: string; label: string; shared?: boolean }[];
}

interface MailboxRow {
  id: string | null;
  emailAddress: string | null;
  displayName: string | null;
}

/**
 * Build the scope from the user's own + tenant-shared mailbox rows. Pure +
 * unit-tested. Own mailboxes win on a duplicate id, so a user's own box is never
 * mislabelled "shared". Default (no shared rows) is byte-identical to personal.
 */
export function buildScopeFromRows(own: MailboxRow[], shared: MailboxRow[]): InboxScope {
  const addresses = new Set<string>();
  const mailboxIds = new Set<string>();
  const mailboxes: { id: string; address: string; label: string; shared?: boolean }[] = [];
  const seen = new Set<string>();
  const add = (r: MailboxRow, isShared: boolean) => {
    if (!r.id || seen.has(r.id)) return;
    const a = r.emailAddress?.toLowerCase().trim();
    if (!a) return;
    seen.add(r.id);
    mailboxIds.add(r.id);
    addresses.add(a);
    mailboxes.push({ id: r.id, address: a, label: r.displayName?.trim() || a, ...(isShared ? { shared: true } : {}) });
  };
  for (const r of own) add(r, false);
  for (const r of shared) add(r, true);
  return { hasMailbox: mailboxes.length > 0, addresses, mailboxIds, mailboxes };
}

/**
 * Mailboxes another member shared with the tenant (INBOX-X01). DEFENSIVE: if the
 * `shared` column hasn't been migrated in yet the query throws and we return [] —
 * so the inbox runs identically (personal-only) with or without 0079 applied.
 */
async function loadSharedMailboxes(tenantId: string): Promise<MailboxRow[]> {
  try {
    return await db
      .select({
        id: connectedMailboxes.id,
        emailAddress: connectedMailboxes.emailAddress,
        displayName: connectedMailboxes.displayName,
      })
      .from(connectedMailboxes)
      .where(and(eq(connectedMailboxes.tenantId, tenantId), eq(connectedMailboxes.shared, true)));
  } catch {
    return [];
  }
}

/** Resolve the mailboxes the signed-in user can read: their own + any shared. */
export async function getInboxScope(
  tenantId: string,
  authUserId: string | null | undefined,
): Promise<InboxScope> {
  if (!authUserId) return { hasMailbox: false, addresses: new Set(), mailboxIds: new Set(), mailboxes: [] };
  const [own, shared] = await Promise.all([
    db
      .select({
        id: connectedMailboxes.id,
        emailAddress: connectedMailboxes.emailAddress,
        displayName: connectedMailboxes.displayName,
      })
      .from(connectedMailboxes)
      .where(and(eq(connectedMailboxes.tenantId, tenantId), eq(connectedMailboxes.userId, authUserId))),
    loadSharedMailboxes(tenantId),
  ]);
  return buildScopeFromRows(own, shared);
}

/**
 * Extract every email address from a raw header value, handling a display
 * name (`"Jane Doe <jane@x.com>"`) and multiple recipients
 * (`"a@x.com, B <b@y.com>"`). Lowercased.
 */
export function headerAddresses(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const m = part.match(/<([^>]+)>/);
      return (m ? m[1] : part).trim().toLowerCase();
    })
    .filter((a) => a.length > 0);
}

interface ScopableOutbound {
  mailboxId?: string | null;
  fromAddress?: string | null;
}
interface ScopableInbound {
  metadata?: Record<string, unknown> | null;
}

/** Does this outbound email belong to the user's mailbox? */
export function outboundBelongsToUser(row: ScopableOutbound, scope: InboxScope): boolean {
  if (row.mailboxId && scope.mailboxIds.has(row.mailboxId)) return true;
  // Fallback for rows without a mailbox_id: a from_address we own.
  return headerAddresses(row.fromAddress).some((a) => scope.addresses.has(a));
}

/** Was this inbound (email_received) activity addressed to the user's mailbox? */
export function inboundBelongsToUser(row: ScopableInbound, scope: InboxScope): boolean {
  const to = row.metadata?.to;
  return headerAddresses(typeof to === "string" ? to : "").some((a) => scope.addresses.has(a));
}

/**
 * Narrow the tenant-wide conversation rows (from `loadConversationRows`) to the
 * ones that belong to the user's own mailbox. Pure — the heart of the per-user
 * inbox, unit-tested without a DB. Triage is passed through untouched (its rows
 * only ever match the user's own conversation keys once the messages are
 * filtered). An empty scope yields no messages.
 */
export function scopeConversationRows<
  I extends ScopableInbound,
  O extends ScopableOutbound,
  T,
>(rows: { inbound: I[]; outbound: O[]; triage: T[] }, scope: InboxScope): {
  inbound: I[];
  outbound: O[];
  triage: T[];
} {
  if (!scope.hasMailbox) return { inbound: [], outbound: [], triage: rows.triage };
  return {
    inbound: rows.inbound.filter((r) => inboundBelongsToUser(r, scope)),
    outbound: rows.outbound.filter((r) => outboundBelongsToUser(r, scope)),
    triage: rows.triage,
  };
}
