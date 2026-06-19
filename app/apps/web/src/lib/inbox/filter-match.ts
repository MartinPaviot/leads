/**
 * Plain-English AI filters — deterministic core (INBOX-T02). Pure + unit-tested.
 *
 * A filter combines deterministic criteria (from / to / subject, AND/OR,
 * exclusions — reusing the INBOX-T01 clause matcher) with an optional AI prompt
 * (LLM classification is residual, not here) and an action (label / star /
 * archive). This evaluates the deterministic match and folds the live-preview
 * correct/wrong marks into the stored labelled examples the AI prompt reuses.
 */

import { clausesMatch, type Clause, type MatchCandidate } from "./lane-match";

export type FilterAction = "label" | "star" | "archive";

export interface DeterministicFilter {
  clauses: Clause[];
  join: "and" | "or";
  action: FilterAction;
  labelId?: string;
}

/** Does the deterministic part of a filter fire for this conversation? */
export function filterMatches(c: MatchCandidate, f: DeterministicFilter): boolean {
  return clausesMatch(c, f.clauses, f.join);
}

export interface LabeledExample {
  /** Conversation key the user judged. */
  key: string;
  /** true = the filter was right to match, false = false positive. */
  correct: boolean;
}

/**
 * Fold the preview correct/wrong marks into the stored examples (the loop that
 * refines precision). The latest mark for a key wins; examples dedupe by key.
 */
export function foldExamples(existing: LabeledExample[], marks: LabeledExample[]): LabeledExample[] {
  const byKey = new Map<string, LabeledExample>();
  for (const e of existing) byKey.set(e.key, e);
  for (const m of marks) byKey.set(m.key, { key: m.key, correct: m.correct });
  return [...byKey.values()];
}

/** A stored filter: its deterministic criteria + the label it applies. */
export interface LabelFilter extends DeterministicFilter {
  id: string;
  name: string;
  label?: string;
}

/** Deterministic labels a conversation earns from the user's label-filters. */
export function applyLabelFilters(c: MatchCandidate, filters: LabelFilter[]): string[] {
  const labels: string[] = [];
  for (const f of filters) {
    if (f.action === "label" && f.label && filterMatches(c, f) && !labels.includes(f.label)) {
      labels.push(f.label);
    }
  }
  return labels;
}
