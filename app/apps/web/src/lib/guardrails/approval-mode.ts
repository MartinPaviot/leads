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

import type { TenantSettings } from "@/lib/config/tenant-settings";
import type { AutonomyLevel } from "@/lib/campaign-engine/types";
import { decideAction, type DecideActionInput } from "@/lib/guardrails/decide-action";

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
  /** F005: Learned thresholds from outcome/approval data. When provided,
   *  override the static HIGH_CONFIDENCE_THRESHOLDS for auto-high-confidence mode. */
  learnedThresholds?: Record<string, number>;
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
 * CLE-10 — the `GuardedAction` ↔ action-metadata bridge.
 *
 * `enforceAgentApprovalMode` speaks the 7 named verbs (`GuardedAction`);
 * `decideAction` (the single authority) speaks metadata. This lossless table
 * translates each verb into the `{ mutating, outbound, reversible, cost, confirm }`
 * shape the core consumes, so the delegation below is exact. The `Record<GuardedAction, …>`
 * type enforces exhaustiveness — add a `GuardedAction` member and this won't compile
 * until you add its metadata.
 *
 * NOTE the deliberate posture (design §6.1): the outbound verbs (`email-send`,
 * `email-reply`, `sequence-enrollment`) are `outbound: true`, so under
 * `auto-high-confidence` the core returns `confirm` (→ `pending-per-item`) — no
 * silent external send. This TIGHTENS the previous behaviour (which auto-dispatched
 * outbound at confidence ≥ threshold). Non-outbound reversible verbs keep the exact
 * confidence-threshold behaviour via the `actionKey` lookup.
 */
export const GUARDED_ACTION_METADATA: Record<GuardedAction, DecideActionInput["action"]> = {
  "email-send":          { mutating: true, outbound: true,  reversible: false, cost: "free", confirm: "risky"  },
  "email-reply":         { mutating: true, outbound: true,  reversible: false, cost: "free", confirm: "risky"  },
  "contact-create":      { mutating: true, outbound: false, reversible: true,  cost: "free", confirm: "never"  },
  "contact-update":      { mutating: true, outbound: false, reversible: true,  cost: "free", confirm: "never"  },
  "deal-stage-change":   { mutating: true, outbound: false, reversible: true,  cost: "free", confirm: "risky"  },
  "task-create":         { mutating: true, outbound: false, reversible: true,  cost: "free", confirm: "never"  },
  "sequence-enrollment": { mutating: true, outbound: true,  reversible: false, cost: "free", confirm: "always" },
};

/**
 * Decide whether `action` can auto-dispatch under the tenant's mode.
 *
 * CLE-10: this is now a THIN DELEGATION to `decideAction` (the single authority).
 * Its signature (`ApprovalDecisionInput → ApprovalDecision`) and the `learnedThresholds`
 * field are unchanged, so all 9 callers compile and behave equivalently — one core,
 * nine green call sites (req AC-19 / AC-20). The 4-way `ActionDisposition` from the
 * core is mapped back to the legacy `ApprovalDecision`:
 *   - `execute` → { allowed: true,  queueAs: null }
 *   - `queue`   → { allowed: false, queueAs: "pending-daily-batch" }
 *   - `confirm` → { allowed: false, queueAs: "pending-per-item" }
 *   - `refuse`  → { allowed: false, queueAs: "pending-per-item" } (no viewer in
 *                 background; fail-safe)
 *
 * Behaviour parity (design §6.1):
 *  - `review-each`          → confirm  → pending-per-item   (was always pending-per-item ✓)
 *  - `batch-daily`          → queue    → pending-daily-batch (outbound + reversible) ✓
 *  - `auto-high-confidence` → reversible non-outbound: execute iff confidence ≥ threshold
 *                             (was the same); outbound: now `confirm` → pending-per-item
 *                             (was silent allow at high confidence — INTENDED tightening,
 *                             req AC-11 "no silent outbound").
 */
export function enforceAgentApprovalMode(
  input: ApprovalDecisionInput,
): ApprovalDecision {
  const { mode, action, confidence, learnedThresholds } = input;

  const decision = decideAction(
    {
      action: GUARDED_ACTION_METADATA[action],
      approvalMode: mode,
      role: "member",
      confidence: confidence ?? undefined,
    },
    { actionKey: action, learnedThresholds },
  );

  switch (decision.disposition) {
    case "execute":
      return { allowed: true, queueAs: null, reason: decision.reason };
    case "queue":
      return { allowed: false, queueAs: "pending-daily-batch", reason: decision.reason };
    case "confirm":
    case "refuse": // background has no viewer; refuse won't occur, but fail safe to per-item review
    default:
      return { allowed: false, queueAs: "pending-per-item", reason: decision.reason };
  }
}

/**
 * CLE-10 — map the user-facing autonomy level to the canonical ApprovalModeV2 the
 * control plane runs on. `trustOverall` gates the strategic relaxation (req AC-16);
 * the autonomy PUT route already refuses to SET strategic below 80, so this is a
 * belt-and-braces floor that also covers a level written before the gate existed.
 *
 *   copilot   → review-each            (every action carded)
 *   guided    → review-each            (cards now; batch is a future opt-in, EC-3)
 *   autonomous→ auto-high-confidence   (auto-run safe high-confidence work)
 *   strategic → auto-high-confidence   (+ relaxed thresholds, only if trust >= 80)
 */
export function deriveApprovalModeFromLevel(
  level: AutonomyLevel,
  trustOverall: number,
): { mode: ApprovalModeV2; relaxThresholds: boolean } {
  switch (level) {
    case "autonomous":
      return { mode: "auto-high-confidence", relaxThresholds: false };
    case "strategic":
      return { mode: "auto-high-confidence", relaxThresholds: trustOverall >= 80 };
    case "guided":
    case "copilot":
    default:
      return { mode: "review-each", relaxThresholds: false };
  }
}

/**
 * CLE-10 — the ONE function the control plane calls to get the effective approval
 * mode + whether to relax F005 thresholds. Level (if a row exists) is authoritative;
 * else the stored `agentApprovalMode` (via `readApprovalMode`) is used (EC-4 legacy
 * tenants with no autonomy_config row). (req AC-15.)
 */
export function resolveEffectiveMode(args: {
  settings: Pick<TenantSettings, "agentApprovalMode">;
  level?: AutonomyLevel | null;     // autonomy_config.level, or null if no row
  trustOverall?: number;            // trust-score overall, default 50
}): { mode: ApprovalModeV2; relaxThresholds: boolean } {
  if (args.level) {
    return deriveApprovalModeFromLevel(args.level, args.trustOverall ?? 50);
  }
  return { mode: readApprovalMode(args.settings), relaxThresholds: false };
}

/**
 * CLE-00 minimal disposition mapper, now a ONE-LINE ADAPTER over `decideAction`
 * (the single authority, CLE-10 §5.1). A chat create is a reversible mutation
 * (`mutating, reversible, !outbound, free, confirm:never`) that the member user
 * explicitly requested, so `confidence` defaults to 1 → under `auto-high-confidence`
 * it executes immediately (preserving the legacy "auto" create UX). Everything
 * that is not `execute` (confirm | queue | refuse) maps to the proposal card —
 * NEVER a silent execute. Creates never `refuse` for a member (the viewer floor
 * is enforced at the create.ts call site, which passes the real role).
 *
 * @param mode       effective mode (already through readApprovalMode)
 * @param confidence optional 0-1 signal; absent → treated as high-trust (1)
 */
export function chatCreateDisposition(
  mode: ApprovalModeV2,
  confidence?: number | null,
): "proposal" | "execute" {
  const d = decideAction(
    {
      action: { mutating: true, reversible: true, outbound: false, cost: "free", confirm: "never" },
      approvalMode: mode,
      role: "member",
      confidence: confidence ?? 1,
    },
    { actionKey: "contact-create" },
  );
  return d.disposition === "execute" ? "execute" : "proposal";
}

// (CLE-00's switch-based chatCreateDisposition removed in the main merge — CLE-10's
// decideAction adapter above is the single source; see README §3.5bis.)
