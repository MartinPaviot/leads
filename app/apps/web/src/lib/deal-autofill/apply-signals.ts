/**
 * Pure cascade — translate extracted signals into deal property writes.
 *
 * Lives between `inngest/deal-signal-sync.ts` (DB IO) and the
 * conflict-resolution / property-accessor primitives. Pure : no DB,
 * no logger, no clock — clock arrives via `eventDate` parameter.
 *
 * The worker calls this with current `deals.properties` and the
 * signals payload from `enrichment/signals-extracted` ; gets back the
 * new properties, the per-field outcomes for telemetry, and the list
 * of fields that need an async LLM synthesis follow-up.
 *
 * Tests cover this exhaustively — every rule × every field × every
 * conflict shape — without touching Postgres.
 */

import {
  resolveConflict,
  requiresLlmSynthesis,
  type ConflictResolution,
  type ConflictRuleType,
  type PropertyEntry,
} from "./conflict-resolution";
import {
  appendToPropertyHistory,
  isPropertyEntry,
  setDealProperty,
} from "./property-accessor";

export interface SignalsPayload {
  objections?: string[];
  next_steps?: string[];
  champion_signals?: string[];
  budget_mentions?: string[];
  competitor_mentions?: string[];
  timeline_mentions?: string[];
  team_size_mentions?: Array<{ value: string; confidence?: number }>;
  current_crm_mentions?: string[];
  point_solutions?: string[];
  stakeholders?: string[];
  sentiment?: string;
  why_now?: string;
  summary?: string;
}

export interface FieldUpdate {
  fieldName: string;
  ruleApplied: ConflictRuleType;
  conflict: boolean;
  preservedManual: boolean;
  source: string;
  confidence?: number;
  /** True when this field's new value differs from what was on disk
   *  (matters for "did we actually need to write" metrics). */
  changed: boolean;
}

export interface ApplySignalsResult {
  /** New properties object — write this back to the deal row. */
  properties: Record<string, unknown>;
  /** Per-field outcomes — emit one metric per entry. */
  fieldUpdates: FieldUpdate[];
  /** Fields that need an async LLM synthesise follow-up. The worker
   *  enqueues `deal/property-llm-synthesize` for each. */
  pendingLlmFields: string[];
  /** True when at least one field changed — caller can skip the DB
   *  update entirely otherwise. */
  hasChanges: boolean;
}

/**
 * Map a signals key → (canonical field name, type-specific value
 * adapter). Keeping this as a registry makes it trivial to add a new
 * extracted signal : add the key here and a rule in
 * FIELD_CONFLICT_RULES — no other code change needed.
 */
interface FieldMapping {
  field: string;
  /** Pull the value out of the payload + give it the right shape for
   *  the conflict rule (string for latest_wins, array for union). */
  read: (payload: SignalsPayload) => { value: unknown; confidence?: number } | null;
}

const FIELD_MAPPINGS: FieldMapping[] = [
  {
    field: "budget",
    read: (p) => {
      const arr = p.budget_mentions;
      if (!arr?.length) return null;
      // Most-recent mention wins for the canonical value ; the
      // resolver then arbitrates against any prior entry on disk.
      return { value: arr[arr.length - 1] };
    },
  },
  {
    field: "team_size",
    read: (p) => {
      const arr = p.team_size_mentions;
      if (!arr?.length) return null;
      // Highest-confidence mention from this batch wins — multiple
      // numbers in one transcript usually means a noisy LLM.
      const best = [...arr].sort(
        (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0),
      )[0];
      return { value: best.value, confidence: best.confidence };
    },
  },
  {
    field: "current_crm",
    read: (p) => {
      const arr = p.current_crm_mentions;
      if (!arr?.length) return null;
      return { value: arr[arr.length - 1] };
    },
  },
  {
    field: "competitors",
    read: (p) => {
      const arr = p.competitor_mentions;
      if (!arr?.length) return null;
      return { value: arr };
    },
  },
  {
    field: "point_solutions",
    read: (p) => {
      const arr = p.point_solutions;
      if (!arr?.length) return null;
      return { value: arr };
    },
  },
  {
    field: "stakeholders",
    read: (p) => {
      const arr = p.stakeholders;
      if (!arr?.length) return null;
      return { value: arr };
    },
  },
  {
    field: "next_step",
    read: (p) => {
      const arr = p.next_steps;
      if (!arr?.length) return null;
      return { value: arr[arr.length - 1] };
    },
  },
  {
    field: "timeline",
    read: (p) => {
      const arr = p.timeline_mentions;
      if (!arr?.length) return null;
      return { value: arr[arr.length - 1] };
    },
  },
  {
    field: "why_now",
    read: (p) => (p.why_now ? { value: p.why_now } : null),
  },
  {
    field: "summary",
    read: (p) => (p.summary ? { value: p.summary } : null),
  },
];

/** Fields kept additive (not in FIELD_CONFLICT_RULES — handled here as
 *  per-write append-with-dedup, since they capture every mention). */
const ACCUMULATE_FIELDS: Array<{ field: string; key: keyof SignalsPayload }> = [
  { field: "objections", key: "objections" },
  { field: "championSignals", key: "champion_signals" },
];

export interface ApplySignalsArgs {
  /** Current `deals.properties` jsonb — may be null, may be in either
   *  legacy or new shape. */
  currentProperties: Record<string, unknown> | null | undefined;
  /** Extracted payload from `enrichment/signals-extracted`. */
  signals: SignalsPayload;
  /** When the activity happened — used as the `date` of the new
   *  PropertyEntry. Caller passes activity.occurredAt or now(). */
  eventDate: Date;
  /** Source attribution for the new entries — typically "email" or
   *  "transcript". Surfaced in the deal page tooltip. */
  source: string;
}

export function applySignalsToProperties({
  currentProperties,
  signals,
  eventDate,
  source,
}: ApplySignalsArgs): ApplySignalsResult {
  let props: Record<string, unknown> = currentProperties
    ? { ...currentProperties }
    : {};
  const fieldUpdates: FieldUpdate[] = [];
  const pendingLlmFields: string[] = [];
  let hasChanges = false;

  // Rule-resolved fields.
  for (const mapping of FIELD_MAPPINGS) {
    const extracted = mapping.read(signals);
    if (!extracted) continue;

    const incoming: PropertyEntry = {
      value: extracted.value,
      source,
      date: eventDate.toISOString(),
      manual: false,
      ...(extracted.confidence !== undefined
        ? { confidence: extracted.confidence }
        : {}),
    };

    // Only treat real PropertyEntry shapes as `current`. Legacy
    // primitives (pre-P0-5 cascade writes that bypassed source
    // attribution) are MIGRATED on next contact — the new signal
    // wins and the field flips to the new shape. This matches the
    // pre-P0-5 worker semantics where auto-extracted budget would
    // be overwritten on every fresh extraction unless an explicit
    // `${field}ManuallySet` flag was set ; we now preserve manual
    // entries via `manual: true` on the PropertyEntry instead.
    const rawCurrent = props[mapping.field];
    const current: PropertyEntry | null = isPropertyEntry(rawCurrent)
      ? (rawCurrent as PropertyEntry)
      : null;

    let resolution: ConflictResolution;
    if (!current) {
      // First write OR legacy migration — no conflict possible.
      resolution = {
        value: incoming.value,
        source: incoming.source,
        date: eventDate,
        conflict: false,
        preservedManual: false,
        confidence: incoming.confidence,
        ruleApplied: "latest_wins",
      };
    } else {
      resolution = resolveConflict(mapping.field, current, incoming);
    }

    // Decide whether to write. We always emit the field update for
    // telemetry, but only mutate `props` if the resolution actually
    // changes the value or the source attribution.
    const valueChanged = !valueEquivalent(
      current?.value,
      resolution.value,
    );
    const attributionChanged =
      !valueChanged &&
      current !== null &&
      (current.source !== resolution.source ||
        current.confidence !== resolution.confidence);

    if (valueChanged) {
      // Append the prior entry to history before overwriting.
      if (current) {
        props = appendToPropertyHistory(props, mapping.field, current);
      }
      props = setDealProperty(props, mapping.field, {
        value: resolution.value,
        source: resolution.source,
        date: resolution.date,
        manual: false,
        confidence: resolution.confidence,
      });
      hasChanges = true;
    } else if (attributionChanged) {
      // Same value, but newer source / better confidence — refresh
      // the entry without touching history (avoids audit-log spam).
      props = setDealProperty(props, mapping.field, {
        value: resolution.value,
        source: resolution.source,
        date: resolution.date,
        manual: false,
        confidence: resolution.confidence,
      });
      hasChanges = true;
    }

    fieldUpdates.push({
      fieldName: mapping.field,
      ruleApplied: resolution.ruleApplied,
      conflict: resolution.conflict,
      preservedManual: resolution.preservedManual,
      source: resolution.source,
      confidence: resolution.confidence,
      changed: valueChanged || attributionChanged,
    });

    // llm_synthesize : flag for async follow-up. Triggered only when
    // there was a real conflict — otherwise nothing to synthesise.
    if (
      requiresLlmSynthesis(mapping.field) &&
      resolution.conflict &&
      !resolution.preservedManual
    ) {
      pendingLlmFields.push(mapping.field);
    }
  }

  // Accumulate fields — pure dedup-append, no conflict resolution.
  // Stored in legacy shape (string[]) since they don't have source
  // attribution semantics individually — the field-level metadata
  // is the lastSignalUpdate timestamp, not a per-entry source.
  for (const acc of ACCUMULATE_FIELDS) {
    const incoming = signals[acc.key] as string[] | undefined;
    if (!incoming?.length) continue;
    const existingRaw = props[acc.field];
    const existing: string[] = Array.isArray(existingRaw)
      ? (existingRaw as string[])
      : [];
    const before = existing.length;
    for (const v of incoming) {
      if (!existing.includes(v)) existing.push(v);
    }
    if (existing.length !== before) {
      props[acc.field] = existing;
      hasChanges = true;
      fieldUpdates.push({
        fieldName: acc.field,
        ruleApplied: "union",
        conflict: false,
        preservedManual: false,
        source,
        changed: true,
      });
    }
  }

  if (hasChanges) {
    props.lastSignalUpdate = eventDate.toISOString();
  }

  return { properties: props, fieldUpdates, pendingLlmFields, hasChanges };
}

function valueEquivalent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
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
