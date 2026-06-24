import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { requireCapabilityForRequest } from "@/lib/auth/permissions";
import { deliverInteractiveEmail } from "@/lib/emails/deliver-interactive";
import { logger } from "@/lib/observability/logger";
import { recipientBlockReason } from "@/lib/emails/recipient-guardrail";
import { isInteractiveRecipientSendable } from "@/lib/guardrails/sending-gate";

/* ------------------------------------------------------------------ */
/*  POST /api/emails/send  — the composer's send button               */
/*                                                                    */
/*  Sends as the CURRENT user (their connected mailbox: real SMTP for */
/*  smtp_custom, else Resend with their address), honouring opt-outs  */
/*  + CAN-SPAM unsubscribe + plan limits. See lib/emails/             */
/*  deliver-interactive.ts.                                           */
/* ------------------------------------------------------------------ */

const sendEmailSchema = z.object({
  to: z.string().email("Invalid recipient email address"),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1, "Subject is required").max(500),
  body: z.string().min(1, "Body is required").max(50_000),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  // A2: send from this specific owned+active mailbox (re-resolved server-side).
  mailboxId: z.string().optional(),
});

const STATUS_BY_CODE: Record<string, number> = {
  opted_out: 403,
  blocked: 403,
  plan_limit: 429,
  not_configured: 503,
  send_failed: 502,
  test_mode: 403,
};

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CLE-12 — unified matrix gate on the fresh DB role. POST /api/emails/send
  // requires outbound:send (member+); a viewer is already blocked at the edge.
  const denied = requireCapabilityForRequest(authCtx, req);
  if (denied) return denied;

  let parsed: z.infer<typeof sendEmailSchema>;
  try {
    parsed = sendEmailSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || "Validation failed" },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Test-mode guardrail: block COLD recipients (strangers) so a campaign can't
  // blast real prospects while testing — but allow a WARM recipient (someone who
  // already corresponds with the tenant, i.e. the person you're replying to) so
  // the founder can answer their own inbox. deliver-interactive re-checks the
  // same rule. (deliver-interactive also re-runs this as defence in depth.)
  if (!(await isInteractiveRecipientSendable(authCtx.tenantId, parsed.to))) {
    return NextResponse.json({ error: recipientBlockReason(parsed.to) }, { status: 403 });
  }

  // Owner-aware delivery (own SMTP / Resend), opt-out + CAN-SPAM + plan limits.
  const result = await deliverInteractiveEmail({
    tenantId: authCtx.tenantId,
    ownerAppUserId: authCtx.appUserId,
    to: parsed.to,
    cc: parsed.cc,
    bcc: parsed.bcc,
    subject: parsed.subject,
    body: parsed.body,
    contactId: parsed.contactId,
    dealId: parsed.dealId,
    mailboxId: parsed.mailboxId,
    source: "composer",
  });

  if (!result.ok) {
    if (result.code === "send_failed") {
      logger.error("emails/send: delivery failed", { err: result.error, to: parsed.to });
    }
    return NextResponse.json({ error: result.error }, { status: STATUS_BY_CODE[result.code] ?? 500 });
  }

  return NextResponse.json({ success: true, messageId: result.messageId });
}
