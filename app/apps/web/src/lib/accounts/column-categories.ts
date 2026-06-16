/**
 * Catalog of optional, predetermined column categories for the accounts
 * table. Each category is a column the user can show or hide via the
 * "Categories" picker, and declares how its data is fetched so the page
 * can wire "fetch on add" to that method. The picker shows a short,
 * vendor-neutral description of what the column holds — never the
 * upstream provider name (see feedback_no-provider-names-ui).
 *
 * This unifies the two halves of the table's optionality:
 *   - firmographic extras  -> filled by the enrichment waterfall (criteria)
 *   - signals              -> filled by the signal detectors (/api/signals)
 *
 * Custom signals and custom fields are tenant-defined (dynamic) and are
 * merged in at runtime by the page; this file holds only the static,
 * built-in catalog. It is import-safe for client components: it pulls in
 * type-only `SignalKey` and the pure criteria registry, never the signal
 * detectors (which carry server-only deps).
 */

import { listExtraCriteria } from "@/lib/providers/company-enrichment/criteria";
import type { SignalKey } from "@/lib/tam-stream/events";

export type CategoryGroup = "firmographic" | "signal";

export interface ColumnCategory {
  /** Stable id used for visibility state, e.g. "extra:funding", "signal:yc_company". */
  key: string;
  label: string;
  group: CategoryGroup;
  /** One-line, vendor-neutral description of what the column holds, shown
   * under the label in the picker. Never names the provider. */
  source: string;
  /** Shown by default? Built-ins default off to keep the table lean. */
  defaultVisible: boolean;
  /** How the page fetches this category's data when added. */
  kind: "enrich" | "signal";
  /** Criterion key (kind=enrich) or signal key (kind=signal). */
  refKey: string;
  /** Whether the data source behind this category is wired up. `false`
   * means the column is catalogued but its provider isn't connected yet
   * (e.g. Crunchbase) — the picker greys it out and the page refuses to
   * add it as a column. Defaults to true. */
  available: boolean;
}

/** Fixed signal set (keys mirror DEFAULT_SIGNALS without importing the
 * server-only detectors). Order = display order. */
const SIGNAL_KEYS: readonly SignalKey[] = [
  "investor_overlap",
  "funding_recent",
  "funding_crunchbase",
  "hiring_intent",
  "yc_company",
];

const SIGNAL_META: Record<
  SignalKey,
  { label: string; source: string; available?: boolean }
> = {
  investor_overlap: { label: "Common investor", source: "Shares an investor with your company" },
  funding_recent: { label: "Recent funding", source: "Raised funding in the last 180 days" },
  // Crunchbase isn't connected yet — keep the row so users can see the
  // capability, but grey it out (available: false). The detector already
  // no-ops without CRUNCHBASE_API_KEY, so the column would never light up.
  funding_crunchbase: { label: "Funding (Crunchbase)", source: "Not available yet", available: false },
  hiring_intent: { label: "Hiring", source: "Open roles / active job postings" },
  yc_company: { label: "YC", source: "Backed by Y Combinator" },
};

/** The static, built-in addable categories. */
export const COLUMN_CATEGORIES: ColumnCategory[] = [
  ...listExtraCriteria().map<ColumnCategory>((c) => ({
    key: `extra:${c.key}`,
    label: c.label,
    group: "firmographic",
    // The criterion's own hint is the vendor-neutral description of what
    // the column holds ("Year the company was founded", "Detected
    // technologies in use", …) — one source of truth, no provider name.
    source: c.hint,
    defaultVisible: false,
    kind: "enrich",
    refKey: c.key,
    available: true,
  })),
  ...SIGNAL_KEYS.map<ColumnCategory>((key) => ({
    key: `signal:${key}`,
    label: SIGNAL_META[key].label,
    group: "signal",
    source: SIGNAL_META[key].source,
    defaultVisible: false,
    kind: "signal",
    refKey: key,
    available: SIGNAL_META[key].available ?? true,
  })),
];

export const DEFAULT_VISIBLE_CATEGORY_KEYS: string[] = COLUMN_CATEGORIES.filter(
  (c) => c.defaultVisible,
).map((c) => c.key);

const BY_KEY = new Map(COLUMN_CATEGORIES.map((c) => [c.key, c]));
export function getColumnCategory(key: string): ColumnCategory | undefined {
  return BY_KEY.get(key);
}

/** Built-in category keys whose data source isn't connected yet. The
 * picker greys these out and the page refuses to add them as columns, so
 * a stale localStorage entry can never resurrect an empty column. */
export const UNAVAILABLE_CATEGORY_KEYS: ReadonlySet<string> = new Set(
  COLUMN_CATEGORIES.filter((c) => !c.available).map((c) => c.key),
);

/** True unless the category is catalogued-but-not-connected. Unknown
 * (dynamic) keys are available — they only exist because their column is
 * already on the page. */
export function isCategoryAvailable(key: string): boolean {
  return !UNAVAILABLE_CATEGORY_KEYS.has(key);
}

/** The enrichment criterion keys behind any visible firmographic-extra
 * categories — used to "fetch on add" via the enrichment stream. */
export function enrichCriteriaForCategories(keys: Iterable<string>): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const c = BY_KEY.get(k);
    if (c?.kind === "enrich") out.push(c.refKey);
  }
  return out;
}

// ── Picker model: built-ins + always-on dynamic columns ──────────────
//
// The accounts table also renders three *always-on* column families that
// aren't built-ins: user-defined custom signals, data-derived signal-type
// columns, and custom fields. They were absent from the Categories picker,
// so a column already on the page couldn't be unchecked. These helpers
// fold them into the picker: built-ins stay opt-IN (shown only when added),
// the dynamic columns are opt-OUT (shown unless explicitly hidden), and the
// picker checkbox reflects the column's true on-screen state either way.

/** Stable, collision-free picker keys for the opt-out dynamic columns
 * (distinct from the built-in `signal:`/`extra:` namespaces). */
export const customSignalKey = (id: string) => `custom-signal:${id}`;
export const signalTypeKey = (type: string) => `signal-type:${type}`;
export const customFieldKey = (id: string) => `custom-field:${id}`;

/** A built-in category is opt-in; anything else is an always-on dynamic
 * column toggled via the hidden set. */
export function isDynamicCategoryKey(key: string): boolean {
  return !BY_KEY.has(key);
}

export type PickerGroup = CategoryGroup | "custom";

/** Shape the ColumnPicker consumes (structurally `PickerCategory`). */
export interface PickerCategoryShape {
  key: string;
  label: string;
  group: PickerGroup;
  source: string;
  /** False = catalogued but not connected yet (greyed-out, unselectable).
   * Omitted/true for live built-ins and all dynamic columns. */
  available?: boolean;
}

export interface DynamicCategoryColumns {
  customSignals: ReadonlyArray<{ id: string; name: string }>;
  signalTypes: ReadonlyArray<string>;
  customFields: ReadonlyArray<{ id: string; name: string }>;
}

/**
 * Build the full picker list (built-ins + dynamic columns) and the unified
 * "visible" set the checkboxes read from.
 *  - built-ins: visible iff their key is in `visible` (opt-in)
 *  - dynamic columns: visible unless their key is in `hidden` (opt-out)
 * So every column actually on the page renders checked, and unchecking one
 * either removes it from `visible` (built-in) or adds it to `hidden`.
 */
export function buildPickerModel(input: {
  visible: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
  dynamic: DynamicCategoryColumns;
}): { categories: PickerCategoryShape[]; visible: Set<string> } {
  const { visible, hidden, dynamic } = input;
  const categories: PickerCategoryShape[] = [
    ...COLUMN_CATEGORIES.map((c) => ({ key: c.key, label: c.label, group: c.group, source: c.source, available: c.available })),
    ...dynamic.customSignals.map((c) => ({ key: customSignalKey(c.id), label: c.name, group: "signal" as const, source: "Custom signal" })),
    ...dynamic.signalTypes.map((t) => ({ key: signalTypeKey(t), label: t.replace(/_/g, " "), group: "signal" as const, source: "Detected signal" })),
    ...dynamic.customFields.map((f) => ({ key: customFieldKey(f.id), label: f.name, group: "custom" as const, source: "Custom field" })),
  ];
  const visibleNow = new Set<string>(visible);
  for (const c of dynamic.customSignals) { const k = customSignalKey(c.id); if (!hidden.has(k)) visibleNow.add(k); }
  for (const t of dynamic.signalTypes) { const k = signalTypeKey(t); if (!hidden.has(k)) visibleNow.add(k); }
  for (const f of dynamic.customFields) { const k = customFieldKey(f.id); if (!hidden.has(k)) visibleNow.add(k); }
  return { categories, visible: visibleNow };
}
