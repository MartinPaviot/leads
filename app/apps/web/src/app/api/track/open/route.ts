import { db } from "@/db";
import { outboundEmails, activities } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { verifyTrackingId } from "@/lib/tracking-token";

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

/**
 * Open tracking pixel endpoint.
 *
 * M8 — prefer a signed `t=<token>` param; fall back to the unsigned
 * `id=<emailId>` for in-flight legacy sends. An unverifiable token is
 * ignored (no DB write) but we still return the pixel so the receiving
 * email client doesn't render a broken image. See `signTrackingId` in
 * `@/lib/tracking-token`.
 *
 * GET /api/track/open?t={signedToken}
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url, "http://localhost");
  const signedId = verifyTrackingId(searchParams.get("t"));
  const emailId = signedId ?? searchParams.get("id");

  if (emailId) {
    // Fire-and-forget: don't block pixel response
    recordOpen(emailId).catch((e) => console.warn("track/open: recordOpen failed", e));
  }

  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": PIXEL.length.toString(),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

async function recordOpen(emailId: string) {
  try {
    // Only record first open
    const [email] = await db
      .select({ id: outboundEmails.id, openedAt: outboundEmails.openedAt, contactId: outboundEmails.contactId, tenantId: outboundEmails.tenantId })
      .from(outboundEmails)
      .where(and(eq(outboundEmails.id, emailId), isNull(outboundEmails.openedAt)))
      .limit(1);

    if (!email) return;

    await db
      .update(outboundEmails)
      .set({ openedAt: new Date(), updatedAt: new Date() })
      .where(eq(outboundEmails.id, emailId));

    // Log activity
    if (email.contactId) {
      await db.insert(activities).values({
        tenantId: email.tenantId,
        actorType: "contact",
        actorId: email.contactId,
        entityType: "contact",
        entityId: email.contactId,
        activityType: "email_opened",
        channel: "email",
        direction: "inbound",
        summary: "Opened email",
        metadata: { outboundEmailId: emailId },
      });
    }
  } catch {
    // Non-critical — don't fail the pixel
  }
}
