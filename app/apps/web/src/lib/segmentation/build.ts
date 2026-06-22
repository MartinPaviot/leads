/**
 * Segment construction + signal admission (spec 13, AC1/AC2/AC5). Pure. A
 * segment is an ICP version + one archetype (volume|micro|signal) + a stored
 * definition AST. micro requires a narrowing dimension; signal binds to a live
 * signal source and admits only accounts currently carrying it.
 */

export type Archetype = "volume" | "micro" | "signal";

export interface NarrowingDim {
  fieldKey: string;
  operator: string;
  value: unknown;
}

export interface SegmentDefinition {
  icpVersionId: string;
  archetype: Archetype;
  /** volume — coarse partition dimensions. */
  partitionBy?: string[];
  /** micro — at least one narrowing dimension beyond the base ICP. */
  narrowing?: NarrowingDim[];
  /** signal — the bound live-signal key. */
  signalKey?: string;
}

export interface Segment {
  archetype: Archetype;
  definition: SegmentDefinition;
  signalBinding: string | null;
  goal?: string;
  channelMix?: Record<string, number>;
  dailySendBudget?: number;
  estimatedTam?: number;
}

export interface BuildParams {
  partitionBy?: string[];
  narrowing?: NarrowingDim[];
  signalKey?: string;
  goal?: string;
  channelMix?: Record<string, number>;
  dailySendBudget?: number;
}

export class SegmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SegmentError";
  }
}

const ARCHETYPES: readonly Archetype[] = ["volume", "micro", "signal"];

export function buildSegment(icpVersionId: string, archetype: Archetype, params: BuildParams = {}): Segment {
  if (!ARCHETYPES.includes(archetype)) throw new SegmentError(`unknown archetype: ${archetype}`);
  // AC2 — micro requires a narrowing dimension beyond the base ICP.
  if (archetype === "micro" && (!params.narrowing || params.narrowing.length === 0)) {
    throw new SegmentError("micro archetype requires at least one narrowing dimension beyond the base ICP");
  }
  // AC2 — signal binds to a live signal source.
  if (archetype === "signal" && !params.signalKey) {
    throw new SegmentError("signal archetype requires a signal binding");
  }
  const definition: SegmentDefinition = {
    icpVersionId,
    archetype,
    partitionBy: params.partitionBy,
    narrowing: params.narrowing,
    signalKey: params.signalKey,
  };
  return {
    archetype,
    definition,
    signalBinding: archetype === "signal" ? params.signalKey ?? null : null,
    goal: params.goal,
    channelMix: params.channelMix,
    dailySendBudget: params.dailySendBudget,
  };
}

/** An account's currently-carried live signals. */
export interface AccountSignals {
  accountId: string;
  signals: string[];
}

/**
 * Whether a segment admits an account NOW (AC2/AC5). Volume/micro admit by the
 * ICP filter at sourcing time; a signal segment admits only accounts currently
 * carrying the bound signal, so losing the signal stops NEW admissions (already-
 * sent activity is untouched — admission only gates entry).
 */
export function admitsAccount(segment: Segment, account: AccountSignals): boolean {
  if (segment.archetype !== "signal") return true;
  return !!segment.signalBinding && account.signals.includes(segment.signalBinding);
}
