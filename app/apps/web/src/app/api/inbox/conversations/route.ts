import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { outboundEmails } from "@/db/schema";
import { and, eq, isNotNull, inArray, sql } from "drizzle-orm";
import { buildConversations, laneCounts, type Lane } from "@/lib/inbox/conversations";
import { BUILT_IN_SPLITS, resolveCustomSplit } from "@/lib/inbox/splits";
import { isFollowupDue } from "@/lib/inbox/followup-due";
import { getUserSplits } from "@/lib/inbox/split-store";
import { getNoiseOverrides } from "@/lib/inbox/noise-override-store";
import { getStarredKeys } from "@/lib/inbox/starred-store";
import { getMailboxIdentities } from "@/lib/inbox/mailbox-identity";
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
    const userSplits = await getUserSplits(authCtx.userId);
    const BUILT_IN_SPLIT_IDS = new Set<string>(BUILT_IN_SPLITS.map((b) => b.id));
    const lastSeen = await getLastSeen(authCtx.userId);
    const starredKeys = new Set(await getStarredKeys(authCtx.userId));
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

    const scopedRows = scopeConversationRows(await loadConversationRows(authCtx.tenantId), scope);
    const noiseOverrides = await getNoiseOverrides(authCtx.userId);
    const allConversations = buildConversations({ ...scopedRows, noiseOverrides });

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
    // A3: overlay the per-mailbox identity display-name (server-side, so the rail,
    // the From selector and the per-conversation label all read one overridden
    // value). Precedence: identity.displayName -> connected display_name -> address.
    const mailboxIdentities = await getMailboxIdentities(authCtx.userId);
    const mailboxes = scope.mailboxes.map((m) => ({
      id: m.id,
      address: m.address,
      label: mailboxIdentities[m.id]?.displayName?.trim() || m.label,
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

    // B3: ?split=<built-in id> sub-segments the attention lane by intention.
    const splitParam = url.searchParams.get("split");

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
      : laneParam === "starred"
        ? visible.filter(({ c }) => starredKeys.has(c.key)) // Upstream is:starred — across all lanes
      : customLane
        ? visible.filter((row) => laneMatches(toLaneCandidate(row), customLane))
        : splitParam
          ? visible.filter(({ c }) =>
              c.lane === "attention" &&
              // "noise" is a pseudo-split over the demotion flag; "follow_ups" is
              // realigned to Upstream (DUE follow-ups via B7, not all awaiting-reply);
              // other built-in ids match c.split; else a custom per-sender split.
              (splitParam === "noise"
                ? c.noise
                : splitParam === "follow_ups"
                  ? isFollowupDue(c.followup)
                  : BUILT_IN_SPLIT_IDS.has(splitParam)
                    ? c.split === splitParam
                    : resolveCustomSplit(c.fromAddress, userSplits)?.id === splitParam),
            )
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

    // B3: built-in intention-split counts over the attention lane (each
    // conversation resolves to exactly one, so these sum to the attention total),
    // then the user's custom per-sender splits (honouring hideWhenEmpty).
    const attentionRows = visible.filter(({ c }) => c.lane === "attention");
    const builtInSplitCounts = BUILT_IN_SPLITS.map((b) => ({
      id: b.id,
      name: b.name,
      // Follow Ups is realigned to Upstream: the threads with a DUE follow-up
      // (B7), not every awaiting-their-reply thread.
      count:
        b.id === "follow_ups"
          ? attentionRows.filter(({ c }) => isFollowupDue(c.followup)).length
          : attentionRows.filter(({ c }) => c.split === b.id).length,
    }));
    const customSplitCounts = userSplits
      .map((s) => ({
        id: s.id,
        name: s.name,
        hideWhenEmpty: s.hideWhenEmpty ?? false,
        count: attentionRows.filter(({ c }) => resolveCustomSplit(c.fromAddress, userSplits)?.id === s.id).length,
      }))
      .filter((s) => !s.hideWhenEmpty || s.count > 0)
      .map(({ id, name, count }) => ({ id, name, count }));
    const splits = [...builtInSplitCounts, ...customSplitCounts];

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
        followup: c.followup,
        starred: starredKeys.has(c.key),
        importanceTier: c.importanceTier,
        importanceFactors: c.importanceFactors,
        labels: applyLabelFilters(toLaneCandidate({ c, mb }), userFilters),
        handledNote: c.handledNote,
        lastInboundAt: c.lastInboundAt,
        lastMessageAt: c.lastMessageAt,
        messageCount: c.messageCount,
        hasIntelligence: c.intelligence !== null,
        split: c.split,
        noise: c.noise,
        mailboxId: mb.mailboxId,
        mailboxAddress: mb.mailboxAddress,
        mailboxLabel: (mb.mailboxId && mailboxIdentities[mb.mailboxId]?.displayName?.trim()) || mb.mailboxLabel,
      })),
      counts: { ...counts, outbound: Number(outboundCountRow?.count || 0) },
      splits,
      noiseCount: visible.filter(({ c }) => c.noise).length,
      followupsDueCount: visible.filter(({ c }) => isFollowupDue(c.followup)).length,
      starredCount: visible.filter(({ c }) => starredKeys.has(c.key)).length,
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
