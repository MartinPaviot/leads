import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  activities,
  outboundEmails,
  connectedMailboxes,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkPlanLimit } from "@/lib/billing/plan-limits";
import { trackUsage } from "@/lib/billing/billing";
import { logger } from "@/lib/observability/logger";
import { isRecipientAllowed, recipientBlockReason } from "@/lib/emails/recipient-guardrail";
import { Resend } from "resend";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FALLBACK_FROM =
  process.env.INVITE_FROM_ADDRESS || "Elevay <outbound@resend.dev>";

/* ------------------------------------------------------------------ */
/*  Request validation                                                 */
/* ------------------------------------------------------------------ */

const sendEmailSchema = z.object({
  to: z.string().email("Invalid recipient email address"),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1, "Subject is required").max(500),
  body: z.string().min(1, "Body is required").max(50_000),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/*  POST /api/emails/send                                              */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse & validate ──────────────────────────────────────────
  let parsed: z.infer<typeof sendEmailSchema>;
  try {
    const raw = await req.json();
    parsed = sendEmailSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const firstIssue = err.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || "Validation failed" },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Test-mode guardrail ───────────────────────────────────────
  // Block real prospects while test mode is on, even for a deliberate
  // manual composer send. The user disables it (OUTBOUND_TEST_MODE=off)
  // when ready to send for real.
  if (!isRecipientAllowed(parsed.to)) {
    return NextResponse.json(
      { error: recipientBlockReason(parsed.to) },
      { status: 403 }
    );
  }

  // ── Plan limit check ─────────────────────────────────────────
  const planCheck = await checkPlanLimit(authCtx.tenantId, "emails");
  if (!planCheck.allowed) {
    return NextResponse.json(
      {
        error: `Monthly email limit reached (${planCheck.current}/${planCheck.limit}). Upgrade your plan to send more.`,
      },
      { status: 429 }
    );
  }

  // ── Resolve sender identity ───────────────────────────────────
  // Prefer the tenant's connected mailbox (real domain). Fall back
  // to the Resend transactional sender if no mailbox is connected.
  let fromAddress = FALLBACK_FROM;
  try {
    const [mailbox] = await db
      .select()
      .from(connectedMailboxes)
      .where(
        and(
          eq(connectedMailboxes.tenantId, authCtx.tenantId),
          eq(connectedMailboxes.status, "active")
        )
      )
      .limit(1);

    if (mailbox) {
      fromAddress = mailbox.displayName
        ? `${mailbox.displayName} <${mailbox.emailAddress}>`
        : mailbox.emailAddress;
    }
  } catch (err) {
    logger.warn("emails/send: mailbox lookup failed, using fallback", { err });
  }

  // ── Ensure Resend is configured ───────────────────────────────
  if (!resend) {
    return NextResponse.json(
      { error: "Email sending is not configured. Contact your administrator." },
      { status: 503 }
    );
  }

  // ── Send via Resend ───────────────────────────────────────────
  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [parsed.to],
      cc: parsed.cc && parsed.cc.length > 0 ? parsed.cc : undefined,
      subject: parsed.subject,
      text: parsed.body,
    });

    if (error) {
      logger.error("emails/send: Resend returned error", {
        err: error.message,
        to: parsed.to,
      });
      return NextResponse.json(
        { error: `Failed to send: ${error.message}` },
        { status: 502 }
      );
    }

    const messageId = data?.id || crypto.randomUUID();

    // ── Track usage ───────────────────────────────────────────
    await trackUsage(authCtx.tenantId, "email_sent").catch((err) => {
      logger.warn("emails/send: usage tracking failed", { err });
    });

    // ── Record outbound email ─────────────────────────────────
    try {
      await db.insert(outboundEmails).values({
        tenantId: authCtx.tenantId,
        contactId: parsed.contactId || null,
        campaignId: parsed.dealId || null,
        fromAddress,
        toAddress: parsed.to,
        subject: parsed.subject,
        bodyHtml: parsed.body,
        bodyText: parsed.body,
        messageId,
        status: "sent",
        sentAt: new Date(),
      });
    } catch (err) {
      // Non-critical: email was sent, but recording failed
      logger.warn("emails/send: outbound email record insert failed", { err });
    }

    // ── Create activity record ────────────────────────────────
    if (parsed.contactId) {
      try {
        await db.insert(activities).values({
          tenantId: authCtx.tenantId,
          actorType: "user",
          actorId: authCtx.appUserId,
          entityType: "contact",
          entityId: parsed.contactId,
          activityType: "email_sent",
          channel: "email",
          direction: "outbound",
          summary: `Email sent: ${parsed.subject}`,
          metadata: {
            messageId,
            to: parsed.to,
            cc: parsed.cc || [],
            subject: parsed.subject,
            bodyPreview: parsed.body.slice(0, 200),
            source: "composer",
            ...(parsed.dealId ? { dealId: parsed.dealId } : {}),
          },
        });
      } catch (err) {
        // Non-critical
        logger.warn("emails/send: activity record insert failed", { err });
      }
    }

    // ── If linked to a deal, also create a deal activity ──────
    if (parsed.dealId) {
      try {
        await db.insert(activities).values({
          tenantId: authCtx.tenantId,
          actorType: "user",
          actorId: authCtx.appUserId,
          entityType: "deal",
          entityId: parsed.dealId,
          activityType: "email_sent",
          channel: "email",
          direction: "outbound",
          summary: `Email sent to ${parsed.to}: ${parsed.subject}`,
          metadata: {
            messageId,
            to: parsed.to,
            subject: parsed.subject,
            source: "composer",
            contactId: parsed.contactId || null,
          },
        });
      } catch (err) {
        logger.warn("emails/send: deal activity insert failed", { err });
      }
    }

    return NextResponse.json({
      success: true,
      messageId,
    });
  } catch (err) {
    logger.error("emails/send: unexpected error", { err });
    return NextResponse.json(
      { error: "An unexpected error occurred while sending the email." },
      { status: 500 }
    );
  }
}
