import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { outboundEmails } from "@/db/schema";
import { and, eq, isNotNull, inArray, sql } from "drizzle-orm";
import { buildConversations, laneCounts, type Lane } from "@/lib/inbox/conversations";
import { loadConversationRows, contactNameMap } from "@/lib/inbox/load";
import { getInboxScope, scopeConversationRows } from "@/lib/inbox/user-scope";
import { attributeMailbox, indexMailboxes } from "@/lib/inbox/mailbox-attribution";

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
    const mailboxIndex = indexMailboxes(scope.mailboxes);

    // Optional per-mailbox filter (?mailbox=<id>) — the unified-inbox cockpit
    // lets the user focus one of their many boxes. Ignored unless it's one
    // they actually own (so a stale/forged id can't widen the scope).
    const mailboxParam = url.searchParams.get("mailbox");
    const selectedMailbox =
      mailboxParam && scope.mailboxIds.has(mailboxParam) ? mailboxParam : null;

    const allConversations = buildConversations(
      scopeConversationRows(await loadConversationRows(authCtx.tenantId), scope),
    );

    // Attribute every conversation to its owning mailbox ONCE, up front — the
    // rail's per-box counts and the per-mailbox filter both read it.
    const attributed = allConversations.map((c) => ({
      c,
      mb: attributeMailbox(c.messages, mailboxIndex),
    }));

    // Per-mailbox attention counts for the rail — always over ALL the user's
    // mail (not the current filter) so each box shows its own backlog.
    const attentionByMailbox = new Map<string, number>();
    for (const { c, mb } of attributed) {
      if (c.lane === "attention" && mb.mailboxId) {
        attentionByMailbox.set(mb.mailboxId, (attentionByMailbox.get(mb.mailboxId) ?? 0) + 1);
      }
    }
    const mailboxes = scope.mailboxes.map((m) => ({
      id: m.id,
      address: m.address,
      label: m.label,
      attention: attentionByMailbox.get(m.id) ?? 0,
    }));

    // Narrow everything the list shows to the selected box, if any.
    const visible = selectedMailbox
      ? attributed.filter(({ mb }) => mb.mailboxId === selectedMailbox)
      : attributed;

    const counts = laneCounts(visible.map(({ c }) => c));

    // Outbound count — the selected box, else all the user's boxes.
    const outboundMailboxIds = selectedMailbox ? [selectedMailbox] : [...scope.mailboxIds];
    const [outboundCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(outboundEmails)
      .where(
        and(
          eq(outboundEmails.tenantId, authCtx.tenantId),
          isNotNull(outboundEmails.sentAt),
          scope.hasMailbox && outboundMailboxIds.length > 0
            ? inArray(outboundEmails.mailboxId, outboundMailboxIds)
            : sql`false`,
        ),
      );

    const inLane = visible.filter(({ c }) => c.lane === lane);
    const pageRows = inLane.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const names = await contactNameMap(
      authCtx.tenantId,
      pageRows.map(({ c }) => c.contactId).filter(Boolean) as string[],
    );

    return Response.json({
      conversations: pageRows.map(({ c, mb }) => ({
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
        mailboxId: mb.mailboxId,
        mailboxAddress: mb.mailboxAddress,
        mailboxLabel: mb.mailboxLabel,
      })),
      counts: { ...counts, outbound: Number(outboundCountRow?.count || 0) },
      pagination: { page, pageSize: PAGE_SIZE, total: inLane.length },
      mailboxConnected: scope.hasMailbox,
      mailboxes,
      selectedMailbox,
    });
  } catch (error) {
    console.error("Failed to load inbox conversations:", error);
    return Response.json({ error: "Failed to load inbox conversations" }, { status: 500 });
  }
}
