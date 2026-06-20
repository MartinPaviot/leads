"use client";

/**
 * InboxRow — the single conversation-row renderer for the master list.
 * Upstream single-line anatomy (teardown/06 + /12): one fixed-height (44px),
 * vertically-centred row = checkbox(hover) + avatar + ONE truncated line
 * [Sender(700) · Subject(700) · snippet(400 muted)] + a right cluster
 * (SLA/follow-up chip · timestamp · mailbox dot). The reason badge moved to the
 * row tooltip; the priority dot leads the line on the attention lane. Dense like
 * an email client, not a stacked CRM card.
 */

import { memo } from "react";
import { AlarmClock, CheckSquare, Square, Star } from "lucide-react";
import { timeAgo } from "./_time-ago";
import { reasonTooltip, type ConversationListItem, type InboxLane } from "./_types";
import { dirOf } from "@/lib/inbox/text-direction";
import { decodeDisplay } from "@/lib/inbox/text-decode";
import { followupLabel } from "@/lib/inbox/followup-due";
import { SenderAvatar } from "./_sender-avatar";

function priorityDot(priority: number): string {
  if (priority === 1) return "var(--color-success)";
  if (priority === 2) return "var(--color-info)";
  if (priority === 3) return "var(--color-warning)";
  return "var(--color-text-muted)";
}

export const InboxRow = memo(function InboxRow({
  item,
  lane,
  selected,
  multiSelected,
  hasSelection,
  showMailbox = false,
  onSelect,
  onToggleSelect,
  onHoverStart,
  onHoverEnd,
  onToggleStar,
}: {
  item: ConversationListItem;
  lane: InboxLane;
  selected: boolean;
  multiSelected: boolean;
  hasSelection: boolean;
  showMailbox?: boolean;
  onSelect: (key: string) => void;
  onToggleSelect?: (key: string, shift: boolean) => void;
  // F2: key-passing hover handlers so the list can pass ONE stable ref to every
  // row (the row applies its own key), keeping React.memo effective.
  onHoverStart?: (key: string) => void;
  onHoverEnd?: () => void;
  /** Toggle the conversation's star (Upstream is:starred). */
  onToggleStar?: (key: string, starred: boolean) => void;
}) {
  const c = item;
  const when = c.lastInboundAt ?? c.lastMessageAt;
  // B7: the follow-up indicator is SLA-exclusive — only when no SLA chip shows
  // (the two never co-occur on a real thread, but the guard makes it explicit).
  const followupText = c.followup && c.slaHoursOverdue == null ? followupLabel(c.followup) : null;
  const reasonTitle = c.reason ? `${c.reason}${reasonTooltip(c.reasonSource) ? ` — ${reasonTooltip(c.reasonSource)}` : ""}` : undefined;
  return (
    <button
      onClick={() => onSelect(c.key)}
      onMouseEnter={() => onHoverStart?.(c.key)}
      onMouseLeave={onHoverEnd}
      title={reasonTitle}
      className="group flex w-full items-center gap-2 border-b px-3 text-left transition-colors"
      style={{
        height: "var(--inbox-row-height)",
        borderColor: "var(--color-border-default)",
        background: selected || multiSelected ? "var(--color-accent-soft)" : "transparent",
        boxShadow: selected ? "inset 2px 0 0 var(--color-accent)" : "none",
      }}
      data-conversation-key={c.key}
    >
      {onToggleSelect && (
        <span
          role="checkbox"
          aria-checked={multiSelected}
          aria-label="Select conversation"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(c.key, e.shiftKey);
          }}
          className={`flex h-4 w-4 shrink-0 items-center justify-center transition-opacity ${
            multiSelected || hasSelection ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{ color: multiSelected ? "var(--color-accent)" : "var(--color-text-muted)" }}
          title="Select (x) · Shift-click for a range"
        >
          {multiSelected ? <CheckSquare size={15} /> : <Square size={15} />}
        </span>
      )}
      {/* Unread dot (Upstream): a fixed 8px leading slot so read/unread rows stay
          column-aligned; the blue dot shows only when unread. */}
      <span className="flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden>
        {c.unread && <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-accent)" }} />}
      </span>
      <SenderAvatar name={decodeDisplay(c.displayName)} email={c.fromAddress} size={22} />
      {/* One truncated line: Sender · Subject · snippet (bold when unread, Upstream). */}
      <div className="min-w-0 flex-1 truncate text-[14px]" style={{ color: "var(--color-text-primary)" }}>
        {lane === "attention" && (
          <span
            className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle"
            style={{ background: priorityDot(c.importanceTier) }}
            title={c.importanceFactors.length ? `Importance: ${c.importanceFactors.join(" · ")}` : undefined}
          />
        )}
        <span className={c.unread ? "font-bold" : "font-normal"}>{decodeDisplay(c.displayName)}</span>
        <span className={c.unread ? "font-medium" : "font-normal"} dir={dirOf(decodeDisplay(c.subject))}>
          {"  "}
          {decodeDisplay(c.subject)}
        </span>
        {c.snippet && (
          <span style={{ color: "var(--color-text-secondary)" }} dir={dirOf(decodeDisplay(c.snippet))}>
            {"  "}
            {decodeDisplay(c.snippet)}
          </span>
        )}
      </div>
      {/* Right cluster: star · SLA / follow-up chip · labels · time · mailbox dot. */}
      <div className="flex shrink-0 items-center gap-2">
        {onToggleStar && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar(c.key, !c.starred);
            }}
            className={`shrink-0 cursor-pointer transition-opacity ${c.starred ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            style={{ color: c.starred ? "var(--color-warning)" : "var(--color-text-muted)" }}
            title={c.starred ? "Unstar" : "Star"}
            aria-label={c.starred ? "Unstar conversation" : "Star conversation"}
          >
            <Star size={14} style={{ fill: c.starred ? "var(--color-warning)" : "none" }} />
          </span>
        )}
        {c.slaHoursOverdue != null && (
          <span
            className="flex items-center gap-1 rounded px-1 text-[10px] font-medium"
            style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}
            title="Awaiting your reply, past the response SLA"
          >
            <AlarmClock size={10} className="shrink-0" />
            {c.slaHoursOverdue >= 24
              ? `${Math.round(c.slaHoursOverdue / 24)}d overdue`
              : `${Math.round(c.slaHoursOverdue)}h overdue`}
          </span>
        )}
        {followupText && (
          <span
            className="flex items-center gap-1 rounded px-1 text-[10px] font-medium"
            style={
              c.followup?.overdue
                ? { background: "var(--color-warning-soft)", color: "var(--color-warning)" }
                : { color: "var(--color-text-tertiary)" }
            }
            title="Awaiting their reply — a gentle follow-up is due"
          >
            <AlarmClock size={10} className="shrink-0" />
            {followupText}
          </span>
        )}
        {c.labels.map((label) => (
          <span
            key={label}
            className="rounded px-1 text-[10px] font-medium"
            style={{ background: "var(--color-badge-0-bg)", color: "var(--color-badge-0)" }}
          >
            {label}
          </span>
        ))}
        {when && (
          <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            {timeAgo(when)}
          </span>
        )}
        {showMailbox && c.mailboxLabel && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: "var(--color-accent)" }}
            title={c.mailboxAddress ?? c.mailboxLabel}
          />
        )}
      </div>
    </button>
  );
});
