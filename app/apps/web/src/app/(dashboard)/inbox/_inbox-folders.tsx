"use client";

/**
 * Inbox folder sidebar (shell-redesign) — the Upstream two-axis IA brought into
 * Elevay: a left vertical column of mailbox folders + intention/category Splits,
 * each with a live count, instead of the old horizontal tab bands. This is what
 * makes the inbox read like an email client (Superhuman/Upstream) rather than a
 * CRM list view. Self-contained: it drives the page's tab / customLane / split
 * state through callbacks; it owns no data.
 */

import { Search, X, Inbox, AlarmClock, CheckCircle2, Bot, Send, Layers, Reply, Clock, Megaphone, Users, Plus } from "lucide-react";
import type { InboxLane } from "./_types";
import type { SplitCount } from "@/lib/inbox/splits";

type LaneId = InboxLane | "outbound" | "bundles";

const LANE_META: Record<LaneId, { label: string; icon: React.ReactNode }> = {
  attention: { label: "Needs attention", icon: <Inbox size={15} /> },
  snoozed: { label: "Snoozed", icon: <AlarmClock size={15} /> },
  done: { label: "Done", icon: <CheckCircle2 size={15} /> },
  handled: { label: "Handled", icon: <Bot size={15} /> },
  outbound: { label: "Outbound", icon: <Send size={15} /> },
  bundles: { label: "Bundles", icon: <Layers size={15} /> },
};

const SPLIT_ICON: Record<string, React.ReactNode> = {
  needs_reply: <Reply size={15} />,
  follow_ups: <Clock size={15} />,
  promotions: <Megaphone size={15} />,
  social: <Users size={15} />,
};

function FolderRow({
  icon,
  label,
  count,
  active,
  muted,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
        active ? "" : "hover:bg-[var(--color-bg-hover)]"
      }`}
      style={{
        background: active ? "var(--color-accent-soft)" : "transparent",
        color: active ? "var(--color-accent)" : muted ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
      }}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {count != null && count > 0 && (
        <span
          className="shrink-0 rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
          style={{
            background: active ? "var(--color-accent)" : "var(--color-bg-hover)",
            color: active ? "var(--color-bg-card)" : "var(--color-text-secondary)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
      {children}
    </div>
  );
}

export function InboxFolders({
  tab,
  customLaneId,
  activeSplit,
  counts,
  splitCounts,
  customLanes,
  bundleTotal,
  search,
  onSearch,
  onSelectLane,
  onSelectSplit,
  onSelectCustomLane,
  onNewLane,
  onNewSplit,
}: {
  tab: LaneId;
  customLaneId: string | null;
  activeSplit: string | null;
  counts: Record<InboxLane, number>;
  splitCounts: SplitCount[];
  customLanes: Array<{ id: string; name: string; count: number }>;
  bundleTotal: number;
  search: string;
  onSearch: (q: string) => void;
  /** Select a built-in lane (clears custom lane + split). */
  onSelectLane: (lane: LaneId) => void;
  /** Select an intention split (jumps to the attention lane). */
  onSelectSplit: (id: string) => void;
  onSelectCustomLane: (id: string) => void;
  onNewLane: () => void;
  onNewSplit: () => void;
}) {
  const onBuiltIn = customLaneId === null;
  const lane = (id: LaneId, count?: number) => (
    <FolderRow
      key={id}
      icon={LANE_META[id].icon}
      label={LANE_META[id].label}
      count={count}
      active={onBuiltIn && tab === id && (id !== "attention" || activeSplit === null)}
      muted={id === "done" || id === "handled"}
      onClick={() => onSelectLane(id)}
    />
  );

  return (
    <div
      className="flex w-[224px] shrink-0 flex-col overflow-y-auto border-r"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      {/* Search at the top of the folder column (Upstream pattern). */}
      <div className="relative p-2">
        <Search size={13} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search mail"
          className="w-full rounded-md border py-1.5 pl-7 pr-7 text-[12px] outline-none"
          style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-page)", color: "var(--color-text-primary)" }}
        />
        {search && (
          <button onClick={() => onSearch("")} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} title="Clear search">
            <X size={12} />
          </button>
        )}
      </div>

      <div className="flex-1 px-1.5 pb-3">
        {/* Mailbox folders */}
        {lane("attention", counts.attention)}
        {lane("snoozed", counts.snoozed)}
        {lane("outbound")}
        {lane("done", counts.done)}
        {lane("handled", counts.handled)}
        {bundleTotal > 0 && lane("bundles", bundleTotal)}

        {/* Intention / category Splits (the triage win, surfaced as folders) */}
        {splitCounts.length > 0 && (
          <>
            <GroupLabel>Splits</GroupLabel>
            {splitCounts.map((s) => (
              <FolderRow
                key={s.id}
                icon={SPLIT_ICON[s.id] ?? <Inbox size={15} />}
                label={s.name}
                count={s.count}
                active={onBuiltIn && tab === "attention" && activeSplit === s.id}
                onClick={() => onSelectSplit(s.id)}
              />
            ))}
            <button
              onClick={onNewSplit}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <Plus size={14} /> New split
            </button>
          </>
        )}

        {/* Custom lanes */}
        {customLanes.length > 0 && (
          <>
            <GroupLabel>Lanes</GroupLabel>
            {customLanes.map((l) => (
              <FolderRow
                key={l.id}
                icon={<Inbox size={15} />}
                label={l.name}
                count={l.count}
                active={customLaneId === l.id}
                onClick={() => onSelectCustomLane(l.id)}
              />
            ))}
          </>
        )}
        <button
          onClick={onNewLane}
          className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg-hover)]"
          style={{ color: "var(--color-text-tertiary)" }}
          title="Create a lane from a sender domain"
        >
          <Plus size={14} /> New lane
        </button>
      </div>
    </div>
  );
}
