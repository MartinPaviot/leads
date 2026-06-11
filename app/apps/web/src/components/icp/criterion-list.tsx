"use client";

/**
 * The ICP editor's control kit (Phase 1, _specs/icp-unification R4.3b).
 *
 * CriterionList is THE interaction for every multi-value criterion:
 * a visible list of removable tags, fed either by a taxonomy search
 * (options provided) or by type-and-Enter (free text). It is the
 * legacy ICP page's MultiSelectDropdown + ChipInput promoted to a
 * single primitive, used by every guided section AND every Advanced
 * row — the raw "comma, separated, values" input does not survive
 * anywhere.
 *
 * AmountField (the "1.5m"-aware numeric input) and ImportanceSelect
 * (R4.4: Nice-to-have / Important / Must-have) live here too so the
 * whole editor pulls one cohesive kit.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/badge";
import type { Importance } from "@/lib/icp/ui-state";

export function CriterionList({
  values,
  onChange,
  placeholder,
  options,
  allowFreeText,
  disabled,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  /** Taxonomy to search within; omit for free-text chips. */
  options?: readonly string[];
  /** Taxonomy mode only: Enter also accepts text that matches no
   *  option. Needed where the taxonomy is suggestions, not the
   *  universe — e.g. geographies (Apollo takes any location string;
   *  Swiss cantons / French regions are not in the list). */
  allowFreeText?: boolean;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);

  const isTaxonomy = options !== undefined;
  const filtered = isTaxonomy
    ? options.filter(
        (o) => o.toLowerCase().includes(input.toLowerCase()) && !values.includes(o),
      )
    : [];

  function add(v: string) {
    const t = v.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setInput("");
    setOpen(false);
  }

  return (
    <div className="relative">
      {values.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {values.map((item) => (
            <Tag
              key={item}
              onRemove={disabled ? undefined : () => onChange(values.filter((x) => x !== item))}
            >
              {item}
            </Tag>
          ))}
        </div>
      )}
      <Input
        value={input}
        disabled={disabled}
        onChange={(e) => {
          setInput(e.target.value);
          if (isTaxonomy) setOpen(true);
        }}
        onFocus={() => {
          if (isTaxonomy) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && input.trim()) {
            e.preventDefault();
            if (isTaxonomy) {
              // Enter picks the top taxonomy match; with allowFreeText it
              // falls back to the raw text (suggestions, not a universe).
              if (filtered.length > 0) add(filtered[0]);
              else if (allowFreeText) add(input);
            } else {
              add(input);
            }
          }
        }}
        placeholder={placeholder}
      />
      {isTaxonomy && open && input && filtered.length > 0 && (
        <div
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md py-1 shadow-lg"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          {filtered.slice(0, 20).map((item) => (
            <button
              key={item}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-[13px] transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(item)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-bg-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
      {isTaxonomy && open && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => {
            setOpen(false);
            setInput("");
          }}
        />
      )}
    </div>
  );
}

/** Parse "10k" / "1.5m" / "2b" shorthand + thousands separators → number|null. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[,$\s]/g, "");
  if (!s) return null;
  const m = s.match(/^(\d*\.?\d+)([kmb])?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : 1;
  return Math.round(n * mult);
}

export function AmountField({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setText((prev) => (parseAmount(prev) === value ? prev : value === null ? "" : String(value)));
  }, [value]);
  return (
    <Input
      value={text}
      disabled={disabled}
      inputMode="numeric"
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseAmount(e.target.value));
      }}
      placeholder={placeholder}
    />
  );
}

const IMPORTANCE_LABELS: Record<Importance, string> = {
  nice: "Nice-to-have",
  important: "Important",
  must: "Must-have",
};

/** R4.4 — the human face of weight/required. */
export function ImportanceSelect({
  value,
  onChange,
  disabled,
}: {
  value: Importance;
  onChange: (v: Importance) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Importance)}
      aria-label="Importance"
      className="shrink-0 rounded border px-1.5 py-1 text-[11px]"
      style={{
        borderColor: "var(--color-border-default)",
        background: "var(--color-bg-default)",
        color: "var(--color-text-secondary)",
      }}
    >
      {(Object.keys(IMPORTANCE_LABELS) as Importance[]).map((k) => (
        <option key={k} value={k}>
          {IMPORTANCE_LABELS[k]}
        </option>
      ))}
    </select>
  );
}

/** The honest in-place label for inputs that never affect company fit. */
export function SourcingOnlyHint({ text = "Sourcing only" }: { text?: string }) {
  return (
    <span
      className="ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
      style={{
        color: "var(--color-text-tertiary)",
        border: "1px solid var(--color-border-default)",
      }}
      title="Used when sourcing companies or contacts — it does not change company fit scores"
    >
      {text}
    </span>
  );
}
