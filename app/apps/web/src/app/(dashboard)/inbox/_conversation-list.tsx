"use client";

/**
 * Left-hand conversation list (master). Rows are light: name, subject,
 * snippet, reason line. Bodies live in the reading pane.
 */

import { useRef } from "react";
import { Inbox, CheckCircle2, AlarmClock, Bot, Mail, CheckSquare, Square } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { timeAgo } from "./_time-ago";
import { reasonTooltip, type ConversationListItem, type InboxLane } from "./_types";
import { dirOf } from "@/lib/inbox/text-direction";
import { decodeDisplay } from "@/lib/inbox/text-decode";
import { prefetchDetail } from "@/lib/inbox/detail-cache";
import { SenderAvatar } from "./_sender-avatar";

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
      {conversations.map((c) => {
        const selected = c.key === selectedKey;
        const multiSelected = selectedSet.has(c.key);
        const when = c.lastInboundAt ?? c.lastMessageAt;
        return (
          <button
            key={c.key}
            onClick={() => onSelect(c.key)}
            onMouseEnter={() => armPrefetch(c.key)}
            onMouseLeave={cancelPrefetch}
            className="group block w-full border-b px-3.5 py-2.5 text-left transition-colors"
            style={{
              borderColor: "var(--color-border-default)",
              background: selected || multiSelected ? "var(--color-accent-soft)" : "transparent",
              boxShadow: selected ? "inset 2px 0 0 var(--color-accent)" : "none",
            }}
            data-conversation-key={c.key}
          >
            <div className="flex gap-2.5">
              {onToggleSelect && (
                <span
                  role="checkbox"
                  aria-checked={multiSelected}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(c.key, e.shiftKey);
                  }}
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center transition-opacity ${
                    multiSelected || hasSelection ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  style={{ color: multiSelected ? "var(--color-accent)" : "var(--color-text-muted)" }}
                  title="Select (x) · Shift-click for a range"
                >
                  {multiSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                </span>
              )}
              <SenderAvatar name={decodeDisplay(c.displayName)} email={c.fromAddress} size={28} />
              <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                {decodeDisplay(c.displayName)}
              </span>
              {when && (
                <span className="shrink-0 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {timeAgo(when)}
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[12px]" style={{ color: "var(--color-text-secondary)" }} dir={dirOf(decodeDisplay(c.subject))}>
              {decodeDisplay(c.subject)}
            </div>
            {c.snippet && (
              <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--color-text-tertiary)" }} dir={dirOf(decodeDisplay(c.snippet))}>
                {decodeDisplay(c.snippet)}
              </div>
            )}
            <div className="mt-1 flex items-center gap-1.5">
              {lane === "attention" && (
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: priorityDot(c.importanceTier) }}
                  title={c.importanceFactors.length ? `Importance: ${c.importanceFactors.join(" · ")}` : undefined}
                />
              )}
              {c.reason && (
                <span
                  className="min-w-0 truncate text-[11px] font-medium"
                  style={{ color: lane === "handled" ? "var(--color-text-tertiary)" : "var(--color-accent)" }}
                  title={reasonTooltip(c.reasonSource)}
                >
                  {c.reason}
                </span>
              )}
              {c.labels.map((label) => (
                <span
                  key={label}
                  className="shrink-0 rounded px-1 text-[10px] font-medium"
                  style={{ background: "var(--color-badge-0-bg)", color: "var(--color-badge-0)" }}
                >
                  {label}
                </span>
              ))}
              {c.slaHoursOverdue != null && (
                <span
                  className="flex shrink-0 items-center gap-1 rounded px-1 text-[10px] font-medium"
                  style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}
                  title="Awaiting your reply, past the response SLA"
                >
                  <AlarmClock size={10} className="shrink-0" />
                  {c.slaHoursOverdue >= 24
                    ? `${Math.round(c.slaHoursOverdue / 24)}d overdue`
                    : `${Math.round(c.slaHoursOverdue)}h overdue`}
                </span>
              )}
              {showMailbox && c.mailboxLabel && (
                <span
                  className="ml-auto flex shrink-0 items-center gap-1 text-[10px]"
                  style={{ color: "var(--color-text-tertiary)" }}
                  title={c.mailboxAddress ?? c.mailboxLabel}
                >
                  <Mail size={10} className="shrink-0" />
                  <span className="max-w-[110px] truncate">{c.mailboxLabel}</span>
                </span>
              )}
            </div>
              </div>
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
