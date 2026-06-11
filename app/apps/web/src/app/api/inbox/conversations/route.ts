import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { outboundEmails } from "@/db/schema";
import { and, eq, isNotNull, inArray, sql } from "drizzle-orm";
import { buildConversations, laneCounts, type Lane } from "@/lib/inbox/conversations";
import { loadConversationRows, contactNameMap } from "@/lib/inbox/load";
import { getInboxScope, scopeConversationRows } from "@/lib/inbox/user-scope";

const LANES: Lane[] = ["attention", "handled", "snoozed", "done"];
const PAGE_SIZE = 30;

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(req.url, "http://localhost");
    const laneParam = url.searchParams.get("lane") || "attention";
    const lane: Lane = (LANES as string[]).includes(laneParam) ? (laneParam as Lane) : "attention";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));

    // The inbox is personal: scope to the signed-in user's own mailbox(es),
    // never the whole workspace. No mailbox connected → an empty inbox.
    const scope = await getInboxScope(authCtx.tenantId, authCtx.userId);
    const rows = scopeConversationRows(await loadConversationRows(authCtx.tenantId), scope);
    const conversations = buildConversations(rows);

    const counts = laneCounts(conversations);
    const [outboundCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(outboundEmails)
      .where(
        and(
          eq(outboundEmails.tenantId, authCtx.tenantId),
          isNotNull(outboundEmails.sentAt),
          scope.hasMailbox ? inArray(outboundEmails.mailboxId, [...scope.mailboxIds]) : sql`false`,
        ),
      );

    const inLane = conversations.filter((c) => c.lane === lane);
    const pageRows = inLane.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const names = await contactNameMap(
      authCtx.tenantId,
      pageRows.map((c) => c.contactId).filter(Boolean) as string[],
    );

    return Response.json({
      conversations: pageRows.map((c) => ({
        key: c.key,
        lane: c.lane,
        priority: c.priority,
        subject: c.subject,
        contactId: c.contactId,
        displayName: (c.contactId && names[c.contactId]?.name) || c.fromAddress || "Unknown sender",
        fromAddress: c.fromAddress,
        snippet: c.snippet,
        reason: c.reason,
        handledNote: c.handledNote,
        lastInboundAt: c.lastInboundAt,
        lastMessageAt: c.lastMessageAt,
        messageCount: c.messageCount,
        hasIntelligence: c.intelligence !== null,
      })),
      counts: { ...counts, outbound: Number(outboundCountRow?.count || 0) },
      pagination: { page, pageSize: PAGE_SIZE, total: inLane.length },
      mailboxConnected: scope.hasMailbox,
    });
  } catch (error) {
    console.error("Failed to load inbox conversations:", error);
    return Response.json({ error: "Failed to load inbox conversations" }, { status: 500 });
  }
}
