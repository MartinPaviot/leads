/**
 * ICP/persona triage routing (INBOX-G11 core). Pure + unit-tested.
 *
 * Routes an inbound to a priority lane from the ICP fit that the existing
 * criteria-engine already computes (an ICP is the AND of its required criteria
 * plus a soft fit score) — this does NOT re-implement ICP matching (reuse
 * lib/icp/criteria-engine + getIcpPersonTargeting), it only decides the lane from
 * the fit + persona signal. A required-criterion miss means out-of-ICP → low.
 */

export interface IcpTriageInput {
  /** All required ICP criteria are met (the hard gate from criteria-engine). */
  requiredMet: boolean;
  /** Soft fit score in [0,1] from criteria-engine. */
  fitScore: number;
  /** Sender's title matches a target persona. */
  personaMatch: boolean;
}

export type TriageLane = "priority" | "standard" | "low";

export function icpTriageLane(i: IcpTriageInput): { lane: TriageLane; reason: string } {
  if (!i.requiredMet) {
    return { lane: "low", reason: "outside your ICP (a required criterion is unmet)" };
  }
  if (i.fitScore >= 0.7 && i.personaMatch) {
    return { lane: "priority", reason: "strong ICP fit and a target persona" };
  }
  if (i.fitScore >= 0.4 || i.personaMatch) {
    return { lane: "standard", reason: "partial ICP fit" };
  }
  return { lane: "low", reason: "weak ICP fit" };
}
