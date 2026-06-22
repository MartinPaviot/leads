/**
 * Spec 31 — deterministic risk routing for optimization proposals. Low-risk
 * changes auto-apply only on autonomous campaigns; medium/high always need a
 * human gate (03); a proposal grounded in insufficient/insignificant data, or
 * with no cited metric, is forced to "watch" — never applied. Blast radius:
 * analytics/optimizer/* only.
 */

export type ProposalType = "pause" | "scale" | "copy_adjust" | "icp_adjust" | "cadence_adjust";
export type RiskLevel = "low" | "medium" | "high";

export const PROPOSAL_TYPES: ReadonlySet<string> = new Set<ProposalType>(["pause", "scale", "copy_adjust", "icp_adjust", "cadence_adjust"]);
export const RISK_LEVELS: ReadonlySet<string> = new Set<RiskLevel>(["low", "medium", "high"]);

export interface CitedMetric {
  name: string;
  value: number;
  scope: string;
}

export type SignificanceVerdict = "winner" | "no_significant_difference" | "insufficient_data" | "inconclusive";

export interface Proposal {
  id: string;
  type: ProposalType;
  target: string;
  rationale: string;
  risk: RiskLevel;
  citedMetric?: CitedMetric;
  /** Set when the change is grounded in an A/B comparison (spec 30). */
  significanceVerdict?: SignificanceVerdict;
}

export type Route = "auto_apply" | "gated" | "watch";

export interface ProposalDecision {
  proposalId: string;
  route: Route;
  applied: boolean;
  reason: string;
}

/**
 * Route a proposal deterministically. `autonomous` is whether the target
 * campaign is in autonomous mode.
 */
export function routeProposal(proposal: Proposal, ctx: { autonomous: boolean }): ProposalDecision {
  const watch = (reason: string): ProposalDecision => ({ proposalId: proposal.id, route: "watch", applied: false, reason });

  // AC4 — a proposal must cite a metric (deterministic safety net over the agent eval).
  if (!proposal.citedMetric) return watch("no cited metric");

  // AC3 — never act on insufficient/insignificant data.
  if (proposal.significanceVerdict && proposal.significanceVerdict !== "winner") {
    return watch(`insignificant data: ${proposal.significanceVerdict}`);
  }

  // AC2 — risk routing.
  if (proposal.risk === "high" || proposal.risk === "medium") {
    return { proposalId: proposal.id, route: "gated", applied: false, reason: `${proposal.risk} risk requires a human gate` };
  }
  // low risk
  if (ctx.autonomous) {
    return { proposalId: proposal.id, route: "auto_apply", applied: true, reason: "low risk, autonomous campaign" };
  }
  return { proposalId: proposal.id, route: "gated", applied: false, reason: "low risk, but campaign is not autonomous" };
}

/** Valid proposal shape (defensive validation of agent output). */
export function isValidProposal(p: Partial<Proposal> | null | undefined): p is Proposal {
  return (
    !!p &&
    typeof p.id === "string" &&
    typeof p.target === "string" &&
    typeof p.rationale === "string" &&
    PROPOSAL_TYPES.has(p.type as string) &&
    RISK_LEVELS.has(p.risk as string)
  );
}
