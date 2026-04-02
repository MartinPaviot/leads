import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { outboundEmails, contacts, companies } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "draft";
  const enrollmentId = searchParams.get("enrollmentId");

  let query = db
    .select()
    .from(outboundEmails)
    .where(
      and(
        eq(outboundEmails.tenantId, authCtx.tenantId),
        eq(outboundEmails.status, status as "draft" | "queued" | "sent")
      )
    )
    .orderBy(outboundEmails.createdAt)
    .limit(50);

  const emails = await query;

  // Enrich with contact info
  const contactIds = [...new Set(emails.map((e) => e.contactId).filter(Boolean))];
  const contactList =
    contactIds.length > 0
      ? await db
          .select()
          .from(contacts)
          .where(inArray(contacts.id, contactIds as string[]))
      : [];
  const contactMap = Object.fromEntries(contactList.map((c) => [c.id, c]));

  const enrichedEmails = emails.map((e) => ({
    ...e,
    contact: e.contactId ? contactMap[e.contactId] || null : null,
  }));

  return Response.json({ emails: enrichedEmails });
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { emailId, action, subject, bodyHtml } = body;

  if (!emailId || !action) {
    return Response.json({ error: "emailId and action required" }, { status: 400 });
  }

  switch (action) {
    case "approve": {
      await db
        .update(outboundEmails)
        .set({
          status: "queued",
          queuedAt: new Date(),
          ...(subject && { subject }),
          ...(bodyHtml && { bodyHtml }),
          updatedAt: new Date(),
        })
        .where(and(eq(outboundEmails.id, emailId), eq(outboundEmails.tenantId, authCtx.tenantId)));
      break;
    }
    case "skip": {
      await db
        .update(outboundEmails)
        .set({ status: "skipped", updatedAt: new Date() })
        .where(and(eq(outboundEmails.id, emailId), eq(outboundEmails.tenantId, authCtx.tenantId)));
      break;
    }
    case "edit": {
      if (subject || bodyHtml) {
        await db
          .update(outboundEmails)
          .set({
            ...(subject && { subject }),
            ...(bodyHtml && { bodyHtml }),
            updatedAt: new Date(),
          })
          .where(and(eq(outboundEmails.id, emailId), eq(outboundEmails.tenantId, authCtx.tenantId)));
      }
      break;
    }
  }

  return Response.json({ success: true });
}

// Bulk approve
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { emailIds, action } = body;

  if (!emailIds || !Array.isArray(emailIds) || !action) {
    return Response.json({ error: "emailIds array and action required" }, { status: 400 });
  }

  if (action === "approve_all") {
    await db
      .update(outboundEmails)
      .set({ status: "queued", queuedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(outboundEmails.tenantId, authCtx.tenantId),
          inArray(outboundEmails.id, emailIds),
          eq(outboundEmails.status, "draft")
        )
      );
  }

  return Response.json({ success: true, count: emailIds.length });
}
