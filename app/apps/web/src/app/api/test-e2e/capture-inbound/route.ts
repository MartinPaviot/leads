import { NextResponse } from "next/server";
import { captureInboundEmail, type InboundEmailInput } from "@/lib/capture/email-capture";

/**
 * E2E-only: run one synthetic inbound email through the unified capture seam
 * (captureInboundEmail) — the same code path the EmailEngine webhook, the
 * IMAP cron and force-sync use — so capture attribution can be exercised
 * end-to-end without a real mailbox.
 *
 * Dual gate, same as test-e2e/seed: ENABLE_E2E_SEED=1 is the canonical
 * switch; NODE_ENV is a secondary wall.
 */
export async function POST(req: Request) {
  if (process.env.ENABLE_E2E_SEED !== "1" || process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const body = (await req.json()) as Partial<InboundEmailInput>;
  if (!body.tenantId || !body.fromHeader) {
    return NextResponse.json({ error: "tenantId and fromHeader required" }, { status: 400 });
  }

  const result = await captureInboundEmail({
    tenantId: body.tenantId,
    fromHeader: body.fromHeader,
    toHeader: body.toHeader ?? null,
    subject: body.subject ?? null,
    text: body.text ?? null,
    messageId: body.messageId ?? null,
    threadId: body.threadId ?? null,
    occurredAt: body.occurredAt,
  });

  return NextResponse.json({ result });
}
