/**
 * Spec 31 — the weekly optimization review. Reads rollups (29) + significance
 * (30), asks the agent (04) for ranked, metric-grounded proposals, eval-gates
 * them, classifies + routes by risk, auto-applies only low-risk autonomous
 * changes, and logs every proposal/decision/outcome for audit and next week.
 */

import { routeProposal, isValidProposal, type Proposal, type ProposalDecision } from "./risk";

export interface ReviewAgentResult {
  evalPassed: boolean;
  value?: { proposals: Proposal[] };
  reason?: string;
}

export interface AuditEntry {
  proposal: Proposal;
  decision: ProposalDecision;
  /** Outcome of an applied change (or null when not applied). */
  outcome?: { ok: boolean; error?: string };
}

export interface ReviewDeps {
  /** spec-04 — propose changes grounded in the metrics + significance snapshot. */
  runAgent: (input: { kind: "weekly-optimization"; workspace: string }) => Promise<ReviewAgentResult>;
  /** Whether a target campaign is autonomous (AC2). */
  isAutonomous: (target: string) => boolean;
  /** Apply an auto-approved low-risk change. Returns nothing; throws on failure. */
  applyChange: (proposal: Proposal) => Promise<void>;
  /** Audit sink (AC5) — proposal + decision + outcome. */
  audit: (entry: AuditEntry) => void | Promise<void>;
}

export interface ReviewResult {
  proposals: Proposal[];
  decisions: ProposalDecision[];
  applied: string[];
  evalPassed: boolean;
}

/**
 * Run the weekly review. A failed agent eval yields no proposals (AC4). Each
 * valid proposal is routed; low-risk autonomous proposals are applied; every
 * proposal + decision (+ outcome) is audited.
 */
export async function runWeeklyReview(workspace: string, deps: ReviewDeps): Promise<ReviewResult> {
  let result: ReviewAgentResult;
  try {
    result = await deps.runAgent({ kind: "weekly-optimization", workspace });
  } catch {
    return { proposals: [], decisions: [], applied: [], evalPassed: false };
  }

  // AC4 — a failed eval blocks every proposal.
  if (!result.evalPassed || !result.value) {
    return { proposals: [], decisions: [], applied: [], evalPassed: false };
  }

  const proposals = result.value.proposals.filter(isValidProposal);
  const decisions: ProposalDecision[] = [];
  const applied: string[] = [];

  for (const proposal of proposals) {
    const decision = routeProposal(proposal, { autonomous: deps.isAutonomous(proposal.target) });
    let outcome: AuditEntry["outcome"];

    if (decision.applied) {
      try {
        await deps.applyChange(proposal);
        outcome = { ok: true };
        applied.push(proposal.id);
      } catch (e) {
        outcome = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    decisions.push(decision);
    await deps.audit({ proposal, decision, outcome }); // AC5
  }

  return { proposals, decisions, applied, evalPassed: true };
}
