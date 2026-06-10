"use client";

/**
 * Left-hand conversation list (master). Rows are light: name, subject,
 * snippet, reason line. Bodies live in the reading pane.
 */

import { Inbox, CheckCircle2, AlarmClock, Bot } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { timeAgo } from "./_time-ago";
import type { ConversationListItem, InboxLane } from "./_types";

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

function priorityDot(priority: number): string {
  if (priority === 1) return "var(--color-success)";
  if (priority === 2) return "var(--color-info)";
  if (priority === 3) return "var(--color-warning)";
  return "var(--color-text-muted)";
}

export function ConversationList({
  lane,
  conversations,
  selectedKey,
  onSelect,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  lane: InboxLane;
  conversations: ConversationListItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (conversations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState icon={LANE_ICON[lane]} title={EMPTY_COPY[lane].title} description={EMPTY_COPY[lane].description} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {conversations.map((c) => {
        const selected = c.key === selectedKey;
        const when = c.lastInboundAt ?? c.lastMessageAt;
        return (
          <button
            key={c.key}
            onClick={() => onSelect(c.key)}
            className="block w-full border-b px-3.5 py-2.5 text-left transition-colors"
            style={{
              borderColor: "var(--color-border-default)",
              background: selected ? "var(--color-accent-soft)" : "transparent",
              boxShadow: selected ? "inset 2px 0 0 var(--color-accent)" : "none",
            }}
            data-conversation-key={c.key}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                {c.displayName}
              </span>
              {when && (
                <span className="shrink-0 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {timeAgo(when)}
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              {c.subject}
            </div>
            {c.snippet && (
              <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                {c.snippet}
              </div>
            )}
            <div className="mt-1 flex items-center gap-1.5">
              {lane === "attention" && (
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: priorityDot(c.priority) }}
                  aria-hidden
                />
              )}
              <span className="truncate text-[11px] font-medium" style={{ color: lane === "handled" ? "var(--color-text-tertiary)" : "var(--color-accent)" }}>
                {c.reason}
              </span>
            </div>
          </button>
        );
      })}

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
