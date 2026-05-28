import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { outboundEmails, contacts } from "@/db/schema";
import { eq, and, isNotNull, desc, sql, isNull } from "drizzle-orm";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(req.url, "http://localhost");
    const filter = url.searchParams.get("filter") || "all"; // all, replied, awaiting, bounced
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = 30;
    const offset = (page - 1) * pageSize;

    // Base: all sent outbound emails for this tenant
    let whereClause = and(
      eq(outboundEmails.tenantId, authCtx.tenantId),
      isNotNull(outboundEmails.sentAt),
    );

    if (filter === "replied") {
      whereClause = and(whereClause, isNotNull(outboundEmails.repliedAt));
    } else if (filter === "awaiting") {
      whereClause = and(
        whereClause,
        sql`${outboundEmails.repliedAt} IS NULL AND ${outboundEmails.status} NOT IN ('bounced', 'failed')`,
      );
    } else if (filter === "bounced") {
      whereClause = and(whereClause, eq(outboundEmails.status, "bounced"));
    }

    const [emails, countResult] = await Promise.all([
      db
        .select({
          id: outboundEmails.id,
          toAddress: outboundEmails.toAddress,
          fromAddress: outboundEmails.fromAddress,
          subject: outboundEmails.subject,
          status: outboundEmails.status,
          sentAt: outboundEmails.sentAt,
          openedAt: outboundEmails.openedAt,
          clickedAt: outboundEmails.clickedAt,
          repliedAt: outboundEmails.repliedAt,
          bouncedAt: outboundEmails.bouncedAt,
          replySnippet: outboundEmails.replySnippet,
          replyClassification: outboundEmails.replyClassification,
          bounceType: outboundEmails.bounceType,
          contactId: outboundEmails.contactId,
          enrollmentId: outboundEmails.enrollmentId,
          stepNumber: outboundEmails.stepNumber,
          threadId: outboundEmails.threadId,
        })
        .from(outboundEmails)
        .where(whereClause)
        .orderBy(desc(outboundEmails.sentAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(outboundEmails)
        .where(whereClause),
    ]);

    // Enrich with contact names
    const contactIds = [...new Set(emails.map((e) => e.contactId).filter(Boolean))] as string[];
    const contactMap: Record<string, { name: string; email: string | null }> = {};
    if (contactIds.length > 0) {
      const contactRows = await db
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
        .from(contacts)
        .where(and(sql`${contacts.id} = ANY(${contactIds})`, isNull(contacts.deletedAt)));
      for (const c of contactRows) {
        contactMap[c.id] = {
          name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Unknown",
          email: c.email,
        };
      }
    }

    // Summary counts
    const [counts] = await db
      .select({
        total: sql<number>`count(*)::int`,
        replied: sql<number>`count(*) filter (where ${outboundEmails.repliedAt} is not null)`,
        awaiting: sql<number>`count(*) filter (where ${outboundEmails.repliedAt} is null and ${outboundEmails.status} not in ('bounced', 'failed'))`,
        bounced: sql<number>`count(*) filter (where ${outboundEmails.status} = 'bounced')`,
      })
      .from(outboundEmails)
      .where(and(eq(outboundEmails.tenantId, authCtx.tenantId), isNotNull(outboundEmails.sentAt)));

    const enrichedEmails = emails.map((e) => ({
      ...e,
      contact: e.contactId ? contactMap[e.contactId] || null : null,
    }));

    return Response.json({
      emails: enrichedEmails,
      counts: {
        total: Number(counts?.total || 0),
        replied: Number(counts?.replied || 0),
        awaiting: Number(counts?.awaiting || 0),
        bounced: Number(counts?.bounced || 0),
      },
      pagination: {
        page,
        pageSize,
        total: Number(countResult[0]?.count || 0),
      },
    });
  } catch (error) {
    console.error("Failed to fetch inbox:", error);
    return Response.json({ error: "Failed to fetch inbox" }, { status: 500 });
  }
}
