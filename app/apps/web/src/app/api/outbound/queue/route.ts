/**
 * GET /api/outbound/queue
 *
 * P1-15 — the "Outbound du jour" cockpit feed. Merges the three things a founder
 * works through each day into one priority-ordered queue (buildOutboundQueue):
 *   1. replies      — a prospect answered (outbound_emails.replied_at, last 14d)
 *   2. reminders    — sequence touches due/upcoming (active enrollments, ±window)
 *   3. drafts       — pending approval, ranked by qualityScore (sequence_drafts)
 *
 * All reads tenant-scoped. The ordering + display assembly is pure
 * (assembleOutboundQueue) and unit-tested; this route is the IO shell.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import {
  sequenceDrafts,
  outboundEmails,
  sequenceEnrollments,
  sequences,
  contacts,
} from "@/db/schema";
import { and, asc, desc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import {
  assembleOutboundQueue,
  type QueueReplyRow,
  type QueueReminderRow,
  type QueueDraftRow,
} from "@/lib/outbound/queue";

const REPLY_WINDOW_DAYS = 14;
const REMINDER_WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;

function nameOf(
  firstName: string | null,
  lastName: string | null,
  email: string | null,
): string | null {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || email || null;
}

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = authCtx;
  const now = new Date();
  const replySince = new Date(now.getTime() - REPLY_WINDOW_DAYS * MS_PER_DAY);
  const reminderUntil = new Date(now.getTime() + REMINDER_WINDOW_DAYS * MS_PER_DAY);

  const [replyRows, reminderRows, draftRows] = await Promise.all([
    db
      .select({
        id: outboundEmails.id,
        subject: outboundEmails.subject,
        repliedAt: outboundEmails.repliedAt,
        classification: outboundEmails.replyClassification,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
      })
      .from(outboundEmails)
      .leftJoin(contacts, eq(contacts.id, outboundEmails.contactId))
      .where(
        and(
          eq(outboundEmails.tenantId, tenantId),
          isNotNull(outboundEmails.repliedAt),
          gte(outboundEmails.repliedAt, replySince),
        ),
      )
      .orderBy(desc(outboundEmails.repliedAt))
      .limit(50),

    db
      .select({
        id: sequenceEnrollments.id,
        dueAt: sequenceEnrollments.nextStepAt,
        sequenceName: sequences.name,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
      })
      .from(sequenceEnrollments)
      .innerJoin(contacts, eq(contacts.id, sequenceEnrollments.contactId))
      .leftJoin(sequences, eq(sequences.id, sequenceEnrollments.sequenceId))
      .where(
        and(
          eq(contacts.tenantId, tenantId),
          isNull(contacts.deletedAt),
          eq(sequenceEnrollments.status, "active"),
          isNotNull(sequenceEnrollments.nextStepAt),
          lte(sequenceEnrollments.nextStepAt, reminderUntil),
        ),
      )
      .orderBy(asc(sequenceEnrollments.nextStepAt))
      .limit(50),

    db
      .select({
        id: sequenceDrafts.id,
        subject: sequenceDrafts.subject,
        qualityScore: sequenceDrafts.qualityScore,
        generatedAt: sequenceDrafts.generatedAt,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
      })
      .from(sequenceDrafts)
      .leftJoin(contacts, eq(contacts.id, sequenceDrafts.contactId))
      .where(
        and(
          eq(sequenceDrafts.tenantId, tenantId),
          eq(sequenceDrafts.status, "pending_approval"),
        ),
      )
      .orderBy(desc(sequenceDrafts.generatedAt))
      .limit(100),
  ]);

  const replies: QueueReplyRow[] = replyRows.map((r) => ({
    id: r.id,
    contactName: nameOf(r.firstName, r.lastName, r.email),
    subject: r.subject,
    repliedAt: r.repliedAt?.toISOString() ?? null,
    classification: r.classification,
  }));

  const reminders: QueueReminderRow[] = reminderRows.map((r) => ({
    id: r.id,
    contactName: nameOf(r.firstName, r.lastName, r.email),
    sequenceName: r.sequenceName ?? null,
    dueAt: r.dueAt?.toISOString() ?? null,
  }));

  const drafts: QueueDraftRow[] = draftRows.map((d) => ({
    id: d.id,
    subject: d.subject,
    qualityScore: d.qualityScore ?? null,
    generatedAt: d.generatedAt?.toISOString() ?? null,
    contactName: nameOf(d.firstName, d.lastName, d.email),
  }));

  const items = assembleOutboundQueue({ replies, reminders, drafts }, now);

  return Response.json({
    items,
    counts: {
      replies: replies.length,
      reminders: reminders.length,
      drafts: drafts.length,
      total: items.length,
    },
    generatedAt: now.toISOString(),
  });
}
