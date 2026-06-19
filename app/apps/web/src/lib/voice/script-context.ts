/**
 * Script context — what the script panel actually showed the rep at dial time
 * (grounded reason? which source? was an enjeu matched / tool-grounded?), so
 * call outcomes can be segmented by script variant. This is the measurement
 * seed of the Living Script loop: no transcripts needed, just dial-time facts
 * + the existing disposition outcome.
 *
 * Pure types + math; capture happens in the script panel, persistence in
 * /api/calls/start, the consumer is the campaign stats' scriptImpact split.
 */

export interface ScriptContext {
  /** Which grounded source fed the spoken reason line (null = no reason shown). */
  reasonSource: "signal" | "hiring" | "funding" | null;
  /** An enjeu was floated as most relevant (tool-grounded or token overlap). */
  matchedEnjeu: boolean;
  /** The floated enjeu literally named the detected tool ({tool} convention). */
  viaTool: boolean;
  /** The detected replaceable tool shown, if any. */
  tool: string | null;
  /** Sector resolved by the waterfall — lets the loop learn PER sector. */
  sector?: string | null;
  /** Semantic key of the enjeu led with (ia | cout | souverainete) — the
   *  outcome is attributed to it (which enjeu books per sector). */
  enjeuKey?: string | null;
}

export interface ImpactBucket {
  calls: number;
  meetings: number;
}

export interface ScriptImpact {
  withReason: ImpactBucket;
  withoutReason: ImpactBucket;
}

/**
 * Derive the with/without-reason split from the week totals + the two
 * reason-bucket counters (the SQL counts only the "with" bucket; "without" is
 * the remainder, clamped so a counting race never yields negatives).
 */
export function segmentImpact(
  callsWeek: number,
  meetingsWeek: number,
  reasonCalls: number,
  reasonMeetings: number,
): ScriptImpact {
  const wc = Math.max(0, reasonCalls);
  const wm = Math.max(0, Math.min(reasonMeetings, wc));
  return {
    withReason: { calls: wc, meetings: wm },
    withoutReason: {
      calls: Math.max(0, callsWeek - wc),
      meetings: Math.max(0, meetingsWeek - wm),
    },
  };
}

/** Both buckets need a minimal sample before the split is worth showing. */
export const IMPACT_MIN_CALLS = 5;

export function impactDisplayable(impact: ScriptImpact): boolean {
  return impact.withReason.calls >= IMPACT_MIN_CALLS && impact.withoutReason.calls >= IMPACT_MIN_CALLS;
}
