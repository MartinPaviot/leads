/**
 * Per-rule autonomy dial (INBOX-T11) — the human-in-the-loop spine for every
 * triage rule (filters T02, nudges T06, auto-archive T10, ICP triage G11).
 * Pure + unit-tested; the audit table, suggestion endpoints and UI are wiring.
 *
 * Two rungs: "suggest" stages the action for one-click approval (no state change
 * yet); "auto" performs it and logs an audit entry. A hard guard ensures a triage
 * rule can NEVER auto-send an email — sending is always a separate, explicit
 * decision.
 */

export type Autonomy = "suggest" | "auto";
export type RuleAction = "label" | "star" | "archive" | "nudge" | "send";

export interface AutonomyDecision {
  /** true → apply now (auto); false → stage as a suggestion for approval. */
  perform: boolean;
  reason: string;
}

export interface AutonomyOpts {
  /** Demote an Auto rule to Suggest when the match is below this confidence. */
  confidenceFloor?: number;
  confidence?: number;
}

export function resolveAutonomy(
  autonomy: Autonomy,
  action: RuleAction,
  opts: AutonomyOpts = {},
): AutonomyDecision {
  // Hard guarantee: triage rules never auto-send, regardless of the dial.
  if (action === "send") {
    return { perform: false, reason: "triage rules never auto-send — staged for review" };
  }
  if (autonomy === "suggest") {
    return { perform: false, reason: "rule set to suggest" };
  }
  if (opts.confidenceFloor != null && opts.confidence != null && opts.confidence < opts.confidenceFloor) {
    return { perform: false, reason: "below confidence floor — staged for review" };
  }
  return { perform: true, reason: "rule set to auto" };
}

/** AI-prompt rules earn trust before acting; deterministic rules may act at once. */
export function defaultAutonomy(kind: "ai" | "deterministic"): Autonomy {
  return kind === "ai" ? "suggest" : "auto";
}

/** Offer Suggest→Auto promotion once a rule has a clean accepted track record. */
export function shouldPromote(
  stats: { accepted: number; dismissed: number; undone?: number },
  minAccepted = 20,
): boolean {
  return stats.accepted >= minAccepted && stats.dismissed === 0 && (stats.undone ?? 0) === 0;
}
