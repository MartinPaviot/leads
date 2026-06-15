/**
 * Signal-weighted scoring bonus (primitive ④ live wire).
 *
 * Take a company's JSONB properties + the tenant's learned signal
 * multipliers, return the bonus points to add on top of the base fit
 * score. Pure function — tests and scoring caller both consume it
 * without DB round trips.
 */

import { detectActiveSignals, type SignalType } from "./signal-detectors";
import { isSignalFresh } from "@/lib/signals/freshness";

/** Points a single fired signal contributes at neutral multiplier 1×. */
const BASE_BONUS_PER_SIGNAL = 5;

/**
 * Cap on total signal bonus so it never overwhelms the 100-point fit
 * score. The intent is to tilt ranking, not drown the ICP match.
 */
const MAX_TOTAL_SIGNAL_BONUS = 20;

export interface SignalBonus {
  bonus: number;
  /** Per-signal breakdown for the UI "why this account" tooltip. */
  contributions: Array<{
    type: SignalType;
    multiplier: number;
    points: number;
  }>;
  reasons: string[];
}

export function scoreSignals(
  companyProps: Record<string, unknown>,
  multipliers: Record<string, number>,
  now: Date = new Date(),
): SignalBonus {
  // A signal past its shelf life no longer boosts priority — an expired
  // signal is no reason to call a company today (lib/signals/freshness.ts).
  const active = detectActiveSignals(companyProps).filter((s) =>
    isSignalFresh(s.type, s.firedAt, now),
  );
  if (active.length === 0) {
    return { bonus: 0, contributions: [], reasons: [] };
  }

  const contributions: SignalBonus["contributions"] = [];
  const reasons: string[] = [];
  let rawBonus = 0;

  for (const sig of active) {
    const mult = Math.max(0, multipliers[sig.type] ?? 1);
    const points = BASE_BONUS_PER_SIGNAL * mult;
    rawBonus += points;
    contributions.push({ type: sig.type, multiplier: mult, points });
    reasons.push(
      mult === 1
        ? `${formatSignalLabel(sig.type)} signal fired`
        : `${formatSignalLabel(sig.type)} signal fired (${mult.toFixed(1)}× historical lift)`,
    );
  }

  // Soft-cap: once we hit the max bonus, additional signals still
  // show up in the contributions list (useful in the UI) but don't
  // inflate the score.
  const bonus = Math.min(MAX_TOTAL_SIGNAL_BONUS, Math.round(rawBonus));

  return { bonus, contributions, reasons };
}

function formatSignalLabel(t: SignalType): string {
  switch (t) {
    case "funding": return "Funding";
    case "funding_crunchbase": return "Funding (Crunchbase)";
    case "hiring": return "Hiring";
    case "tech_stack_change": return "Tech-stack change";
    case "leadership_change": return "Leadership change";
    case "investor_overlap": return "Common investor";
  }
}
