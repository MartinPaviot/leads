/**
 * decideAction — THE single decision authority for the Chat Live Executor
 * (README §3.5bis). One function decides whether an action — headless OR a page
 * action OR a background-loop action — executes directly, shows a confirm card,
 * queues into the daily review, or is refused.
 *
 * CLE-10: this is the REAL body. It branches on approvalMode (the ApprovalModeV2
 * SSOT via readApprovalMode), the action class derived from metadata, the role,
 * and confidence (honouring F005 learnedThresholds). It is consumed IDENTICALLY by:
 *   (a) chat create/update tools (absorbs CLE-00's chatCreateDisposition),
 *   (b) invokePageAction (CLE-04 — import site unchanged),
 *   (c) the background loops, via enforceAgentApprovalMode which now DELEGATES here.
 *
 * The SIGNATURE (DecideActionInput / DecideActionResult / the function shape) is the
 * frozen §3.5bis contract and MUST NOT change. CLE-16 will feed it richer confidence
 * and trained thresholds; it will not change the signature.
 *
 * Fail-safe doctrine: every defaulting path resolves toward MORE control
 * (confirm/refuse), never toward a silent execute (CLE-00 "zero silent actions").
 */

import type { ApprovalModeV2 } from "@/lib/guardrails/approval-mode";
import { HIGH_CONFIDENCE_THRESHOLDS, type GuardedAction } from "@/lib/guardrails/approval-mode";

export type ActionDisposition = "execute" | "confirm" | "queue" | "refuse";

export interface DecideActionInput {
  action: {
    mutating: boolean;
    outbound?: boolean;
    reversible?: boolean;
    cost?: "free" | "credits" | "money";
    confirm: "never" | "risky" | "always";
  };
  approvalMode: ApprovalModeV2; // SSOT via readApprovalMode()
  role: "admin" | "member" | "viewer";
  confidence?: number;
}

export interface DecideActionResult {
  disposition: ActionDisposition;
  reason: string;
}

/**
 * Optional extension input (NOT part of §3.5bis — additive, all optional, so the
 * frozen call shape `decideAction({ action, approvalMode, role, confidence })` is a
 * valid subset). Lets background callers pass the F005 learned thresholds and an
 * action key for threshold lookup. Page actions / chat creates do not pass these.
 */
export interface DecideActionExtra {
  /** Action key for confidence-threshold lookup (F005). Defaults via class→key map. */
  actionKey?: GuardedAction;
  /** F005 learned per-action thresholds; override HIGH_CONFIDENCE_THRESHOLDS when present. */
  learnedThresholds?: Record<string, number>;
}

export function decideAction(
  input: DecideActionInput,
  extra?: DecideActionExtra,
): DecideActionResult {
  const { approvalMode, role } = input;

  // ── Defensive normalization (fail-safe: unknown scalar → safest) — req AC-21 ──
  const mutating = typeof input.action.mutating === "boolean" ? input.action.mutating : true;
  const outbound = input.action.outbound === true;
  const reversible = input.action.reversible === true;
  const cost =
    input.action.cost === "free" || input.action.cost === "credits" || input.action.cost === "money"
      ? input.action.cost
      : "free";
  const confirmPolicy =
    input.action.confirm === "never" || input.action.confirm === "risky" || input.action.confirm === "always"
      ? input.action.confirm
      : "always"; // unknown → safest

  // ── 0. ROLE FLOOR (evaluated before mode) — req AC-1 / AC-2 ──
  // Viewers may only drive pure-read actions. Any write/outbound/paid → refuse,
  // regardless of approvalMode. (Minimal viewer gate; full matrix is CLE-12.)
  if (role === "viewer") {
    if (mutating || outbound || cost === "money") {
      return {
        disposition: "refuse",
        reason: "role:viewer — read-only; mutating/outbound/paid actions require a member or admin",
      };
    }
    return { disposition: "execute", reason: "role:viewer — read-only action, execute" };
  }

  // ── 1. PAID always confirms, regardless of mode — req AC-3 ──
  // Spending real money is never silent and never batched.
  if (cost === "money") {
    return { disposition: "confirm", reason: "cost:money — always confirm a paid action" };
  }

  // ── 2. PURE READ executes in every mode — req AC-5 ──
  if (!mutating && !outbound) {
    return { disposition: "execute", reason: "read-only action — execute" };
  }

  // From here: member/admin, non-paid, and (mutating || outbound).
  // Classify for the mode matrix.
  const destructive = mutating && !reversible && !outbound;

  // ── 3. review-each: every write/outbound is carded — req AC-4 ──
  if (approvalMode === "review-each") {
    return { disposition: "confirm", reason: "mode:review-each — every action requires approval" };
  }

  // ── 4. batch-daily — req AC-6 / AC-7 / AC-8 ──
  if (approvalMode === "batch-daily") {
    if (destructive) {
      // Irreversible change is never silently batched.
      return { disposition: "confirm", reason: "mode:batch-daily — irreversible change requires confirm" };
    }
    // outbound (non-paid) and reversible mutation → daily review lane.
    return {
      disposition: "queue",
      reason: outbound
        ? "mode:batch-daily — outbound queued into the daily review"
        : "mode:batch-daily — reversible change queued into the daily review",
    };
  }

  // ── 5. auto-high-confidence — req AC-9 / AC-10 / AC-11 / AC-13 ──
  // Autonomy auto-runs only REVERSIBLE, NON-OUTBOUND, NON-DESTRUCTIVE work, and only
  // above the action's confidence threshold. Outbound + destructive always confirm.
  if (approvalMode === "auto-high-confidence") {
    if (outbound || destructive) {
      return {
        disposition: "confirm",
        reason: outbound
          ? "mode:auto-high-confidence — outbound always confirmed (under the user's eyes)"
          : "mode:auto-high-confidence — irreversible change always confirmed",
      };
    }
    // reversible mutation. The action's own policy can RAISE the bar — req AC-13 / AC-12.
    if (confirmPolicy === "always" || confirmPolicy === "risky") {
      return { disposition: "confirm", reason: `mode:auto-high-confidence — action confirm:${confirmPolicy}` };
    }
    // confirm:"never" reversible → gate on confidence (F005-aware) — req AC-9 / AC-10.
    const key = extra?.actionKey;
    const threshold =
      (key && extra?.learnedThresholds?.[key]) ??
      (key ? HIGH_CONFIDENCE_THRESHOLDS[key] : 0.8); // no key → moderate default bar
    const confidenceValue = input.confidence ?? 0;
    if (confidenceValue >= threshold) {
      return {
        disposition: "execute",
        reason: `mode:auto-high-confidence — confidence ${confidenceValue.toFixed(2)} >= ${threshold}`,
      };
    }
    return {
      disposition: "confirm",
      reason: `mode:auto-high-confidence — confidence ${confidenceValue.toFixed(2)} < ${threshold}; fall back to review`,
    };
  }

  // ── 6. Unknown mode (unreachable: readApprovalMode coerces) → safest — req AC-21 ──
  return { disposition: "confirm", reason: "unknown approval mode — defaulting to confirm" };
}
