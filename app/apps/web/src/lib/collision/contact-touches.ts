import { db } from "@/db";
import { calls, activities, outboundEmails, connectedMailboxes } from "@/db/schema";
import { and, eq, inArray, gte, isNull, isNotNull } from "drizzle-orm";
import { authToAppUserId } from "@/lib/auth/user-id";
import { classifyChannel, type TouchRow } from "./recent-touch";

/**
 * Fetch the recency-windowed, user-attributed touches for one or many contacts,
 * normalised into `TouchRow[]` per contact for the pure collision helper.
 *
 * Three sources, all already attributed — no owner field involved:
 *   - calls          → calls.userId (app-space), channel "call"
 *   - activities     → actorId (app-space, actorType "user"), channel from type
 *   - outbound emails → mailbox_id → connected_mailboxes.user_id (AUTH-space),
 *                       bridged to app-space ONCE per distinct user via
 *                       lib/auth/user-id (never the inline clerk_id join).
 *
 * `sinceDate` bounds every scan (caller passes now − window) so a high-volume
 * contact stays cheap; the calls_contact / activities_entity / outbound_contact
 * indexes cover the predicates. Callers should cap `contactIds` (the routes do).
 */
export async function getContactTouchRows(
  tenantId: string,
  contactIds: string[],
  sinceDate: Date,
): Promise<Map<string, TouchRow[]>> {
  const byContact = new Map<string, TouchRow[]>();
  for (const id of contactIds) byContact.set(id, []);
  if (contactIds.length === 0) return byContact;

  const push = (contactId: string, row: TouchRow) => {
    byContact.get(contactId)?.push(row);
  };

  // 1. Calls — the rep who dialled.
  const callRows = await db
    .select({
      contactId: calls.contactId,
      userId: calls.userId,
      outcome: calls.outcome,
      startedAt: calls.startedAt,
    })
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        inArray(calls.contactId, contactIds),
        gte(calls.startedAt, sinceDate),
      ),
    );
  for (const c of callRows) {
    if (!c.startedAt) continue;
    push(c.contactId, {
      userId: c.userId,
      channel: "call",
      outcome: c.outcome ?? null,
      occurredAt: c.startedAt,
    });
  }

  // 2. User-attributed activities (manual notes, emails, system-written call
  //    activities — all carry actorId in app-space).
  const actRows = await db
    .select({
      entityId: activities.entityId,
      actorId: activities.actorId,
      activityType: activities.activityType,
      channel: activities.channel,
      occurredAt: activities.occurredAt,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "contact"),
        inArray(activities.entityId, contactIds),
        eq(activities.actorType, "user"),
        isNotNull(activities.actorId),
        isNull(activities.deletedAt),
        gte(activities.occurredAt, sinceDate),
      ),
    );
  for (const a of actRows) {
    if (!a.occurredAt) continue;
    push(a.entityId, {
      userId: a.actorId,
      channel: classifyChannel(a.activityType, a.channel),
      outcome: a.activityType ?? null,
      occurredAt: a.occurredAt,
    });
  }

  // 3. Outbound emails — bridge mailbox → sending user (AUTH → APP) in bulk.
  const obRows = await db
    .select({
      contactId: outboundEmails.contactId,
      mailboxId: outboundEmails.mailboxId,
      sentAt: outboundEmails.sentAt,
    })
    .from(outboundEmails)
    .where(
      and(
        eq(outboundEmails.tenantId, tenantId),
        inArray(outboundEmails.contactId, contactIds),
        gte(outboundEmails.sentAt, sinceDate),
      ),
    );
  if (obRows.length > 0) {
    const mailboxIds = [...new Set(obRows.map((o) => o.mailboxId).filter((x): x is string => !!x))];
    const mailboxToAuth = new Map<string, string>();
    if (mailboxIds.length > 0) {
      const mbRows = await db
        .select({ id: connectedMailboxes.id, userId: connectedMailboxes.userId })
        .from(connectedMailboxes)
        .where(
          and(
            eq(connectedMailboxes.tenantId, tenantId),
            inArray(connectedMailboxes.id, mailboxIds),
          ),
        );
      for (const m of mbRows) if (m.userId) mailboxToAuth.set(m.id, m.userId);
    }
    // Bridge each DISTINCT auth user ONCE — never per-row, never inline.
    const authToApp = new Map<string, string | null>();
    for (const authId of new Set(mailboxToAuth.values())) {
      authToApp.set(authId, await authToAppUserId(authId));
    }
    for (const o of obRows) {
      if (!o.sentAt || !o.contactId) continue;
      const authId = o.mailboxId ? mailboxToAuth.get(o.mailboxId) : undefined;
      const appId = authId ? authToApp.get(authId) ?? null : null;
      push(o.contactId, { userId: appId, channel: "email", outcome: null, occurredAt: o.sentAt });
    }
  }

  return byContact;
}
