import { db } from "@/db";
import { outboundEmails, activities } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Click tracking redirect endpoint.
 * GET /api/track/click?id={emailId}&url={encodedUrl}
 * Records the click event and redirects to the original URL.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url, "http://localhost");
  const emailId = searchParams.get("id");
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
