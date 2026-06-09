import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { deliverInteractiveEmail } from "@/lib/emails/deliver-interactive";
import { logger } from "@/lib/observability/logger";
import { isRecipientAllowed, recipientBlockReason } from "@/lib/emails/recipient-guardrail";

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
  subject: z.string().min(1, "Subject is required").max(500),
  body: z.string().min(1, "Body is required").max(50_000),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
});

const STATUS_BY_CODE: Record<string, number> = {
  opted_out: 403,
  plan_limit: 429,
  not_configured: 503,
  send_failed: 502,
};

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // Test-mode guardrail (PR #89): block real prospects while OUTBOUND_TEST_MODE
  // is on, even for a deliberate manual composer send.
  if (!isRecipientAllowed(parsed.to)) {
    return NextResponse.json({ error: recipientBlockReason(parsed.to) }, { status: 403 });
  }

  // Owner-aware delivery (own SMTP / Resend), opt-out + CAN-SPAM + plan limits.
  const result = await deliverInteractiveEmail({
    tenantId: authCtx.tenantId,
    ownerAppUserId: authCtx.appUserId,
    to: parsed.to,
    cc: parsed.cc,
    subject: parsed.subject,
    body: parsed.body,
    contactId: parsed.contactId,
    dealId: parsed.dealId,
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
