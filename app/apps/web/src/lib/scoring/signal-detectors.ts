/**
 * Shared signal-presence detectors.
 *
 * Both the outcome-attribution pipeline (primitive ④) and the live
 * scorer read from `companies.properties` to decide which signals
 * have fired on a company. Keeping the detector map in one file
 * means: adding a new signal type → update here → both the historic
 * attribution and the live scoring pick it up automatically.
 *
 * Each detector returns the Date the signal was observed (or null
 * when it hasn't fired). The actual shape of each JSONB subtree is
 * owned by the signal scanner that writes it — this module is a
 * read-only interpreter.
 */

export type SignalType =
  | "funding"
  | "funding_crunchbase"
  | "hiring"
  | "tech_stack_change"
  | "leadership_change"
  | "investor_overlap";

/**
 * intent = a MOMENT at the company (they did something recently) —
 * it decays. warm_path = a standing fact about the relationship
 * (shared investor) — it does not pretend to be timely and never
 * expires. Traits (e.g. YC membership) are not signals at all and
 * must live in the ICP catalog, not here.
 */
export type SignalCategory = "intent" | "warm_path";

export const SIGNAL_CATEGORY: Record<SignalType, SignalCategory> = {
  funding: "intent",
  funding_crunchbase: "intent",
  hiring: "intent",
  tech_stack_change: "intent",
  leadership_change: "intent",
  investor_overlap: "warm_path",
};

/**
 * Days a fired signal stays usable for scoring and outreach angles.
 * `null` = no expiry (standing facts). A 3-month-old job posting is
 * a fossil, not a reason to call; a 5-month-old raise still implies
 * a budget cycle. Windows follow the audit (gift window for funding
 * mirrors the "raised in the last six months" rule).
 */
export const SIGNAL_TTL_DAYS: Record<SignalType, number | null> = {
  funding: 180,
  funding_crunchbase: 180,
  hiring: 30,
  tech_stack_change: 90,
  leadership_change: 120,
  investor_overlap: null,
};

const DAY_MS = 86_400_000;

/**
 * Freshness test relative to `asOf`. Two call sites, two semantics:
 * live scoring passes `now` (the moment passes, the score falls
 * back); outcome attribution passes the DEAL'S CREATION date so a
 * long sales cycle keeps the credit for the signal that opened it
 * while a pre-deal fossil earns none. An unparsable firedAt fails
 * closed for TTL'd types (NaN comparisons are false).
 */
export function isFreshAt(type: SignalType, firedAt: Date, asOf: Date): boolean {
  const ttl = SIGNAL_TTL_DAYS[type];
  if (ttl === null) return true;
  return firedAt.getTime() >= asOf.getTime() - ttl * DAY_MS;
}

type Detector = (props: Record<string, unknown>) => Date | null;

export const SIGNAL_DETECTORS: Record<SignalType, Detector> = {
  funding: (props) => {
    const stage = props.latest_funding_stage;
    const checkedAt = props.fundingLastCheckedAt;
    if (typeof stage === "string" && stage.length > 0 && typeof checkedAt === "string") {
      return new Date(checkedAt);
    }
    return null;
  },
  funding_crunchbase: (props) => {
    const tamSignals = props.tamSignals as Record<string, unknown> | undefined;
    if (!tamSignals) return null;
    const cbSignal = tamSignals.funding_crunchbase as { value?: boolean; computedAt?: string } | undefined;
    if (cbSignal?.value && typeof cbSignal.computedAt === "string") {
      return new Date(cbSignal.computedAt);
    }
    return null;
  },
  hiring: (props) => {
    const intent = props.jobPostingIntent;
    if (
      intent &&
      typeof intent === "object" &&
      (intent as { signalStrength?: string }).signalStrength
    ) {
      const detectedAt = (intent as { detectedAt?: string }).detectedAt;
      return detectedAt ? new Date(detectedAt) : new Date();
    }
    return null;
  },
  tech_stack_change: (props) => {
    const change = props.techStackChange;
    if (change && typeof change === "object" && (change as { detectedAt?: string }).detectedAt) {
      return new Date((change as { detectedAt?: string }).detectedAt!);
    }
    return null;
  },
  leadership_change: (props) => {
    const change = props.leadershipChange;
    if (change && typeof change === "object" && (change as { detectedAt?: string }).detectedAt) {
      return new Date((change as { detectedAt?: string }).detectedAt!);
    }
    return null;
  },
  investor_overlap: (props) => {
    const overlap = props.investorOverlap;
    if (
      overlap &&
      typeof overlap === "object" &&
      Array.isArray((overlap as { commonInvestors?: unknown }).commonInvestors) &&
      (overlap as { commonInvestors: unknown[] }).commonInvestors.length > 0
    ) {
      const at = (overlap as { scannedAt?: string }).scannedAt;
      return at ? new Date(at) : new Date();
    }
    return null;
  },
};

export function listKnownSignalTypes(): SignalType[] {
  return Object.keys(SIGNAL_DETECTORS) as SignalType[];
}

/**
 * List the signals currently fired AND still fresh on a company.
 * `asOf` defaults to now (live scoring); outcome attribution passes
 * the deal's creation date — see `isFreshAt` for why.
 */
export function detectActiveSignals(
  props: Record<string, unknown>,
  asOf: Date = new Date(),
): Array<{
  type: SignalType;
  firedAt: Date;
}> {
  const out: Array<{ type: SignalType; firedAt: Date }> = [];
  for (const [typeStr, detector] of Object.entries(SIGNAL_DETECTORS)) {
    const type = typeStr as SignalType;
    const firedAt = detector(props);
    if (firedAt && isFreshAt(type, firedAt, asOf)) out.push({ type, firedAt });
  }
  return out;
}
