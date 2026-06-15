"use client";

/**
 * Unified-inbox mailbox rail (L2). A user who runs outreach from many boxes
 * gets a left-hand list of all their connected mailboxes — "All inboxes" plus
 * each box with its own attention backlog — and clicks one to focus it. Only
 * rendered when the user owns 2+ mailboxes (a single-box user needs no chooser).
 */

import { Inbox, Mail } from "lucide-react";
import type { MailboxSummary } from "./_types";

export function MailboxRail({
  mailboxes,
  selected,
  onSelect,
}: {
  mailboxes: MailboxSummary[];
  /** null = "All inboxes". */
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const totalAttention = mailboxes.reduce((sum, m) => sum + m.attention, 0);

  return (
    <div
      className="flex w-[212px] shrink-0 flex-col overflow-y-auto border-r py-2"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      <div
        className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        Mailboxes
      </div>

      <RailRow
        icon={<Inbox size={14} />}
        label="All inboxes"
        sub={`${mailboxes.length} connected`}
        count={totalAttention}
        active={selected === null}
        onClick={() => onSelect(null)}
      />

      {mailboxes.map((m) => (
        <RailRow
          key={m.id}
          icon={<Mail size={14} />}
          label={m.label}
          sub={m.address}
          count={m.attention}
          active={selected === m.id}
          onClick={() => onSelect(m.id)}
        />
      ))}
    </div>
  );
}

function RailRow({
  icon,
  label,
  sub,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="mx-1.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
      style={{
        background: active ? "var(--color-accent-soft)" : "transparent",
        boxShadow: active ? "inset 2px 0 0 var(--color-accent)" : "none",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--color-bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        className="shrink-0"
        style={{ color: active ? "var(--color-accent)" : "var(--color-text-tertiary)" }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[12.5px] font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {label}
        </span>
        <span className="block truncate text-[10.5px]" style={{ color: "var(--color-text-tertiary)" }}>
          {sub}
        </span>
      </span>
      {count > 0 && (
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
