/**
 * Per-prospect "reason to call" — Bloc 2 of the locked methodology (the
 * contextual bridge the rep says RIGHT AFTER the permission gate, see
 * _research/cold-call-exchange-top01-2026-06.md). The opener template stays a
 * pure permission gate (no listed problems); this module derives the ONE
 * grounded reason-to-call from what we actually hold on the prospect — the
 * live signal first, then the cached research dossier.
 *
 * Grounded-only by design: when nothing real is known we return null rather
 * than invent a reason. On a cold call, an ungrounded reason the rep then
 * repeats is worse than silence — the same principle the pre-call brief
 * already applies to facts. Stating a real reason to call is worth ~x2.1 on
 * the meeting rate (Gong), so this is the highest-leverage thing to surface,
 * but only when it traces to a source the rep can stand behind.
 *
 * Pure + unit-tested; no I/O, no React.
 */

export type OpeningReasonSource = "signal" | "research" | "hiring" | "funding";

export interface OpeningReason {
  /** The grounded fact to lead with, in plain words. */
  fact: string;
  /** Where it came from — drives the provenance chip so the rep trusts it. */
  source: OpeningReasonSource;
  /** Human label for the source. */
  sourceLabel: string;
}

export interface OpeningReasonInput {
  /** Live trigger event on the prospect (the strongest "why now"). */
  signalLabel?: string | null;
  /** Research dossier's messaging angle (recommendedApproach). */
  messagingAngle?: string | null;
  /** Top hiring signal role from the dossier. */
  hiringRole?: string | null;
  /** Last funding round from the dossier. */
  fundingLastRound?: string | null;
}

const SOURCE_LABEL: Record<OpeningReasonSource, string> = {
  signal: "Signal temps réel",
  research: "Recherche société",
  hiring: "Recrutement",
  funding: "Levée de fonds",
};

/**
 * The fixed Bloc-2 connector the rep says to bridge permission → reason.
 * Methodology-correct and content-free, so it never invents a fact — the fact
 * itself always comes from a grounded source.
 */
export const REASON_BRIDGE = "C'est justement pour ça que je vous appelle :";

function clean(s?: string | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Pick the single strongest grounded reason to call, in priority order: a live
 * signal (the best "why now") → research angle → hiring → funding. Returns
 * null when nothing is grounded (never fabricates a reason).
 */
export function deriveOpeningReason(input: OpeningReasonInput): OpeningReason | null {
  const signal = clean(input.signalLabel);
  if (signal) return { fact: signal, source: "signal", sourceLabel: SOURCE_LABEL.signal };

  const angle = clean(input.messagingAngle);
  if (angle) return { fact: angle, source: "research", sourceLabel: SOURCE_LABEL.research };

  const hiring = clean(input.hiringRole);
  if (hiring) return { fact: `Recrute ${hiring}`, source: "hiring", sourceLabel: SOURCE_LABEL.hiring };

  const funding = clean(input.fundingLastRound);
  if (funding) return { fact: funding, source: "funding", sourceLabel: SOURCE_LABEL.funding };

  return null;
}
