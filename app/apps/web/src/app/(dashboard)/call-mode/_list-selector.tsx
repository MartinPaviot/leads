"use client";

/**
 * Call-list selector — the head of the "To call now" column (T5,
 * _specs/call-lists). Two orthogonal axes the rep picks independently:
 *
 *   - "Par jour" (system): a client-side VIEW over the current queue —
 *     Today / Callbacks due / New. Selecting one just filters the loaded list
 *     (no server round-trip).
 *   - "Par secteur" (sector): WHICH audience feeds the daily top-up. Selecting
 *     one POSTs /activate (the campaign regenerates from that segment) and the
 *     queue reloads. "Tout l'ICP" clears the sprint (whole ICP ranked by fit).
 *
 * No emoji — lucide icons carry the semantics (brand rule).
 */

import { useState } from "react";
import { Plus, Check, Loader2, CalendarClock, Layers, X, ArrowDownUp } from "lucide-react";
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
  const [adding, setAdding] = useState(false);
  const [phrase, setPhrase] = useState("");

  // Whole-ICP is the active "sector" when no sprint list is set.
  const activeSectorId = data.activeListId ?? "all";

  async function submit() {
    const p = phrase.trim();
    if (!p || creating) return;
    await onCreate(p);
    setPhrase("");
    setAdding(false);
  }

  return (
    <div className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">To call now</h2>
        {data.hasCampaign && (
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            title="Nouvelle liste par secteur"
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            {adding ? <X size={14} /> : <Plus size={14} />}
          </button>
        )}
      </div>

      {/* Create-from-phrase (the LLM resolves sector × persona, validated verbatim). */}
      {adding && (
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
            className="h-7 flex-1 rounded-md border border-zinc-200 bg-transparent px-2 text-[12px] text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={creating || !phrase.trim()}
            className="flex h-7 items-center gap-1 rounded-md bg-zinc-900 px-2 text-[12px] font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Créer
          </button>
        </div>
      )}

      {/* Par jour — client-side views over the current queue. */}
      <SectionLabel icon={<CalendarClock size={11} />} text="Par jour" />
      <div className="mt-1 space-y-0.5">
        {data.system.map((s) => (
          <ListRow
            key={s.id}
            checked={selectedSystemId === s.id}
            name={s.name}
            count={s.count}
            onClick={() => onSelectSystem(s.id)}
          />
        ))}
      </div>

      {/* Par secteur — which audience feeds the top-up. */}
      <SectionLabel icon={<Layers size={11} />} text="Par secteur" />
      <div className="mt-1 space-y-0.5">
        {data.sector.map((l) => (
          <ListRow
            key={l.id}
            checked={activeSectorId === l.id}
            name={l.name}
            count={l.counts.callable}
            busy={busySectorId === l.id}
            onClick={() => onActivateSector(l.id)}
          />
        ))}
        <ListRow
          checked={activeSectorId === "all"}
          name="Tout l'ICP"
          muted
          busy={busySectorId === "all"}
          onClick={onActivateAll}
        />
      </div>

      {/* Trier — applies to the current view (session-level, persisted). */}
      <SectionLabel icon={<ArrowDownUp size={11} />} text="Trier" />
      <div className="mt-1 flex flex-wrap gap-1">
        {ACTIVE_SORT_KEYS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSortChange(s.key)}
            className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
              sortKey === s.key
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="mt-3 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
      {icon}
      {text}
    </div>
  );
}

function ListRow(props: {
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
      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[12.5px] transition-colors ${
        checked
          ? "bg-[var(--color-bg-selected)] text-zinc-900 dark:text-zinc-50"
          : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900/50"
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Check
          size={13}
          className={checked ? "shrink-0 opacity-100" : "shrink-0 opacity-0"}
          style={{ color: "var(--color-accent)" }}
        />
        <span className={`truncate ${muted ? "italic text-zinc-500 dark:text-zinc-400" : ""}`}>{name}</span>
      </span>
      {busy ? (
        <Loader2 size={12} className="shrink-0 animate-spin text-zinc-400" />
      ) : typeof count === "number" ? (
        <span className="shrink-0 tabular-nums text-[11px] text-zinc-400">{count}</span>
      ) : null}
    </button>
  );
}
