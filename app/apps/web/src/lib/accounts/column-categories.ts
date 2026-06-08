/**
 * Catalog of optional, predetermined column categories for the accounts
 * table. Each category is a column the user can show or hide via the
 * "Categories" picker, and declares a *known method* for fetching its
 * data so the picker can say where it comes from (and the page can wire
 * "fetch on add" to that method).
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
  /** One-line "how we get it", shown in the picker. */
  source: string;
  /** Shown by default? Built-ins default off to keep the table lean. */
  defaultVisible: boolean;
  /** How the page fetches this category's data when added. */
  kind: "enrich" | "signal";
  /** Criterion key (kind=enrich) or signal key (kind=signal). */
  refKey: string;
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

const SIGNAL_META: Record<SignalKey, { label: string; source: string }> = {
  investor_overlap: { label: "Common investor", source: "Apollo investors vs your cap table" },
  funding_recent: { label: "Recent funding", source: "Apollo latest-funding date" },
  funding_crunchbase: { label: "Funding (Crunchbase)", source: "Crunchbase funding rounds" },
  hiring_intent: { label: "Hiring", source: "Open roles / job postings" },
  yc_company: { label: "YC", source: "Y Combinator portfolio" },
};

/** Where each firmographic extra comes from (shown in the picker). */
const EXTRA_SOURCE: Record<string, string> = {
  foundedYear: "Apollo company profile",
  technologies: "Apollo tech detection",
  funding: "Apollo / Crunchbase funding",
  keywords: "Apollo keywords",
};

/** The static, built-in addable categories. */
export const COLUMN_CATEGORIES: ColumnCategory[] = [
  ...listExtraCriteria().map<ColumnCategory>((c) => ({
    key: `extra:${c.key}`,
    label: c.label,
    group: "firmographic",
    source: EXTRA_SOURCE[c.key] ?? "Company enrichment",
    defaultVisible: false,
    kind: "enrich",
    refKey: c.key,
  })),
  ...SIGNAL_KEYS.map<ColumnCategory>((key) => ({
    key: `signal:${key}`,
    label: SIGNAL_META[key].label,
    group: "signal",
    source: SIGNAL_META[key].source,
    defaultVisible: false,
    kind: "signal",
    refKey: key,
  })),
];

export const DEFAULT_VISIBLE_CATEGORY_KEYS: string[] = COLUMN_CATEGORIES.filter(
  (c) => c.defaultVisible,
).map((c) => c.key);

const BY_KEY = new Map(COLUMN_CATEGORIES.map((c) => [c.key, c]));
export function getColumnCategory(key: string): ColumnCategory | undefined {
  return BY_KEY.get(key);
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
