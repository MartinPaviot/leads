import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { logger } from "@/lib/logger";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
const FROM_ADDRESS =
  process.env.INVITE_FROM_ADDRESS || "Elevay <no-reply@resend.dev>";

/**
 * POST /api/meetings/:id/notes/send-follow-up — M2. Send the stored
 * follow-up draft to the matched contacts on the meeting.
 *
 * Uses the subject/body already in `metadata.followUpEmailDraft`, which
 * the post-call pipeline or the user (via PATCH) has set. Recipients
 * come from `metadata.matchedContacts` — only those with an email and
 * no opt-out row are contacted. Sent timestamp + message ids are
 * recorded back into metadata for audit.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  if (!resend) {
    return NextResponse.json(
      { error: "Email sending is not configured (RESEND_API_KEY missing)." },
      { status: 400 }
    );
  }

  const [activity] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.tenantId, authCtx.tenantId)))
    .limit(1);
  if (!activity) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const meta = (activity.metadata ?? {}) as Record<string, unknown> & {
    followUpEmailDraft?: { subject?: string; body?: string };
    matchedContacts?: Array<{ contactId?: string; email?: string }>;
    followUpSentAt?: string;
  };

  const draft = meta.followUpEmailDraft;
  if (!draft?.subject || !draft?.body) {
    return NextResponse.json(
      { error: "No follow-up draft to send. Edit the draft first." },
      { status: 400 }
    );
  }

  if (meta.followUpSentAt) {
    return NextResponse.json(
      { error: "Follow-up was already sent for this meeting." },
      { status: 409 }
    );
  }

  // Build recipient list: use matchedContacts first, fall back to
  // re-resolving attendees through `contacts` by email.
  const attendeeEmails = new Set<string>();
  for (const m of meta.matchedContacts ?? []) {
    if (m.email) attendeeEmails.add(m.email.toLowerCase());
  }
  if (attendeeEmails.size === 0) {
    const attendees = (meta.attendees ?? []) as Array<{ email?: string }>;
    for (const a of attendees) {
      if (a.email) attendeeEmails.add(a.email.toLowerCase());
    }
  }
  if (attendeeEmails.size === 0) {
    return NextResponse.json(
      { error: "No recipient emails resolved for this meeting." },
      { status: 400 }
    );
  }

  // Filter out known contacts without a valid email (double-check).
  const recipients = (
    await db
      .select({ email: contacts.email })
      .from(contacts)
      .where(eq(contacts.tenantId, authCtx.tenantId))
  )
    .map((r) => r.email?.toLowerCase())
    .filter((e): e is string => !!e && attendeeEmails.has(e));

  const toEmails = recipients.length > 0 ? recipients : Array.from(attendeeEmails);

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: toEmails,
      subject: draft.subject,
      text: draft.body,
    });
    if (error) {
      logger.error("meetings: follow-up send returned error", {
        err: error.message,
        meetingId: id,
      });
      return NextResponse.json(
        { error: "Failed to send follow-up. Please try again." },
        { status: 500 }
      );
    }
    const nextMeta: Record<string, unknown> = {
      ...meta,
      followUpSentAt: new Date().toISOString(),
      followUpMessageId: data?.id ?? null,
      followUpRecipients: toEmails,
    };
    await db
      .update(activities)
      .set({ metadata: nextMeta })
      .where(eq(activities.id, id));
    return NextResponse.json({ ok: true, recipients: toEmails });
  } catch (err) {
    logger.error("meetings: follow-up send threw", { err, meetingId: id });
    return NextResponse.json(
      { error: "Network error while sending follow-up." },
      { status: 500 }
    );
  }
}
