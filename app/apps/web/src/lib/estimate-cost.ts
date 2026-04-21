/**
 * Cost estimation for heavy operations — consumed by the
 * `/api/estimate-cost` endpoint and by WS-4's TAM kickoff to drive
 * the conditional cost-preview display (brief §8.1 T3 mitigation).
 *
 * Design:
 *  - Pure function: `{op, params}` → `{llmEstimateUsd, apolloCredits,
 *    estimatedDurationSeconds, confidenceLevel}`. No external calls.
 *  - Estimates are based on measured p50 costs from agent_traces
 *    during dogfooding, rounded to a clean number. When an op's cost
 *    depends on a param (contact count, TAM size), the function
 *    scales linearly.
 *  - `confidenceLevel` tells the caller how much to trust the number.
 *    High = measured from production traces. Medium = extrapolated
 *    from a similar op. Low = first-principles estimate.
 *  - The endpoint layer couples this to the budget status and
 *    near-cap signal; the pure helper doesn't know about tenants.
 */

export type EstimatableOp =
  | "tam-build"
  | "sequence-draft"
  | "inbox-scan"
  | "narrate-website"
  | "icp-analysis";

export interface EstimateCostInput {
  op: EstimatableOp;
  /** Op-specific params. See the switch in `estimateCost` for the shape
   *  each op expects. Unknown params are ignored. */
  params?: Record<string, unknown>;
}

export type CostConfidence = "high" | "medium" | "low";

export interface EstimateCostOutput {
  /** USD cost of LLM calls for this op. */
  llmEstimateUsd: number;
  /** Apollo credits consumed. 0 means "no Apollo involvement". */
  apolloCredits: number;
  /** Wall-clock estimate in seconds (p50). */
  estimatedDurationSeconds: number;
  /** How much to trust the estimate. */
  confidenceLevel: CostConfidence;
  /** Short human-readable summary — the UI can render this directly. */
  summary: string;
}

/**
 * Pure estimator. Does not touch the DB or network. Every branch
 * documents the provenance of the numbers so reviewers can tell
 * "measured" from "guessed".
 */
export function estimateCost(input: EstimateCostInput): EstimateCostOutput {
  switch (input.op) {
    case "tam-build": {
      // Measured from agent_traces: `build-tam` p50 ≈ $0.02 for the
      // strategy LLM. Apollo search + enrich is the bulk: 3 pages per
      // strategy × 2-4 strategies ≈ 6-12 searches + up to 300
      // enrichments. Credits on Apollo Hypergrowth plan: ~1 per enrich.
      // Round to a round "few cents".
      return {
        llmEstimateUsd: 0.08,
        apolloCredits: 250,
        estimatedDurationSeconds: 60,
        confidenceLevel: "high",
        summary: "~$0.08 in AI credits + ~250 Apollo credits, ~1 min",
      };
    }
    case "sequence-draft": {
      // Linear in contact count. Per measured traces, drafting a
      // personalized email runs ~$0.04 on claude-sonnet-4-6.
      const contactCount = Number(input.params?.contactCount ?? 1);
      const safeContacts = Math.max(1, Math.floor(contactCount));
      const llm = Number((safeContacts * 0.04).toFixed(3));
      return {
        llmEstimateUsd: llm,
        apolloCredits: 0,
        estimatedDurationSeconds: Math.ceil(safeContacts * 2.5),
        confidenceLevel: "high",
        summary: `~$${llm.toFixed(2)} in AI credits for ${safeContacts} drafted email${safeContacts > 1 ? "s" : ""}`,
      };
    }
    case "inbox-scan": {
      // Inbox scanning is Gmail/Outlook fetch + light embedding — no
      // LLM. Apollo 0. Scales with days of backsync.
      const days = Number(input.params?.days ?? 90);
      return {
        llmEstimateUsd: 0,
        apolloCredits: 0,
        estimatedDurationSeconds: Math.ceil(days / 2),
        confidenceLevel: "medium",
        summary: `Inbox scan for ${days} days, ~${Math.ceil(days / 2)}s`,
      };
    }
    case "narrate-website": {
      // Measured: `onboarding-narrator` p50 ≈ $0.04. Single stream.
      return {
        llmEstimateUsd: 0.04,
        apolloCredits: 0,
        estimatedDurationSeconds: 8,
        confidenceLevel: "high",
        summary: "~$0.04 in AI credits, ~8s streaming narrative",
      };
    }
    case "icp-analysis": {
      // Measured: website intelligence + ICP inference (two LLM calls,
      // second with thinking 4k) ≈ $0.06 combined.
      return {
        llmEstimateUsd: 0.06,
        apolloCredits: 50,
        estimatedDurationSeconds: 15,
        confidenceLevel: "high",
        summary: "~$0.06 in AI credits + ~50 Apollo credits, ~15s",
      };
    }
    default: {
      // Exhaustive safety — if a new op is added to the type but not
      // the switch, surface a conservative fallback rather than crash.
      const _exhaustive: never = input.op;
      void _exhaustive;
      return {
        llmEstimateUsd: 0,
        apolloCredits: 0,
        estimatedDurationSeconds: 0,
        confidenceLevel: "low",
        summary: "No estimate available for this operation",
      };
    }
  }
}

/**
 * "Near cap" helper for the T3 display rule. Returns true when the
 * tenant is within the last 20 % of their monthly LLM cap OR the
 * proposed operation would push them past 80 %.
 *
 * Caller feeds this the current `BudgetStatus` from lib/llm-budget +
 * the estimate's llmEstimateUsd. Pure — no DB.
 */
export function isNearCap(
  status: { capUsd: number; spentUsd: number },
  additionalSpendUsd = 0,
): boolean {
  const cap = status.capUsd;
  if (!cap || cap <= 0) return false;
  const projected = status.spentUsd + additionalSpendUsd;
  return projected / cap >= 0.8;
}
