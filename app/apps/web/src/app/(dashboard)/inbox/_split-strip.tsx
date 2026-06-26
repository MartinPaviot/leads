"use client";

/**
 * Split-tab strip (inbox-shell-redesign V2) — Upstream's SECOND nav axis: a
 * horizontal band above the conversation list that sub-segments the attention
 * lane by intention/category. Primary · Needs Reply · Follow Ups · Promotions ·
 * Social · <custom> · Noise, each a small colored icon + a count chip. Selecting a
 * tab drives the page's activeSplit over the already-wired `?split=` route; the
 * sidebar's intention rows stay in sync with the same state. Frontend-only.
 */

import { Inbox, Reply, Clock, Megaphone, Users, VolumeX, Hash } from "lucide-react";
import type { SplitCount } from "@/lib/inbox/splits";
import { useT } from "@/lib/i18n/locale";

/** Per-split icon + a badge color token (Upstream uses colored category icons). */
const SPLIT_STYLE: Record<string, { icon: React.ReactNode; color: string }> = {
  other: { icon: <Inbox size={14} />, color: "var(--color-badge-0)" }, // Primary
  needs_reply: { icon: <Reply size={14} />, color: "var(--color-badge-3)" },
  follow_ups: { icon: <Clock size={14} />, color: "var(--color-badge-5)" },
  promotions: { icon: <Megaphone size={14} />, color: "var(--color-badge-6)" },
  social: { icon: <Users size={14} />, color: "var(--color-badge-4)" },
  noise: { icon: <VolumeX size={14} />, color: "var(--color-text-tertiary)" },
};

function Tab({
  id,
  name,
  count,
  active,
  onClick,
}: {
  id: string;
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const style = SPLIT_STYLE[id] ?? { icon: <Hash size={14} />, color: "var(--color-badge-2)" };
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[14px] font-normal transition-colors"
      style={{
        borderColor: active ? "var(--color-accent)" : "transparent",
        color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
      }}
    >
      <span className="shrink-0" style={{ color: style.color }}>
        {style.icon}
      </span>
      {name}
      {count > 0 && (
        <span className="text-[11px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>
          {count}
        </span>
      )}
    </button>
  );
}

export function SplitStrip({
  splits,
  noiseCount,
  active,
  onSelect,
}: {
  /** Built-in (Primary/Needs Reply/...) + custom per-sender splits, with counts. */
  splits: SplitCount[];
  /** Demoted-noise count — the trailing Noise tab. */
  noiseCount: number;
  /** The active split id, or null (the whole attention lane / Inbox). */
  active: string | null;
  /** Select a split; passing the active id again clears it (back to all). */
  onSelect: (id: string | null) => void;
}) {
  const t = useT();
  return (
    <div
      className="flex items-center gap-1 overflow-x-auto border-b px-2"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      {splits.map((s) => (
        <Tab
          key={s.id}
          id={s.id}
          name={s.name}
          count={s.count}
          active={active === s.id}
          onClick={() => onSelect(active === s.id ? null : s.id)}
        />
      ))}
      {noiseCount > 0 && (
        <Tab id="noise" name={t("inbox.split.noise")} count={noiseCount} active={active === "noise"} onClick={() => onSelect(active === "noise" ? null : "noise")} />
      )}
    </div>
  );
}
