/**
 * Sequence trigger configuration helpers (P0-2 follow-up).
 *
 * The signal-to-sequence worker (`inngest/signal-to-sequence.ts`)
 * picks an "active" sequence to enroll contacts into when a signal
 * fires. Today it picks the most-recent active sequence regardless
 * of signal type ; that fans out every signal to every sequence,
 * which is over-broad once a tenant runs more than one campaign.
 *
 * This module adds a per-sequence whitelist :
 *   `sequences.campaignConfig.triggerSignalTypes : string[]`
 *
 * When the array is unset / empty, the sequence matches ALL signals
 * (backwards-compat with existing tenants who never configured
 * triggers). When the array has entries, only signals whose type
 * appears in the list trigger this sequence.
 *
 * Pure : no DB / no clock. The worker reads `campaignConfig` and
 * passes it through these helpers ; tests pin every branch.
 */

/**
 * Canonical set of signal types the auto-enroll worker can consume.
 * Adding a new type here unlocks it for the trigger UI ; the worker
 * doesn't have to change.
 */
export const KNOWN_SIGNAL_TYPES = [
  "website_visit",
  "post_funding",
  "hiring_signal",
  "product_launch",
  "leadership_change",
  "tech_stack_change",
  "exec_engagement",
  "review_left",
  "competitor_mention",
] as const;

export type KnownSignalType = (typeof KNOWN_SIGNAL_TYPES)[number];

const KNOWN_SIGNAL_SET: ReadonlySet<string> = new Set(KNOWN_SIGNAL_TYPES);

export interface SequenceTriggerConfig {
  /** Signal types that trigger this sequence. Empty / null = match
   *  all (backwards-compat). */
  triggerSignalTypes: KnownSignalType[];
}

/**
 * Read the trigger config off a sequence's campaignConfig jsonb.
 * Returns the canonical shape with a clean array, dropping any
 * unknown signal types defensively (a typo'd type shouldn't
 * silently match nothing — surface only the validated subset).
 */
export function readTriggerConfig(
  campaignConfig: Record<string, unknown> | null | undefined,
): SequenceTriggerConfig {
  if (!campaignConfig || typeof campaignConfig !== "object") {
    return { triggerSignalTypes: [] };
  }
  const raw = (campaignConfig as Record<string, unknown>).triggerSignalTypes;
  if (!Array.isArray(raw)) {
    return { triggerSignalTypes: [] };
  }
  const filtered = raw
    .filter((v): v is string => typeof v === "string")
    .filter((v): v is KnownSignalType => KNOWN_SIGNAL_SET.has(v));
  // Dedupe while preserving order.
  const seen = new Set<string>();
  const unique: KnownSignalType[] = [];
  for (const v of filtered) {
    if (!seen.has(v)) {
      seen.add(v);
      unique.push(v);
    }
  }
  return { triggerSignalTypes: unique };
}

/**
 * Decide whether a signal of the given type should trigger this
 * sequence. Empty / null trigger config matches everything
 * (backwards-compat) ; a configured array matches only its members.
 *
 * `signalType` may be null when the upstream signal has no type
 * tag — in that case we err on the side of NOT triggering when a
 * filter is configured (caller explicitly opted into selectivity).
 */
export function matchesTrigger(
  campaignConfig: Record<string, unknown> | null | undefined,
  signalType: string | null | undefined,
): boolean {
  const config = readTriggerConfig(campaignConfig);
  if (config.triggerSignalTypes.length === 0) {
    return true; // legacy default
  }
  if (!signalType || typeof signalType !== "string") {
    return false; // configured but no type → don't trigger
  }
  return config.triggerSignalTypes.includes(
    signalType as KnownSignalType,
  );
}

/**
 * Persist-ready writer : merges the trigger array into the existing
 * campaignConfig jsonb without trampling other keys other surfaces
 * may have written there. Drops unknown types defensively.
 */
export function writeTriggerConfig(
  campaignConfig: Record<string, unknown> | null | undefined,
  triggerSignalTypes: ReadonlyArray<string>,
): Record<string, unknown> {
  const base =
    campaignConfig && typeof campaignConfig === "object"
      ? { ...campaignConfig }
      : {};
  const validated = triggerSignalTypes
    .filter((v): v is KnownSignalType => KNOWN_SIGNAL_SET.has(v));
  const seen = new Set<string>();
  const unique: KnownSignalType[] = [];
  for (const v of validated) {
    if (!seen.has(v)) {
      seen.add(v);
      unique.push(v);
    }
  }
  base.triggerSignalTypes = unique;
  return base;
}

/**
 * Filter a candidate sequence list to those whose triggers match
 * the incoming signal type. Used by the worker's "find sequence"
 * step. Pure ; takes the sequences as plain rows.
 */
export interface SequenceCandidate {
  id: string;
  name: string;
  campaignConfig: Record<string, unknown> | null;
}

export function pickSequenceForSignal(
  candidates: ReadonlyArray<SequenceCandidate>,
  signalType: string | null | undefined,
): SequenceCandidate | null {
  for (const c of candidates) {
    if (matchesTrigger(c.campaignConfig, signalType)) {
      return c;
    }
  }
  return null;
}
