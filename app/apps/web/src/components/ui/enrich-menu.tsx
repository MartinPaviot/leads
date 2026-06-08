"use client";

import { useEffect, useRef, useState } from "react";
import { Zap, ChevronDown, Check, Loader2 } from "lucide-react";
import {
  listBaseCriteria,
  listExtraCriteria,
  BASE_CRITERIA_KEYS,
} from "@/lib/providers/company-enrichment/criteria";

/**
 * Split-button criteria picker for the "Enrich" action.
 *
 * Primary click enriches the *base* criteria (the firmographics shown
 * as the accounts table's left columns) — one click, no decisions. The
 * caret opens a menu where the base set can be tuned and à-la-carte
 * extras (funding, tech, founded year…) added. "Personnalisable mais
 * très simple": strong default, optional refinement.
 */
export function EnrichMenu({
  targetCount,
  running = false,
  processed = 0,
  total = 0,
  onEnrich,
  disabled = false,
}: {
  /** How many accounts this run will touch (selection, or unenriched). */
  targetCount: number;
  running?: boolean;
  processed?: number;
  total?: number;
  onEnrich: (criteriaKeys: string[]) => void;
  disabled?: boolean;
}) {
  const base = listBaseCriteria();
  const extras = listExtraCriteria();
  const [open, setOpen] = useState(false);
  // Selected criterion keys. Default = the base set (all left columns).
  const [selected, setSelected] = useState<Set<string>>(() => new Set(BASE_CRITERIA_KEYS));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const runBase = () => onEnrich([...BASE_CRITERIA_KEYS]);
  const runSelected = () => {
    if (selected.size === 0) return;
    setOpen(false);
    onEnrich([...selected]);
  };

  const primaryLabel = running
    ? `Enriching ${processed}/${total || targetCount}…`
    : targetCount > 0
      ? `Enrich (${targetCount})`
      : "Enrich";

  const baseDisabled = disabled || running || targetCount === 0;

  return (
    <div ref={ref} className="relative inline-flex">
      {/* Split button: primary (base run) + caret (menu) */}
      <div className="inline-flex items-stretch overflow-hidden rounded-md border" style={{ borderColor: "var(--color-border-default)" }}>
        <button
          type="button"
          onClick={runBase}
          disabled={baseDisabled}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: "var(--color-text-secondary)" }}
          title="Enrich the base firmographics (Industry, Geography, Size, Revenue, LinkedIn)"
        >
          {running ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled || running}
          aria-label="Choose enrichment criteria"
          aria-expanded={open}
          className="inline-flex items-center border-l px-1.5 transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-tertiary)" }}
        >
          <ChevronDown size={13} />
        </button>
      </div>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg p-1.5"
          style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-moderate)", boxShadow: "var(--shadow-floating)" }}
        >
          <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
            Base criteria
          </p>
          {base.map((c) => (
            <CriterionRow key={c.key} label={c.label} hint={c.hint} checked={selected.has(c.key)} onToggle={() => toggle(c.key)} />
          ))}

          <div className="my-1 border-t" style={{ borderColor: "var(--color-border-default)" }} />
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
            Add criteria
          </p>
          {extras.map((c) => (
            <CriterionRow key={c.key} label={c.label} hint={c.hint} checked={selected.has(c.key)} onToggle={() => toggle(c.key)} />
          ))}

          <div className="mt-1 border-t pt-1.5" style={{ borderColor: "var(--color-border-default)" }}>
            <button
              type="button"
              onClick={runSelected}
              disabled={selected.size === 0 || targetCount === 0}
              className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--color-accent)" }}
            >
              <Zap size={13} />
              {targetCount > 0 ? `Enrich ${targetCount} · ${selected.size} criteria` : "Select accounts first"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CriterionRow({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
      title={hint}
    >
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border"
        style={{
          background: checked ? "var(--color-accent)" : "transparent",
          borderColor: checked ? "var(--color-accent)" : "var(--color-border-moderate)",
        }}
      >
        {checked && <Check size={10} className="text-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>{label}</span>
        <span className="block truncate text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>{hint}</span>
      </span>
    </button>
  );
}
