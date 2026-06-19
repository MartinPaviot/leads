/**
 * Contact seniority tier — labels + ordering for the "Persona" filter.
 *
 * Values are the fixed Apollo seniority enum stored at
 * `contacts.properties.seniority` (a CLOSED provider vocabulary, not free-form
 * text), so a curated label map is the correct SSOT here — unlike industries or
 * personas, which are open-ended and resolve via LLM (see no-hardcoded-matching).
 * The filter sends the raw key (e.g. "c_suite"); the panel shows the label.
 */

/** Most senior → least senior. Drives the option ordering in the filter. */
export const SENIORITY_ORDER = [
  "owner",
  "founder",
  "c_suite",
  "partner",
  "vp",
  "head",
  "director",
  "manager",
  "senior",
  "entry",
  "intern",
] as const;

const SENIORITY_LABELS: Record<string, string> = {
  owner: "Propriétaire",
  founder: "Fondateur",
  c_suite: "Direction (C-level)",
  partner: "Associé",
  vp: "Vice-président",
  head: "Responsable (Head)",
  director: "Directeur",
  manager: "Manager",
  senior: "Senior",
  entry: "Junior",
  intern: "Stagiaire",
};

/** French label for a seniority key; unknown keys fall back to a tidy form. */
export function seniorityLabel(key: string): string {
  return SENIORITY_LABELS[key] ?? key.replace(/_/g, " ");
}

/** Comparator for seniority keys: most senior first, unknown keys last. */
export function compareSeniority(a: string, b: string): number {
  const idx = (k: string) => {
    const i = (SENIORITY_ORDER as readonly string[]).indexOf(k);
    return i < 0 ? SENIORITY_ORDER.length : i;
  };
  return idx(a) - idx(b);
}

/** The tiers a GTM rep treats as decision-makers (for an optional quick group). */
export const DECISION_MAKER_TIERS: readonly string[] = [
  "owner",
  "founder",
  "c_suite",
  "partner",
  "vp",
  "head",
  "director",
];
