"use client";

/**
 * Left-hand conversation list (master). Rows are rendered by InboxRow (F1);
 * this component owns the empty state, hover-intent prefetch, and load-more.
 */

import { useRef, useCallback } from "react";
import { Inbox, CheckCircle2, AlarmClock, Bot, SearchX, Reply, Clock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { type ConversationListItem, type InboxLane } from "./_types";
import { prefetchDetail } from "@/lib/inbox/detail-cache";
import { InboxRow, type InboxDensity } from "./_inbox-row";

const EMPTY_COPY: Record<InboxLane, { title: string; description: string }> = {
  attention: {
    title: "Nothing needs your attention",
    description: "Incoming replies land here, hottest first, once your contacts write back.",
  },
  snoozed: { title: "Nothing snoozed", description: "Snoozed conversations come back automatically." },
  done: { title: "Nothing marked done yet", description: "Conversations you finish land here. A new reply reopens them." },
  handled: {
    title: "Nothing handled by the agent yet",
    description: "Out-of-office, unsubscribes and bounces are processed automatically and reported here.",
  },
};

// Per-split empty copy (Upstream parity): the AI-output tabs have their own
// resting empty state, distinct from the lane's. Verbatim from Upstream's live
// empty states (UP-audit-02/03).
const SPLIT_EMPTY_COPY: Record<string, { icon: React.ReactNode; title: string; description: string }> = {
  needs_reply: {
    icon: <Reply size={28} />,
    title: "No AI-generated reply drafts right now.",
    description: "When the agent drafts a reply for you to review, it shows up here.",
  },
  follow_ups: {
    icon: <Clock size={28} />,
    title: "No follow-up suggestions right now.",
    description: "When a waiting thread is due a nudge, the agent's suggestion shows up here.",
  },
};

const LANE_ICON: Record<InboxLane, React.ReactNode> = {
  attention: <Inbox size={28} />,
  snoozed: <AlarmClock size={28} />,
  done: <CheckCircle2 size={28} />,
  handled: <Bot size={28} />,
};

export function ConversationList({
  lane,
  conversations,
  selectedKey,
  onSelect,
  selectedKeys = [],
  onToggleSelect,
  hasMore,
  loadingMore,
  onLoadMore,
  showMailbox = false,
  hasQuery = false,
  onClearSearch,
  onToggleStar,
  activeSplit = null,
  density = "comfortable",
}: {
  lane: InboxLane;
  conversations: ConversationListItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Multi-select set (INBOX-T09); empty = not in selection mode. */
  selectedKeys?: string[];
  /** Toggle a row into the multi-select set (shift = range). */
  onToggleSelect?: (key: string, shift: boolean) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Show the "received on X" chip — true in the "All inboxes" view. */
  showMailbox?: boolean;
  /** F3: a search query is active — an empty result is "no matches", not an empty lane. */
  hasQuery?: boolean;
  /** F3: clear the search from the no-results empty state. */
  onClearSearch?: () => void;
  /** Toggle a conversation's star (Upstream is:starred). */
  onToggleStar?: (key: string, starred: boolean) => void;
  /** Active split id — drives the per-split resting empty copy (Upstream parity). */
  activeSplit?: string | null;
  /** Outlook-style display density (comfortable 2-line / compact 1-line). */
  density?: InboxDensity;
}) {
  const selectedSet = new Set(selectedKeys);
  const hasSelection = selectedKeys.length > 0;
  // Hover-intent prefetch (INBOX-K04): warm a thread's detail after the cursor
  // rests on its row ~150ms, so a click/keyboard-open renders instantly. One
  // timer for the whole list — only the last-hovered row is in flight.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // F2: stable identities (they close over the ref only) so InboxRow's React.memo
  // isn't broken by a fresh hover closure every render.
  const armPrefetch = useCallback((key: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => prefetchDetail(key), 150);
  }, []);
  const cancelPrefetch = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  if (conversations.length === 0) {
    // F3 R3.4/R3.5: an empty result under an active search is "no matches" (with a
    // way out), not the lane's resting empty copy.
    const splitEmpty = activeSplit ? SPLIT_EMPTY_COPY[activeSplit] : undefined;
    const empty = hasQuery
      ? {
          icon: <SearchX size={28} />,
          title: "No conversations match the current search",
          description: "Try a different search, or clear it to see this lane.",
        }
      : splitEmpty
        ? splitEmpty
        : { icon: LANE_ICON[lane], title: EMPTY_COPY[lane].title, description: EMPTY_COPY[lane].description };
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={empty.icon}
          title={empty.title}
          description={empty.description}
          actionLabel={hasQuery && onClearSearch ? "Clear search" : undefined}
          onAction={hasQuery ? onClearSearch : undefined}
        />
      </div>
    );
  }

  return (
    // No own scroller — the parent list column owns overflow, so scroll position
    // survives opening/closing a thread (single source of truth for restore).
    <div className="flex flex-col">
      {conversations.map((c) => (
        <InboxRow
          key={c.key}
          item={c}
          lane={lane}
          selected={c.key === selectedKey}
          multiSelected={selectedSet.has(c.key)}
          hasSelection={hasSelection}
          showMailbox={showMailbox}
          onSelect={onSelect}
          onToggleSelect={onToggleSelect}
          onHoverStart={armPrefetch}
          onHoverEnd={cancelPrefetch}
          onToggleStar={onToggleStar}
          density={density}
        />
      ))}

      {hasMore && (
        <div className="flex justify-center p-3">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore} loading={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
