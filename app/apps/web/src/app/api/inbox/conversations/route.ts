import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { outboundEmails } from "@/db/schema";
import { and, eq, isNotNull, inArray, sql } from "drizzle-orm";
import { buildConversations, laneCounts, type Lane } from "@/lib/inbox/conversations";
import { loadConversationRows, contactNameMap } from "@/lib/inbox/load";
import { getInboxScope, scopeConversationRows } from "@/lib/inbox/user-scope";
import { attributeMailbox, indexMailboxes } from "@/lib/inbox/mailbox-attribution";
import { laneMatches, type MatchCandidate } from "@/lib/inbox/lane-match";
import { getUserLanes } from "@/lib/inbox/lane-store";
import { applyLabelFilters } from "@/lib/inbox/filter-match";
import { getUserFilters } from "@/lib/inbox/filter-store";
import { bundleConversations } from "@/lib/inbox/bundle";
import { matchesSearch, isActiveQuery, parseSearchQuery } from "@/lib/inbox/search-match";
import { selectCatchUp } from "@/lib/inbox/catch-up";
import { getLastSeen } from "@/lib/inbox/seen-store";

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

    // Custom smart lanes (INBOX-T01) live in the user_preferences JSONB store.
    // ?lane=<id> selects one and filters by its saved query (over the already-
    // scoped set) instead of a built-in lane; never widens visibility.
    const userLanes = await getUserLanes(authCtx.userId);
    const userFilters = await getUserFilters(authCtx.userId);
    const lastSeen = await getLastSeen(authCtx.userId);
    const customLane = userLanes.find((l) => l.id === laneParam) ?? null;
    const toLaneCandidate = (row: {
      c: { fromAddress: string; subject: string };
      mb: { mailboxAddress: string | null };
    }): MatchCandidate => ({
      from: row.c.fromAddress,
      subject: row.c.subject,
      mailbox: row.mb.mailboxAddress ?? undefined,
    });

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

    // Search (INBOX-Q04): ?q=<operators + free text>. When active it filters
    // across ALL lanes (you search the whole inbox, not the open lane).
    const qParam = (url.searchParams.get("q") || "").trim();
    const parsedQuery = qParam ? parseSearchQuery(qParam) : null;
    const searching = parsedQuery != null && isActiveQuery(parsedQuery);

    const inLane = searching
      ? visible.filter((row) =>
          matchesSearch(
            {
              from: row.c.fromAddress,
              subject: row.c.subject,
              snippet: row.c.snippet,
              lane: row.c.lane,
              at: row.c.lastMessageAt,
              mailbox: row.mb.mailboxAddress,
            },
            parsedQuery!,
          ),
        )
      : customLane
        ? visible.filter((row) => laneMatches(toLaneCandidate(row), customLane))
        : visible.filter(({ c }) => c.lane === lane);
    const pageRows = inLane.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    // Per-custom-lane counts for the tabs (honour "hide when empty").
    const customLanes = userLanes
      .map((l) => ({
        id: l.id,
        name: l.name,
        hideWhenEmpty: l.hideWhenEmpty ?? false,
        count: visible.filter((row) => laneMatches(toLaneCandidate(row), l)).length,
      }))
      .filter((l) => !l.hideWhenEmpty || l.count > 0);

    // Newsletter/promo bundling (INBOX-T03): group the bulk, never-replied
    // senders into one collapsible source each so they can be cleared in a
    // batch instead of one-by-one. Computed over the visible (scoped) set so
    // the per-mailbox filter narrows it too. Cheap; always returned.
    const bundles = bundleConversations(
      visible
        .filter(
          ({ c }) =>
            c.isBulk &&
            c.messageCount <= c.inboundCount &&
            c.lane !== "done" &&
            c.lane !== "snoozed",
        )
        .map(({ c }) => ({
          key: c.key,
          fromAddress: c.fromAddress,
          subject: c.subject,
          lastMessageAt: c.lastMessageAt,
          isBulk: c.isBulk,
          hasOutbound: c.messageCount > c.inboundCount,
        })),
    );

    // Catch-me-up (INBOX-S03): how many conversations got a new inbound since
    // the user was last here. First visit (no lastSeen) ⇒ 0, so we never flood.
    const catchUpCount = lastSeen
      ? selectCatchUp(
          visible.map(({ c }) => ({
            key: c.key,
            subject: c.subject,
            lastInboundAt: c.lastInboundAt,
            inboundCount: c.inboundCount,
          })),
          lastSeen,
        ).sinceCount
      : 0;

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
        reasonSource: c.reasonSource,
        slaHoursOverdue: c.slaHoursOverdue,
        importanceTier: c.importanceTier,
        importanceFactors: c.importanceFactors,
        labels: applyLabelFilters(toLaneCandidate({ c, mb }), userFilters),
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
      customLanes,
      activeLane: customLane ? customLane.id : lane,
      bundles,
      searching,
      catchUpCount,
      lastSeen,
    });
  } catch (error) {
    console.error("Failed to load inbox conversations:", error);
    return Response.json({ error: "Failed to load inbox conversations" }, { status: 500 });
  }
}
