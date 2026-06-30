/**
 * DB loaders for the inbox conversation read-model. Kept out of the route
 * files so list + detail share one query shape (and route files only export
 * handlers, as Next requires).
 */

import { db } from "@/db";
import { activities, outboundEmails, contacts, inboxTriage, deals } from "@/db/schema";
import { and, eq, desc, isNull, isNotNull, inArray } from "drizzle-orm";
import { withTenantTx } from "@/db/rls";
import { contactImportance, type ContactImportance } from "@/lib/inbox/deal-importance";

// Assembly is in-memory over the most recent slice of the mailbox. 500
// each side covers months of founder-led volume; older threads simply
// age out of triage (they remain on the contact timeline).
const ROW_CAP = 500;

/**
 * LINKEDIN-INBOUND: which inbound activity types feed the inbox. LinkedIn
 * messages (captured by lib/capture/linkedin-capture.ts) only enter the inbox
 * read-model when LINKEDIN_INBOUND_ENABLED is on — a flag-gated dark launch. Off
 * (default) → email-only, byte-identical to before.
 */
const INBOUND_ACTIVITY_TYPES: ("email_received" | "linkedin_message_received")[] =
  process.env.LINKEDIN_INBOUND_ENABLED === "1" || process.env.LINKEDIN_INBOUND_ENABLED === "true"
    ? ["email_received", "linkedin_message_received"]
    : ["email_received"];

/**
 * INBOX-P05 / R-08b foundation: when INBOX_RLS_TX=1, run the inbox reads inside
 * withTenantTx so `app.tenant_id` is bound and the DB-level RLS policies (0074)
 * enforce isolation. Behavior-neutral under 0074's fallback (no context → still
 * allow), and OFF by default so the core read path is byte-identical until Martin
 * enables + verifies it in staging — the prerequisite for the strict flip
 * (drop the fallback; see OCEANS-DISPOSITION.md). Uses the blessed transaction-
 * scoped set_config(...,true) primitive, NOT the session form that caused the
 * 2026-06-10 outage.
 */
const RLS_TX = process.env.INBOX_RLS_TX === "1";

type Executor = typeof db;

async function fetchConversationRows(exec: Executor, tenantId: string) {
  return Promise.all([
    exec
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
          inArray(activities.activityType, INBOUND_ACTIVITY_TYPES),
          isNull(activities.deletedAt),
        ),
      )
      .orderBy(desc(activities.occurredAt))
      .limit(ROW_CAP),
    exec
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
    exec
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
}

export async function loadConversationRows(tenantId: string) {
  const [inboundRows, outboundRows, triageRows] = RLS_TX
    ? await withTenantTx(tenantId, (tx) => fetchConversationRows(tx as unknown as Executor, tenantId))
    : await fetchConversationRows(db, tenantId);

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

/**
 * P1 — deal-ranked inbox. One batched join (deals + contact titles) over every
 * contact in the loaded slice → the per-contact importance enrichment the scorer
 * folds in (open deal / advanced stage / senior sender). Keyed by contactId, like
 * contactNameMap. FAIL-SOFT: any query hiccup returns an empty map so the inbox
 * list still renders, scored exactly as it was pre-P1.
 */
export async function importanceByContactId(
  tenantId: string,
  contactIds: string[],
): Promise<Map<string, ContactImportance>> {
  const out = new Map<string, ContactImportance>();
  const ids = [...new Set(contactIds.filter(Boolean))];
  if (ids.length === 0) return out;
  try {
    const [dealRows, contactRows] = await Promise.all([
      db
        .select({ contactId: deals.contactId, stage: deals.stage })
        .from(deals)
        .where(and(eq(deals.tenantId, tenantId), inArray(deals.contactId, ids))),
      db
        .select({ id: contacts.id, title: contacts.title })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, ids))),
    ]);
    const dealsByContact = new Map<string, Array<{ stage: string | null }>>();
    for (const d of dealRows) {
      if (!d.contactId) continue;
      const arr = dealsByContact.get(d.contactId);
      if (arr) arr.push({ stage: d.stage });
      else dealsByContact.set(d.contactId, [{ stage: d.stage }]);
    }
    const titleById = new Map(contactRows.map((c) => [c.id, c.title]));
    for (const id of ids) {
      out.set(
        id,
        contactImportance({ deals: dealsByContact.get(id) ?? [], title: titleById.get(id) ?? null }),
      );
    }
  } catch {
    return new Map();
  }
  return out;
}
