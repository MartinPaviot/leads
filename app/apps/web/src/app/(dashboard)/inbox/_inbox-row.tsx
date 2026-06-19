"use client";

/**
 * InboxRow (F1) — the single conversation-row renderer for the master list.
 * Extracted from _conversation-list.tsx so density + type scale live in ONE place
 * and read from the F1 tokens. Type scale to the measured bar: sender 14/700,
 * subject 14/600, snippet 13/secondary, timestamp 12/tertiary; min-height
 * var(--inbox-row-height). Behaviour is unchanged (selection rail, hover/selected
 * checkbox, avatar, priority dot, reason, labels, SLA, "received on" chip).
 */

import { AlarmClock, Mail, CheckSquare, Square } from "lucide-react";
import { timeAgo } from "./_time-ago";
import { reasonTooltip, type ConversationListItem, type InboxLane } from "./_types";
import { dirOf } from "@/lib/inbox/text-direction";
import { decodeDisplay } from "@/lib/inbox/text-decode";
import { SenderAvatar } from "./_sender-avatar";

function priorityDot(priority: number): string {
  if (priority === 1) return "var(--color-success)";
  if (priority === 2) return "var(--color-info)";
  if (priority === 3) return "var(--color-warning)";
  return "var(--color-text-muted)";
}

export function InboxRow({
  item,
  lane,
  selected,
  multiSelected,
  hasSelection,
  showMailbox = false,
  onSelect,
  onToggleSelect,
  onMouseEnter,
  onMouseLeave,
}: {
  item: ConversationListItem;
  lane: InboxLane;
  selected: boolean;
  multiSelected: boolean;
  hasSelection: boolean;
  showMailbox?: boolean;
  onSelect: (key: string) => void;
  onToggleSelect?: (key: string, shift: boolean) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const c = item;
  const when = c.lastInboundAt ?? c.lastMessageAt;
  return (
    <button
      onClick={() => onSelect(c.key)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="group block w-full border-b px-3.5 py-2.5 text-left transition-colors"
      style={{
        minHeight: "var(--inbox-row-height)",
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
            aria-label="Select conversation"
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
            <span className="truncate text-[14px] font-bold" style={{ color: "var(--color-text-primary)" }}>
              {decodeDisplay(c.displayName)}
            </span>
            {when && (
              <span className="shrink-0 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                {timeAgo(when)}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }} dir={dirOf(decodeDisplay(c.subject))}>
            {decodeDisplay(c.subject)}
          </div>
          {c.snippet && (
            <div className="mt-0.5 truncate text-[13px]" style={{ color: "var(--color-text-secondary)" }} dir={dirOf(decodeDisplay(c.snippet))}>
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
}
