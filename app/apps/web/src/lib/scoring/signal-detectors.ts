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
 * List the signals currently fired on a company.
 */
export function detectActiveSignals(props: Record<string, unknown>): Array<{
  type: SignalType;
  firedAt: Date;
}> {
  const out: Array<{ type: SignalType; firedAt: Date }> = [];
  for (const [typeStr, detector] of Object.entries(SIGNAL_DETECTORS)) {
    const firedAt = detector(props);
    if (firedAt) out.push({ type: typeStr as SignalType, firedAt });
  }
  return out;
}
