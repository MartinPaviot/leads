import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { outboundEmails, contacts, activities } from "@/db/schema";
import { eq, and, isNotNull, desc, sql, isNull, inArray, or } from "drizzle-orm";
import { getInboxScope } from "@/lib/inbox/user-scope";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(req.url, "http://localhost");
    const filter = url.searchParams.get("filter") || "all"; // all, replied, awaiting, bounced, inbound
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = 30;
    const offset = (page - 1) * pageSize;

    // Personal inbox: a member only sees mail from their OWN connected mailbox,
    // never the workspace owner's. No mailbox connected → nothing to show.
    const scope = await getInboxScope(authCtx.tenantId, authCtx.userId);
    if (!scope.hasMailbox) {
      return Response.json({
        emails: [],
        counts: { total: 0, replied: 0, awaiting: 0, bounced: 0, inbound: 0 },
        pagination: { page, pageSize, total: 0 },
        mailboxConnected: false,
      });
    }
    const mineOutbound = inArray(outboundEmails.mailboxId, [...scope.mailboxIds]);
    // Inbound is attributed by recipient: the captured `metadata.to` contains
    // one of the user's mailbox addresses. (% and _ escaped so an address can't
    // act as a wildcard.)
    const mineInbound =
      scope.addresses.size > 0
        ? or(
            ...[...scope.addresses].map((a) => {
              const esc = a.replace(/([\\%_])/g, "\\$1");
              return sql`lower(${activities.metadata}->>'to') like ${"%" + esc + "%"} escape '\\'`;
            }),
          )!
        : sql`false`;

    // Inbound count (email_received activities) — the other half of the
    // conversation. Always computed so the chip shows on every view.
    const [inboundCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, authCtx.tenantId),
          eq(activities.activityType, "email_received"),
          isNull(activities.deletedAt),
          mineInbound,
        ),
      );
    const inboundCount = Number(inboundCountRow?.count || 0);

    // Outbound summary counts — always shown on the filter chips.
    const [counts] = await db
      .select({
        total: sql<number>`count(*)::int`,
        replied: sql<number>`count(*) filter (where ${outboundEmails.repliedAt} is not null)`,
        awaiting: sql<number>`count(*) filter (where ${outboundEmails.repliedAt} is null and ${outboundEmails.status} not in ('bounced', 'failed'))`,
        bounced: sql<number>`count(*) filter (where ${outboundEmails.status} = 'bounced')`,
      })
      .from(outboundEmails)
      .where(and(eq(outboundEmails.tenantId, authCtx.tenantId), isNotNull(outboundEmails.sentAt), mineOutbound));

    const countsPayload = {
      total: Number(counts?.total || 0),
      replied: Number(counts?.replied || 0),
      awaiting: Number(counts?.awaiting || 0),
      bounced: Number(counts?.bounced || 0),
      inbound: inboundCount,
    };

    // ── Inbound view: captured incoming messages (full body, threaded) ──
    if (filter === "inbound") {
      const rows = await db
        .select({
          id: activities.id,
          contactId: activities.entityId,
          occurredAt: activities.occurredAt,
          summary: activities.summary,
          rawContent: activities.rawContent,
          metadata: activities.metadata,
          threadId: activities.threadId,
          sentiment: activities.sentiment,
        })
        .from(activities)
        .where(
          and(
            eq(activities.tenantId, authCtx.tenantId),
            eq(activities.activityType, "email_received"),
            isNull(activities.deletedAt),
            mineInbound,
          ),
        )
        .orderBy(desc(activities.occurredAt))
        .limit(pageSize)
        .offset(offset);

      // Enrich with contact names. For inbound attributed to a person,
      // entityId points at the contact; company-linked inbound has none.
      const cids = [...new Set(rows.map((r) => r.contactId).filter(Boolean))] as string[];
      const cmap: Record<string, { name: string; email: string | null }> = {};
      if (cids.length > 0) {
        const crows = await db
          .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
          .from(contacts)
          .where(and(inArray(contacts.id, cids), isNull(contacts.deletedAt)));
        for (const c of crows) {
          cmap[c.id] = {
            name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Unknown",
            email: c.email,
          };
        }
      }

      const inboundEmails = rows.map((r) => {
        const meta = (r.metadata || {}) as Record<string, unknown>;
        return {
          id: r.id,
          direction: "inbound" as const,
          fromAddress: (meta.from as string) || cmap[r.contactId]?.email || "",
          toAddress: (meta.to as string) || "",
          subject: r.summary || (meta.subject as string) || "(no subject)",
          body: r.rawContent || (meta.snippet as string) || "",
          receivedAt: r.occurredAt,
          threadId: r.threadId,
          sentiment: r.sentiment,
          contactId: r.contactId,
          contact: cmap[r.contactId] || null,
        };
      });

      return Response.json({
        emails: inboundEmails,
        counts: countsPayload,
        pagination: { page, pageSize, total: inboundCount },
        mailboxConnected: true,
      });
    }

    // ── Outbound views (all / replied / awaiting / bounced) ──
    let whereClause = and(
      eq(outboundEmails.tenantId, authCtx.tenantId),
      isNotNull(outboundEmails.sentAt),
      mineOutbound,
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
        .where(and(inArray(contacts.id, contactIds), isNull(contacts.deletedAt)));
      for (const c of contactRows) {
        contactMap[c.id] = {
          name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Unknown",
          email: c.email,
        };
      }
    }

    const enrichedEmails = emails.map((e) => ({
      ...e,
      direction: "outbound" as const,
      contact: e.contactId ? contactMap[e.contactId] || null : null,
    }));

    return Response.json({
      emails: enrichedEmails,
      counts: countsPayload,
      pagination: {
        page,
        pageSize,
        total: Number(countResult[0]?.count || 0),
      },
      mailboxConnected: true,
    });
  } catch (error) {
    console.error("Failed to fetch inbox:", error);
    return Response.json({ error: "Failed to fetch inbox" }, { status: 500 });
  }
}
