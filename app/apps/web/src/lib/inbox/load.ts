/**
 * DB loaders for the inbox conversation read-model. Kept out of the route
 * files so list + detail share one query shape (and route files only export
 * handlers, as Next requires).
 */

import { db } from "@/db";
import { activities, outboundEmails, contacts, inboxTriage } from "@/db/schema";
import { and, eq, desc, isNull, isNotNull, inArray } from "drizzle-orm";

// Assembly is in-memory over the most recent slice of the mailbox. 500
// each side covers months of founder-led volume; older threads simply
// age out of triage (they remain on the contact timeline).
const ROW_CAP = 500;

export async function loadConversationRows(tenantId: string) {
  const [inboundRows, outboundRows, triageRows] = await Promise.all([
    db
      .select({
        id: activities.id,
        threadId: activities.threadId,
        entityType: activities.entityType,
        entityId: activities.entityId,
        occurredAt: activities.occurredAt,
        summary: activities.summary,
        rawContent: activities.rawContent,
        metadata: activities.metadata,
        sentiment: activities.sentiment,
        intent: activities.intent,
      })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, tenantId),
          eq(activities.activityType, "email_received"),
          isNull(activities.deletedAt),
        ),
      )
      .orderBy(desc(activities.occurredAt))
      .limit(ROW_CAP),
    db
      .select({
        id: outboundEmails.id,
        threadId: outboundEmails.threadId,
        contactId: outboundEmails.contactId,
        mailboxId: outboundEmails.mailboxId,
        subject: outboundEmails.subject,
        bodyText: outboundEmails.bodyText,
        sentAt: outboundEmails.sentAt,
        status: outboundEmails.status,
        repliedAt: outboundEmails.repliedAt,
        replyClassification: outboundEmails.replyClassification,
        bounceType: outboundEmails.bounceType,
        stepNumber: outboundEmails.stepNumber,
        toAddress: outboundEmails.toAddress,
        fromAddress: outboundEmails.fromAddress,
        enrollmentId: outboundEmails.enrollmentId,
      })
      .from(outboundEmails)
      .where(and(eq(outboundEmails.tenantId, tenantId), isNotNull(outboundEmails.sentAt)))
      .orderBy(desc(outboundEmails.sentAt))
      .limit(ROW_CAP),
    db
      .select({
        conversationKey: inboxTriage.conversationKey,
        status: inboxTriage.status,
        doneAt: inboxTriage.doneAt,
        snoozedUntil: inboxTriage.snoozedUntil,
        updatedAt: inboxTriage.updatedAt,
      })
      .from(inboxTriage)
      .where(eq(inboxTriage.tenantId, tenantId)),
  ]);

  const inbound = inboundRows.map((r) => ({
    id: r.id,
    threadId: r.threadId,
    contactId: r.entityType === "contact" ? r.entityId : null,
    occurredAt: r.occurredAt,
    summary: r.summary,
    rawContent: r.rawContent,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    sentiment: r.sentiment,
    intent: r.intent,
  }));

  return { inbound, outbound: outboundRows, triage: triageRows };
}

export async function contactNameMap(tenantId: string, contactIds: string[]) {
  const map: Record<string, { name: string; email: string | null }> = {};
  const ids = [...new Set(contactIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
    })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, ids), isNull(contacts.deletedAt)));
  for (const c of rows) {
    map[c.id] = {
      name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Unknown",
      email: c.email,
    };
  }
  return map;
}
