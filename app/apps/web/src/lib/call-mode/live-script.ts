/**
 * Per-prospect "reason to call" — Bloc 2 of the locked methodology (the
 * contextual bridge said right AFTER the permission gate, see
 * _research/cold-call-exchange-top01-2026-06.md).
 *
 * Grounded is NOT enough — it must be SAYABLE. Only externally-voiceable
 * trigger events become a reason: a live signal whose TYPE is a real-world
 * event or an explicit interaction, then a hiring / funding fact from the
 * research dossier. Internal/behavioral signals (engagement spike, deal stall,
 * sentiment, usage) are excluded — reading "I'm calling because your
 * engagement spiked / your deal stalled" on a cold call is creepy or
 * nonsensical (and pipeline/usage signals only exist for accounts you already
 * work). A research "messaging angle" is the rep's own strategy note, not a
 * reason — it is never spoken here.
 *
 * Priority: voiceable signal → hiring → funding. Null when nothing sayable is
 * known — then the rep opens on the bare permission gate, which is better than
 * reading an internal signal or a strategy note aloud. Stating a real reason is
 * worth ~x2.1 on the meeting rate (Gong), but only when it is real AND sayable.
 *
 * Pure + unit-tested; no I/O, no React.
 */

export type OpeningReasonSource = "signal" | "hiring" | "funding";

export interface OpeningReason {
  /** The grounded fact to lead with, in plain words. */
  fact: string;
  source: OpeningReasonSource;
  /** Human label for the provenance chip. */
  sourceLabel: string;
}

/**
 * Signal types that are sayable as a reason to call: real-world trigger events
 * and explicit interactions. Keyed on the signal-scanner vocabulary
 * (skills/signals/*). Anything NOT listed (engagement_spike, deal_stall,
 * stalled_no_activity, at_risk_negative, positive/negative_sentiment,
 * usage_increase, deal_upsell_ready) is an internal/behavioral inference we
 * never voice to the prospect on a cold call.
 */
const VOICEABLE_SIGNAL_TYPES = new Set([
  "hiring",
  "funding",
  "funding_recent",
  "leadership_change",
  "tech_adoption",
  "expansion",
  "new_department",
  "headcount_growth",
  "competitor_mention",
  "trial_expiring",
  "reply_received",
]);

export function isVoiceableSignal(type?: string | null): boolean {
  return Boolean(type && VOICEABLE_SIGNAL_TYPES.has(type.trim().toLowerCase()));
}

export interface OpeningReasonInput {
  /** Freshest signal as {type,label}. Used ONLY if the type is voiceable. */
  signal?: { type: string; label: string } | null;
  /** Top hiring role from the research dossier (a voiceable event). */
  hiringRole?: string | null;
  /** Last funding round from the dossier (a voiceable event). */
  fundingLastRound?: string | null;
}

const SOURCE_LABEL: Record<OpeningReasonSource, string> = {
  signal: "Signal temps réel",
  hiring: "Recrutement",
  funding: "Levée de fonds",
};

/**
 * The fixed Bloc-2 connector the rep says to bridge permission → reason.
 * Methodology-correct and content-free, so it never invents a fact.
 */
export const REASON_BRIDGE = "C'est justement pour ça que je vous appelle :";

function clean(s?: string | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Pick the single strongest grounded AND sayable reason to call: a voiceable
 * live signal → hiring → funding. Returns null when nothing sayable is known
 * (never fabricates, never voices an internal signal or a strategy note).
 */
/**
 * Union of the research dossier's techStack and the enrichment-detected
 * technologies (companies.properties.technologies — the tech-detect output).
 * The two live in different fields; Call Mode must see both. Dossier order
 * first, enriched extras appended, case-insensitive dedupe, capped.
 */
export function mergeTechStacks(
  dossier?: string[] | null,
  enriched?: string[] | null,
  cap = 12,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of [...(dossier ?? []), ...(enriched ?? [])]) {
    const v = (t ?? "").trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= cap) break;
  }
  return out;
}

export function deriveOpeningReason(input: OpeningReasonInput): OpeningReason | null {
  if (input.signal && isVoiceableSignal(input.signal.type)) {
    const label = clean(input.signal.label);
    if (label) return { fact: label, source: "signal", sourceLabel: SOURCE_LABEL.signal };
  }

  const hiring = clean(input.hiringRole);
  if (hiring) return { fact: `Recrute ${hiring}`, source: "hiring", sourceLabel: SOURCE_LABEL.hiring };

  const funding = clean(input.fundingLastRound);
  if (funding) return { fact: funding, source: "funding", sourceLabel: SOURCE_LABEL.funding };

  return null;
}
