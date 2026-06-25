"use client";

/**
 * InboxRow — the single conversation-row renderer for the master list.
 *
 * Two densities (Outlook "Display density"):
 *  • comfortable (default) — a 2-line row: line 1 = sender + time, line 2 =
 *    subject · preview (muted). Surfaces every element distinctly so the list is
 *    scannable instead of one faded, masked line. Height var(--inbox-row-height).
 *  • compact — one dense single line [sender · subject · snippet] with a soft
 *    right-edge fade and the time on the right. Height var(--inbox-row-height-compact).
 *
 * Shared anatomy: checkbox(hover) + star + unread dot + avatar lead the row; the
 * SLA/follow-up chip, labels and a per-mailbox dot sit on the right. The reason
 * lives on the row tooltip. Dense like an email client, not a stacked CRM card.
 */

import { memo } from "react";
import { AlarmClock, CheckSquare, Square, Star } from "lucide-react";
import { mailTimestamp } from "./_time-ago";
import { reasonTooltip, type ConversationListItem, type InboxLane } from "./_types";
import { dirOf } from "@/lib/inbox/text-direction";
import { decodeDisplay } from "@/lib/inbox/text-decode";
import { followupLabel } from "@/lib/inbox/followup-due";
import { SenderAvatar } from "./_sender-avatar";

export type InboxDensity = "comfortable" | "compact";

export const InboxRow = memo(function InboxRow({
  item,
  lane,
  selected,
  multiSelected,
  hasSelection,
  showMailbox = false,
  density = "comfortable",
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
  /** Outlook-style display density — drives the row layout + height. */
  density?: InboxDensity;
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
  const compact = density === "compact";

  // SLA / follow-up chip — shared by both densities (hover-revealed, calm).
  const chip =
    c.slaHoursOverdue != null ? (
      <span
        className="flex items-center gap-1 text-[12px] opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: "var(--color-warning)" }}
        title="Awaiting your reply, past the response SLA"
      >
        <AlarmClock size={11} className="shrink-0" />
        {c.slaHoursOverdue >= 24 ? `${Math.round(c.slaHoursOverdue / 24)}d` : `${Math.round(c.slaHoursOverdue)}h`}
      </span>
    ) : followupText ? (
      <span
        className="flex items-center gap-1 text-[12px] opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: c.followup?.overdue ? "var(--color-warning)" : "var(--color-text-tertiary)" }}
        title="Awaiting their reply — a gentle follow-up is due"
      >
        <AlarmClock size={11} className="shrink-0" />
        {followupText}
      </span>
    ) : null;

  const labels =
    c.labels.length > 0
      ? c.labels.map((label) => (
          <span
            key={label}
            className="shrink-0 rounded px-1 text-[10px] font-medium"
            style={{ background: "var(--color-badge-0-bg)", color: "var(--color-badge-0)" }}
          >
            {label}
          </span>
        ))
      : null;

  const time = when ? (
    <span className="shrink-0 text-[12px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>
      {mailTimestamp(when)}
    </span>
  ) : null;

  const mailboxDot =
    showMailbox && c.mailboxLabel ? (
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: "var(--color-accent)" }}
        title={c.mailboxAddress ?? c.mailboxLabel}
      />
    ) : null;

  return (
    <button
      onClick={() => onSelect(c.key)}
      onMouseEnter={() => onHoverStart?.(c.key)}
      onMouseLeave={onHoverEnd}
      title={reasonTitle}
      className={`group flex w-full items-center gap-2 border-b px-3 text-left transition-colors ${compact ? "" : "py-2"}`}
      style={{
        height: compact ? "var(--inbox-row-height-compact)" : "var(--inbox-row-height)",
        borderColor: "var(--color-border-default)",
        background: selected || multiSelected ? "var(--color-accent-soft)" : "transparent",
        boxShadow: selected ? "inset 2px 0 0 var(--color-accent)" : "none",
      }}
      data-conversation-key={c.key}
      // The open thread + unread state are only visual (background/weight/dot);
      // surface them to assistive tech too.
      aria-current={selected ? "true" : undefined}
    >
      {c.unread && <span className="sr-only">Unread. </span>}
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
      {/* Star (Upstream): a LEADING toggle tight beside the checkbox. Filled
          yellow when starred, faint on hover. */}
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
      {/* Unread dot (Upstream): a fixed 8px slot just before the avatar so
          read/unread rows stay column-aligned; the blue dot shows only when unread. */}
      <span className="flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden>
        {c.unread && <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-accent)" }} />}
      </span>
      <SenderAvatar name={decodeDisplay(c.displayName)} email={c.fromAddress} size={compact ? 20 : 32} />

      {compact ? (
        /* ── Compact: one dense single line [sender · subject · snippet] ── */
        <>
          <div
            className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-[14px]"
            style={{
              color: "var(--color-text-primary)",
              // Upstream-style soft fade on the right edge instead of a hard "…" cut.
              maskImage: "linear-gradient(to right, black calc(100% - 28px), transparent)",
              WebkitMaskImage: "linear-gradient(to right, black calc(100% - 28px), transparent)",
            }}
          >
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
          <div className="flex shrink-0 items-center gap-2">
            {chip}
            {labels}
            {time}
            {mailboxDot}
          </div>
        </>
      ) : (
        /* ── Comfortable: Outlook 2-line row (sender + time / subject · preview) ── */
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          {/* Line 1: sender (left, bold when unread) · chip · time (right). */}
          <div className="flex min-w-0 items-baseline gap-2">
            <span
              className={`min-w-0 flex-1 truncate text-[14px] ${c.unread ? "font-bold" : "font-normal"}`}
              style={{ color: "var(--color-text-primary)" }}
            >
              {decodeDisplay(c.displayName)}
            </span>
            {chip}
            {time}
            {mailboxDot}
          </div>
          {/* Line 2: subject (medium when unread) then preview snippet (muted) ·
              labels on the right. One truncating run keeps it to a single line. */}
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px]">
              <span
                className={c.unread ? "font-medium" : "font-normal"}
                style={{ color: "var(--color-text-primary)" }}
                dir={dirOf(decodeDisplay(c.subject))}
              >
                {decodeDisplay(c.subject)}
              </span>
              {c.snippet && (
                <span style={{ color: "var(--color-text-secondary)" }} dir={dirOf(decodeDisplay(c.snippet))}>
                  {"  "}
                  {decodeDisplay(c.snippet)}
                </span>
              )}
            </span>
            {labels}
          </div>
        </div>
      )}
    </button>
  );
});
