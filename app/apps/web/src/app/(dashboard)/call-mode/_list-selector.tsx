"use client";

/**
 * Call-list controls — the compact head of the "To call now" column
 * (T5, _specs/call-lists). The first version stacked three full-height
 * sections (Par jour / Par secteur / Trier) with uppercase labels, which
 * pushed the actual call list far down a ~224px rail. A cold-call cockpit
 * should keep the rep IN the list, so the controls collapse to two glanceable
 * lines under the title — the altitude a dialer (Orum / Nooks / Aircall) keeps:
 *
 *   - Row 1: the title + the AUDIENCE scope (which segment feeds the queue) as a
 *     dropdown — the heaviest, least-frequent switch (it POSTs /activate and the
 *     queue regenerates), so it earns the least real estate. "Create a list from
 *     a phrase" lives inside it.
 *   - Row 2: the by-DAY filter (Tous / Rappels / Nouveaux) as a segmented
 *     control — the primary axis the rep toggles during a session — plus a
 *     compact SORT menu pinned right (set-once, so it hides behind one icon with
 *     an accent dot when a non-default order is active).
 *
 * Two expert cues, free: the Rappels count turns accent when > 0 (clear your
 * committed callbacks before fresh dials), and the sort dot signals a custom
 * order. No emoji — lucide icons carry the semantics (brand rule). Popovers
 * mirror the sibling FromNumberPicker (ref + click-outside + Escape, app shadow
 * tokens) so they read as part of the cockpit, not a bolt-on.
 */

import { useEffect, useRef, useState } from "react";
import { Plus, Check, Loader2, Layers, ChevronDown, ArrowDownUp } from "lucide-react";
import { ACTIVE_SORT_KEYS } from "@/lib/voice/queue-sort";
import type { CallListSort } from "@/lib/voice/call-lists";

export interface SystemListEntry {
  id: "today" | "callbacks_due" | "new";
  name: string;
  count: number;
}

export interface SectorListEntry {
  id: string;
  name: string;
  sort?: string;
  counts: { total: number; withPhone: number; callable: number };
}

export interface CallListsData {
  system: SystemListEntry[];
  sector: SectorListEntry[];
  activeListId: string | null;
  hasCampaign: boolean;
}

/** Dismiss an open popover on outside-click or Escape (shared by both menus). */
function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return ref;
}

export function CallListSelector(props: {
  data: CallListsData;
  /** Which by-day view is active (client filter). */
  selectedSystemId: string;
  /** A sector list id currently being activated (server round-trip), or null. */
  busySectorId: string | null;
  onSelectSystem: (id: SystemListEntry["id"]) => void;
  onActivateSector: (id: string) => void;
  onActivateAll: () => void;
  onCreate: (phrase: string) => Promise<void> | void;
  /** Session-level queue sort applied to the current view. */
  sortKey: CallListSort;
  onSortChange: (sort: CallListSort) => void;
  creating: boolean;
}) {
  const {
    data,
    selectedSystemId,
    busySectorId,
    onSelectSystem,
    onActivateSector,
    onActivateAll,
    onCreate,
    sortKey,
    onSortChange,
    creating,
  } = props;

  // Size of the view the rep is actually working — shown by the title so the
  // per-toggle counts can drop out (3-digit counts blow the segmented control
  // past the rail width). Updates as the by-day filter changes.
  const activeCount =
    data.system.find((s) => s.id === selectedSystemId)?.count ?? data.system[0]?.count ?? 0;

  return (
    <div className="border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
      {/* Row 1 — title + audience scope (which segment feeds the queue). */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <h2 className="shrink-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            To call now
          </h2>
          <span className="shrink-0 tabular-nums text-[11px] text-zinc-400">{activeCount}</span>
        </div>
        <AudienceMenu
          sector={data.sector}
          activeListId={data.activeListId}
          busySectorId={busySectorId}
          hasCampaign={data.hasCampaign}
          onActivateSector={onActivateSector}
          onActivateAll={onActivateAll}
          onCreate={onCreate}
          creating={creating}
        />
      </div>

      {/* Row 2 — by-day filter (primary) + sort (set-once, behind one icon). */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <DayFilter system={data.system} selectedId={selectedSystemId} onSelect={onSelectSystem} />
        <SortMenu sortKey={sortKey} onSortChange={onSortChange} />
      </div>
    </div>
  );
}

/** Tooltip detail per by-day view — the meaning the short label drops. */
const DAY_HINT: Record<SystemListEntry["id"], string> = {
  today: "Toute la file du jour",
  callbacks_due: "Rappels dus (déjà tentés)",
  new: "Jamais tentés",
};

function DayFilter(props: {
  system: SystemListEntry[];
  selectedId: string;
  onSelect: (id: SystemListEntry["id"]) => void;
}) {
  const { system, selectedId, onSelect } = props;
  return (
    <div className="no-scrollbars flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/60">
      {system.map((s) => {
        const active = selectedId === s.id;
        // Warmest bucket: surface committed callbacks so the eye lands there first.
        const urgent = s.id === "callbacks_due" && s.count > 0;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            title={`${DAY_HINT[s.id]} · ${s.count}`}
            aria-pressed={active}
            className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] font-medium transition-colors ${
              active
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <span>{s.name}</span>
            {/* Warmest bucket: a dot (not a 3-digit count) flags pending
                callbacks without blowing the rail width. The exact count is in
                the tooltip and on the title once this view is selected. */}
            {urgent && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: "var(--color-accent)" }}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function SortMenu(props: { sortKey: CallListSort; onSortChange: (s: CallListSort) => void }) {
  const { sortKey, onSortChange } = props;
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const activeLabel = ACTIVE_SORT_KEYS.find((s) => s.key === sortKey)?.label ?? "Fit ICP";
  const isDefault = sortKey === "fit";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Trier : ${activeLabel}`}
        aria-label={`Trier : ${activeLabel}`}
        className="relative flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <ArrowDownUp size={13} />
        {!isDefault && (
          <span
            className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-accent)" }}
          />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[170px] rounded-lg py-1"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
            boxShadow: "var(--shadow-floating)",
          }}
        >
          <div
            className="px-3 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Trier par
          </div>
          {ACTIVE_SORT_KEYS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                onSortChange(s.key);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors"
              style={{ color: "var(--color-text-primary)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-bg-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <Check
                size={14}
                className={sortKey === s.key ? "opacity-100" : "opacity-0"}
                style={{ color: "var(--color-accent)" }}
              />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AudienceMenu(props: {
  sector: SectorListEntry[];
  activeListId: string | null;
  busySectorId: string | null;
  hasCampaign: boolean;
  onActivateSector: (id: string) => void;
  onActivateAll: () => void;
  onCreate: (phrase: string) => Promise<void> | void;
  creating: boolean;
}) {
  const {
    sector,
    activeListId,
    busySectorId,
    hasCampaign,
    onActivateSector,
    onActivateAll,
    onCreate,
    creating,
  } = props;
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [phrase, setPhrase] = useState("");
  const ref = useDismiss(open, () => setOpen(false));

  // Whole-ICP is the active "audience" when no sprint list is set.
  const activeSectorId = activeListId ?? "all";
  const activeName =
    activeSectorId === "all"
      ? "Tout l'ICP"
      : sector.find((s) => s.id === activeSectorId)?.name ?? "Tout l'ICP";

  // Reset the create form whenever the menu closes so it reopens clean.
  useEffect(() => {
    if (!open) {
      setAdding(false);
      setPhrase("");
    }
  }, [open]);

  async function submit() {
    const p = phrase.trim();
    if (!p || creating) return;
    await onCreate(p);
    setPhrase("");
    setAdding(false);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Audience : quelle cible alimente la file"
        className="flex h-7 min-w-0 max-w-[180px] items-center gap-1.5 rounded-md border border-zinc-200 px-2 text-[12px] text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <Layers size={12} className="shrink-0 text-zinc-400" />
        <span className="truncate">{activeName}</span>
        {busySectorId !== null ? (
          <Loader2 size={12} className="shrink-0 animate-spin text-zinc-400" />
        ) : (
          <ChevronDown size={12} className="shrink-0 text-zinc-400" />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[230px] rounded-lg py-1"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
            boxShadow: "var(--shadow-floating)",
          }}
        >
          <div
            className="px-3 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Audience appelée
          </div>
          <AudienceRow
            checked={activeSectorId === "all"}
            name="Tout l'ICP"
            muted
            busy={busySectorId === "all"}
            onClick={() => {
              onActivateAll();
              setOpen(false);
            }}
          />
          {sector.map((l) => (
            <AudienceRow
              key={l.id}
              checked={activeSectorId === l.id}
              name={l.name}
              count={l.counts.callable}
              busy={busySectorId === l.id}
              onClick={() => {
                onActivateSector(l.id);
                setOpen(false);
              }}
            />
          ))}

          {/* Create-from-phrase (the LLM resolves sector × persona, validated
              verbatim). Only when a campaign exists to attach the list to. */}
          {hasCampaign && (
            <>
              <div className="my-1" style={{ borderTop: "1px solid var(--color-border-default)" }} />
              {!adding ? (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  title="Nouvelle liste par secteur"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors"
                  style={{ color: "var(--color-text-secondary)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--color-bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Plus size={14} style={{ color: "var(--color-text-tertiary)" }} />
                  Nouvelle liste…
                </button>
              ) : (
                <div className="px-3 py-2">
                  <div className="text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
                    Créer une liste par secteur
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={phrase}
                      onChange={(e) => setPhrase(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submit();
                        if (e.key === "Escape") setAdding(false);
                      }}
                      placeholder="ex. les DG des EMS romands"
                      disabled={creating}
                      className="h-7 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-[12px]"
                      style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-primary)" }}
                    />
                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={creating || !phrase.trim()}
                      className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-zinc-900 px-2 text-[12px] font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      Créer
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AudienceRow(props: {
  checked: boolean;
  name: string;
  count?: number;
  muted?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  const { checked, name, count, muted, busy, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors"
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--color-bg-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Check
          size={14}
          className={checked ? "shrink-0 opacity-100" : "shrink-0 opacity-0"}
          style={{ color: "var(--color-accent)" }}
        />
        <span
          className={`truncate text-[13px] ${muted ? "italic" : ""}`}
          style={{ color: muted ? "var(--color-text-secondary)" : "var(--color-text-primary)" }}
        >
          {name}
        </span>
      </span>
      {busy ? (
        <Loader2 size={12} className="shrink-0 animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
      ) : typeof count === "number" ? (
        <span className="shrink-0 tabular-nums text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
