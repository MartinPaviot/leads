import { db } from "@/db";
import { outboundEmails, activities } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { verifyTrackingId } from "@/lib/tracking-token";

/**
 * Click tracking redirect endpoint.
 *
 * M8 — previously accepted an unsigned `id` param, letting anyone
 * inflate click counts or attribute engagement to the wrong contact by
 * replaying captured URLs at scale. Now requires a signed token `t`
 * whose payload is the emailId. The legacy `id` param is still parsed
 * as a fallback so in-flight emails sent before the cutover don't
 * start 404ing, but new sends use `t=<signed>`.
 *
 * GET /api/track/click?t={signedToken}&url={encodedUrl}
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url, "http://localhost");
  const signedId = verifyTrackingId(searchParams.get("t"));
  // Accept the unsigned `id` only for the backwards-compat window. No
  // session gate — still "unauth-public" by design — but the signed
  // path is the one fresh sends will use.
  const emailId = signedId ?? searchParams.get("id");
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Validate URL to prevent open redirect
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (emailId) {
    // Fire-and-forget: don't block redirect
    recordClick(emailId, targetUrl).catch((e) => console.warn("track/click: recordClick failed", e));
  }

  return NextResponse.redirect(parsed.toString());
}

async function recordClick(emailId: string, url: string) {
  try {
    const [email] = await db
      .select({ id: outboundEmails.id, contactId: outboundEmails.contactId, tenantId: outboundEmails.tenantId, clickedAt: outboundEmails.clickedAt })
      .from(outboundEmails)
      .where(eq(outboundEmails.id, emailId))
      .limit(1);

    if (!email) return;

    // Update clickedAt (only first click updates this, but track all clicks in activities)
    if (!email.clickedAt) {
      await db
        .update(outboundEmails)
        .set({ clickedAt: new Date(), updatedAt: new Date() })
        .where(eq(outboundEmails.id, emailId));
    }

    // Log activity for every click
    if (email.contactId) {
      await db.insert(activities).values({
        tenantId: email.tenantId,
        actorType: "contact",
        actorId: email.contactId,
        entityType: "contact",
        entityId: email.contactId,
        activityType: "email_opened", // Closest available type — click implies open
        channel: "email",
        direction: "inbound",
        summary: `Clicked link: ${url.slice(0, 100)}`,
        metadata: { outboundEmailId: emailId, clickedUrl: url, type: "click" },
      });
    }
  } catch {
    // Non-critical
  }
}
