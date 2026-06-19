"use client";

/**
 * Left-hand conversation list (master). Rows are rendered by InboxRow (F1);
 * this component owns the empty state, hover-intent prefetch, and load-more.
 */

import { useRef } from "react";
import { Inbox, CheckCircle2, AlarmClock, Bot } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { type ConversationListItem, type InboxLane } from "./_types";
import { prefetchDetail } from "@/lib/inbox/detail-cache";
import { InboxRow } from "./_inbox-row";

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
}) {
  const selectedSet = new Set(selectedKeys);
  const hasSelection = selectedKeys.length > 0;
  // Hover-intent prefetch (INBOX-K04): warm a thread's detail after the cursor
  // rests on its row ~150ms, so a click/keyboard-open renders instantly. One
  // timer for the whole list — only the last-hovered row is in flight.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armPrefetch = (key: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => prefetchDetail(key), 150);
  };
  const cancelPrefetch = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  if (conversations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState icon={LANE_ICON[lane]} title={EMPTY_COPY[lane].title} description={EMPTY_COPY[lane].description} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
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
          onMouseEnter={() => armPrefetch(c.key)}
          onMouseLeave={cancelPrefetch}
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
