/**
 * Approval-mode guardrail — every autonomous action routes through
 * this helper before dispatch. Single source of truth for the
 * "does the human need to see this first?" decision.
 *
 * Motivation (master brief §6 success criterion 2): "Explicit trust
 * calibration before any autonomous action." A single enforcement
 * helper is easier to audit than N callsites with subtle divergence.
 *
 * API
 *   readApprovalMode(settings) → effective v2 mode after legacy coercion.
 *   enforceAgentApprovalMode(input) → { allowed, queueAs, reason }.
 *
 * Callers translate `queueAs` into their persistence model — e.g.
 * email-send-worker writes `status: "draft"` vs `status: "queued"`.
 * Guardrail helpers never persist anything themselves; they return
 * decisions.
 */

import type { TenantSettings } from "@/lib/tenant-settings";

/** Canonical v2 enum, used across all guardrail enforcement. */
export type ApprovalModeV2 =
  | "review-each"
  | "batch-daily"
  | "auto-high-confidence";

/** Legacy values kept on disk for rollback safety. Never emitted by v2 writers. */
type ApprovalModeLegacy = "auto" | "ask" | "manual" | "off";

export type ApprovalModeStored = ApprovalModeV2 | ApprovalModeLegacy;

/**
 * Coerce a settings-stored approval mode (possibly legacy) into the v2
 * enum. Legacy mapping table matches the WS-1 migration runner so a
 * pre-migration tenant behaves the same as a post-migration one until
 * the runner writes the v2 value to disk.
 */
export function readApprovalMode(
  settings: Pick<TenantSettings, "agentApprovalMode">,
): ApprovalModeV2 {
  const raw = settings.agentApprovalMode;
  switch (raw) {
    case "review-each":
    case "batch-daily":
    case "auto-high-confidence":
      return raw;
    case "auto":
      return "auto-high-confidence";
    // "ask" and "manual" both required user confirmation pre-v2 —
    // review-each is the closest v2 value. "off" meant "agent paused",
    // same mapping.
    case "ask":
    case "manual":
    case "off":
      return "review-each";
    // Unset OR unknown → conservative default matching DEFAULTS.
    case undefined:
    case null:
    default:
      return "review-each";
  }
}

/**
 * Action categories the guardrail recognises. Adding a new category
 * means updating `HIGH_CONFIDENCE_THRESHOLDS` below so the
 * `auto-high-confidence` mode knows when to auto-dispatch.
 */
export type GuardedAction =
  | "email-send"
  | "email-reply"
  | "contact-create"
  | "contact-update"
  | "deal-stage-change"
  | "task-create"
  | "sequence-enrollment";

/**
 * Per-action confidence thresholds. A value of 1.1 means "never
 * auto-dispatch without explicit opt-in" — used for irreversible actions
 * (e.g. sequence enrollment) that WS-1 deliberately keeps behind
 * per-item review even in auto-high-confidence mode.
 *
 * Calibration is intentionally conservative. WS-7 (undo layer) will
 * loosen this once reversibility is first-class.
 */
export const HIGH_CONFIDENCE_THRESHOLDS: Record<GuardedAction, number> = {
  "email-send": 0.85,
  "email-reply": 0.8,
  "contact-create": 0.75,
  "contact-update": 0.75,
  "deal-stage-change": 0.9,
  "task-create": 0.7,
  // Sequence enrollment is high-impact + hard to undo pre-WS-7.
  // Always review until WS-7 ships.
  "sequence-enrollment": 1.1,
};

export interface ApprovalDecisionInput {
  mode: ApprovalModeV2;
  action: GuardedAction;
  /** Agent-reported confidence for this specific action, 0-1. If the
   *  caller has no confidence signal, pass `null` — we treat it as
   *  below-threshold for safety. */
  confidence: number | null;
  /** Tenant trust score, 0-1. Currently only used in audit logging;
   *  future thresholds may couple the two. Optional. */
  trustScore?: number;
}

export type ApprovalQueueBucket =
  | "pending-per-item"
  | "pending-daily-batch";

export interface ApprovalDecision {
  /** True when the caller may dispatch the action immediately. */
  allowed: boolean;
  /** Where to park the action when `allowed === false`. Caller writes
   *  this to its own pending-action store. */
  queueAs: ApprovalQueueBucket | null;
  /** Human-readable reason — logged, surfaced to the UI if needed. */
  reason: string;
}

/**
 * Decide whether `action` can auto-dispatch under the tenant's mode.
 *
 * Contract:
 *  - `review-each`          → always queue, reason "mode:review-each".
 *  - `batch-daily`          → always queue into the daily bucket,
 *                             reason "mode:batch-daily".
 *  - `auto-high-confidence` → allow iff confidence ≥ action-specific
 *                             threshold; otherwise fall back to
 *                             per-item review (NOT batch) because the
 *                             user explicitly opted into autonomy and
 *                             the borderline case deserves attention.
 */
export function enforceAgentApprovalMode(
  input: ApprovalDecisionInput,
): ApprovalDecision {
  const { mode, action, confidence } = input;

  if (mode === "review-each") {
    return {
      allowed: false,
      queueAs: "pending-per-item",
      reason: "mode:review-each — every action requires human approval",
    };
  }

  if (mode === "batch-daily") {
    return {
      allowed: false,
      queueAs: "pending-daily-batch",
      reason: "mode:batch-daily — action queued into the daily review",
    };
  }

  // auto-high-confidence
  const threshold = HIGH_CONFIDENCE_THRESHOLDS[action];
  const confidenceValue = confidence ?? 0;
  if (confidenceValue >= threshold) {
    return {
      allowed: true,
      queueAs: null,
      reason: `mode:auto-high-confidence — confidence ${confidenceValue.toFixed(2)} ≥ ${threshold} for ${action}`,
    };
  }

  return {
    allowed: false,
    queueAs: "pending-per-item",
    reason: `mode:auto-high-confidence — confidence ${confidenceValue.toFixed(2)} < ${threshold} for ${action}; falling back to review-each`,
  };
}
