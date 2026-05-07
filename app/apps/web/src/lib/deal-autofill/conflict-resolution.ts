/**
 * Deal property conflict resolution (MONACO-PARITY P0-5).
 *
 * The autofill cascade (`inngest/deal-signal-sync.ts`) writes deal
 * properties from multiple sources : LLM-extracted email signals,
 * meeting transcript notes, manual user edits. When two sources
 * disagree (e.g. budget $30K from meeting Oct 1, $50K from email
 * Oct 15), this module decides who wins.
 *
 * Five rules — calibrated per field per the spec :
 *  - latest_wins        : timestamp wins. Used for budget, timeline,
 *                         next_step, current_crm — facts that change.
 *  - union              : merge both. Used for stakeholders, competitors,
 *                         point_solutions — facts that accumulate.
 *  - preserve_manual    : if the user touched it, leave it alone.
 *                         Always applied first regardless of field rule.
 *  - highest_confidence : LLM confidence wins above 0.8 threshold.
 *                         Used for team_size — fact with regression
 *                         hazard (typo in transcript can degrade).
 *  - llm_synthesize     : narrative — the LLM gets both versions and
 *                         produces a single coherent text. Async only —
 *                         the sync resolver returns a placeholder
 *                         pending the LLM round-trip.
 *
 * Pure function. Tests cover every rule + every edge case. The async
 * `llm_synthesize` path is invoked from the cascade worker, not
 * here.
 */

export type ConflictRuleType =
  | "latest_wins"
  | "union"
  | "preserve_manual"
  | "highest_confidence"
  | "llm_synthesize";

export interface ConflictRule {
  type: ConflictRuleType;
}

/**
 * Field-to-rule registry. New fields → add an entry. Unknown fields
 * default to `latest_wins` which is conservative (LLM extraction is
 * usually right and recent overrides stale).
 */
export const FIELD_CONFLICT_RULES: Record<string, ConflictRule> = {
  budget: { type: "latest_wins" },
  team_size: { type: "highest_confidence" },
  current_crm: { type: "latest_wins" },
  competitors: { type: "union" },
  point_solutions: { type: "union" },
  stakeholders: { type: "union" },
  next_step: { type: "latest_wins" },
  timeline: { type: "latest_wins" },
  why_now: { type: "llm_synthesize" },
  summary: { type: "llm_synthesize" },
};

const HIGH_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Generic property entry — what `deals.properties[fieldName]` looks
 * like under the new shape (post P0-5 migration).
 */
export interface PropertyEntry<T = unknown> {
  value: T;
  /** Source attribution : "email", "meeting", "manual", "import", … */
  source: string;
  /** When the source was captured. ISO string OR Date — both accepted. */
  date: string | Date;
  /** True when a real human typed this. Non-overridable by autofill. */
  manual: boolean;
  /** LLM-reported confidence 0-1 for non-manual sources. Optional. */
  confidence?: number;
}

export interface ConflictResolution<T = unknown> {
  /** Final value after applying the rule. */
  value: T;
  /** Source attribution of the winning entry. */
  source: string;
  /** Date of the winning entry. */
  date: Date;
  /** True iff the resolver detected a real disagreement (different
   *  values, irrespective of who won). */
  conflict: boolean;
  /** True when the value carries a manual-source flag and was preserved. */
  preservedManual: boolean;
  /** Confidence of the winning entry (0-1, optional). */
  confidence?: number;
  /** Rule that fired — useful for telemetry and debugging. */
  ruleApplied: ConflictRuleType;
}

function toDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  return new Date(d);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((v, i) => v === sb[i]);
  }
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/**
 * Resolve a single field conflict.
 *
 * Always applies preserve_manual first : if the current entry has
 * `manual: true`, the incoming entry is rejected (but `conflict` is
 * reported when values differ so the UI can surface the disagreement).
 *
 * Otherwise applies the field's rule, defaulting to `latest_wins`.
 *
 * `llm_synthesize` is not synchronously resolved here — the worker
 * caller detects this rule type and queues an async LLM round-trip.
 * For the sync return, we keep the current entry and mark
 * `conflict: true` to drive the queue.
 */
export function resolveConflict<T = unknown>(
  fieldName: string,
  current: PropertyEntry<T>,
  incoming: PropertyEntry<T>,
): ConflictResolution<T> {
  const rule = FIELD_CONFLICT_RULES[fieldName] ?? { type: "latest_wins" };
  const sameValue = valuesEqual(current.value, incoming.value);
  const conflict = !sameValue;

  // Always preserve manual.
  if (current.manual) {
    return {
      value: current.value,
      source: current.source,
      date: toDate(current.date),
      conflict,
      preservedManual: true,
      confidence: current.confidence,
      ruleApplied: "preserve_manual",
    };
  }

  switch (rule.type) {
    case "latest_wins": {
      const winner =
        toDate(incoming.date).getTime() > toDate(current.date).getTime()
          ? incoming
          : current;
      return {
        value: winner.value,
        source: winner.source,
        date: toDate(winner.date),
        conflict,
        preservedManual: false,
        confidence: winner.confidence,
        ruleApplied: "latest_wins",
      };
    }

    case "union": {
      // Both sides must be arrays for `union` to make sense ; if not,
      // fall back to latest_wins so we don't return a malformed shape.
      const ca = current.value as unknown;
      const ia = incoming.value as unknown;
      if (!Array.isArray(ca) || !Array.isArray(ia)) {
        const winner =
          toDate(incoming.date).getTime() > toDate(current.date).getTime()
            ? incoming
            : current;
        return {
          value: winner.value,
          source: winner.source,
          date: toDate(winner.date),
          conflict,
          preservedManual: false,
          confidence: winner.confidence,
          ruleApplied: "latest_wins",
        };
      }
      // Stable de-dup. Strings + primitives use Set ; objects fall
      // back to JSON-based de-dup (rarely needed).
      const merged = uniqueMerge(ca, ia) as unknown as T;
      // Pick the latest source/date as attribution for the union.
      const latest =
        toDate(incoming.date).getTime() > toDate(current.date).getTime()
          ? incoming
          : current;
      return {
        value: merged,
        source: latest.source,
        date: toDate(latest.date),
        conflict: !sameValue,
        preservedManual: false,
        confidence: latest.confidence,
        ruleApplied: "union",
      };
    }

    case "highest_confidence": {
      const incomingConf = incoming.confidence ?? 0;
      const currentConf = current.confidence ?? 0;
      // If incoming clears the threshold AND beats current, it wins.
      // Otherwise current sticks. Prevents low-confidence regressions.
      const incomingWins =
        incomingConf >= HIGH_CONFIDENCE_THRESHOLD && incomingConf > currentConf;
      const winner = incomingWins ? incoming : current;
      return {
        value: winner.value,
        source: winner.source,
        date: toDate(winner.date),
        conflict,
        preservedManual: false,
        confidence: winner.confidence,
        ruleApplied: "highest_confidence",
      };
    }

    case "llm_synthesize": {
      // Sync resolver can't synthesize — caller (cascade worker)
      // detects this rule type and enqueues a follow-up LLM call.
      // We return the current entry as a placeholder so writes never
      // block on the LLM.
      return {
        value: current.value,
        source: current.source,
        date: toDate(current.date),
        conflict,
        preservedManual: false,
        confidence: current.confidence,
        ruleApplied: "llm_synthesize",
      };
    }

    case "preserve_manual": {
      // Reaching this case means current.manual was false. Treat as
      // latest_wins fallback — preserve_manual semantics already
      // applied at the top of the function.
      const winner =
        toDate(incoming.date).getTime() > toDate(current.date).getTime()
          ? incoming
          : current;
      return {
        value: winner.value,
        source: winner.source,
        date: toDate(winner.date),
        conflict,
        preservedManual: false,
        confidence: winner.confidence,
        ruleApplied: "latest_wins",
      };
    }
  }
}

/**
 * Stable de-dup for `union` rule. Primitive values dedupe via Set ;
 * objects compare on JSON. Order : current entries first, then new
 * incoming entries — keeps the prior order so the UI doesn't
 * shuffle.
 */
function uniqueMerge<T>(a: T[], b: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...a, ...b]) {
    const key =
      typeof item === "object" && item !== null
        ? JSON.stringify(item)
        : String(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/**
 * True when the field's rule requires the async LLM-synthesise path.
 * The worker uses this to decide whether to enqueue a follow-up.
 */
export function requiresLlmSynthesis(fieldName: string): boolean {
  const rule = FIELD_CONFLICT_RULES[fieldName];
  return rule?.type === "llm_synthesize";
}
