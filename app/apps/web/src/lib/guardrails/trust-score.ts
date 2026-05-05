/**
 * Progressive-autonomy trust score — the tenant-level signal that
 * gates nudges from review-each → batch-daily → auto-high-confidence.
 *
 * Calibration (brief §8.1 OQ Q7 default):
 *   +0.02  clean approval (user approved a draft without editing)
 *   +0.01  approval with light edit
 *    0.00  heavy edit / no change
 *   -0.05  undone after send (WS-7 integration — negative signal)
 *
 * Thresholds:
 *   ≥ 0.50 → offer the user to relax to batch-daily.
 *   ≥ 0.80 → offer the user to relax to auto-high-confidence.
 *
 * T2 mitigation (brief §8.1): every delta is persisted to the
 * `trust_events` table so WS-8's Agent Memory panel can render the
 * full audit trail. Nothing about the score is silent.
 *
 * T2+T4 sequencing: no nudge is surfaced until
 * `settings.agentMemoryPanelDiscovered === true`. WS-8's panel owns
 * that flip; PR C ships the gate.
 */

import { db } from "@/db";
import { trustEvents } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import {
  getTenantSettings,
  updateTenantSettings,
  type TenantSettings,
} from "@/lib/config/tenant-settings";
import logger from "@/lib/observability/logger";

/**
 * Configurable delta values for trust score adjustments.
 *
 * These control how fast the tenant's autonomy trust score moves toward
 * or away from the thresholds that trigger batch-daily and
 * auto-high-confidence nudges. Tuning guide:
 *
 * - Positive deltas should be small so trust is earned gradually over
 *   many interactions, not granted after a handful of approvals.
 * - The negative delta for "undone_after_send" is intentionally 2.5x
 *   the largest positive delta: a single regretted send should
 *   outweigh several clean approvals, because the cost of a bad
 *   autonomous action is higher than the benefit of a good one.
 * - Zero-delta events still produce audit rows so the WS-8 Agent
 *   Memory panel can render a complete timeline.
 */
export const TRUST_SCORE_CONFIG = {
  /** User approved the draft without any edits -- strongest positive signal. */
  approved_no_edit: 0.02,
  /** User approved with light edits -- still positive, but weaker than no-edit. */
  approved_with_edit: 0.01,
  /** User heavily rewrote the draft -- no signal either way. */
  heavily_edited: 0,
  /** User rejected the draft outright -- neutral (rejection is expected early). */
  rejected: 0,
  /** User undid/recalled an already-sent action -- strong negative signal
   *  that the agent acted prematurely. Asymmetrically large to slow down
   *  autonomy progression after a mistake. */
  undone_after_send: -0.05,
  // Nudge lifecycle events themselves don't move the score, but are
  // logged so the audit trail reflects the user's autonomy decisions.
  nudge_offered: 0,
  nudge_accepted: 0,
  nudge_dismissed: 0,
} as const;

/** @deprecated Use TRUST_SCORE_CONFIG instead. Kept for backward compatibility. */
export const TRUST_SCORE_DELTAS = TRUST_SCORE_CONFIG;

export type TrustEventType = keyof typeof TRUST_SCORE_DELTAS;

export const NUDGE_THRESHOLDS = {
  batchDaily: 0.5,
  autoHighConfidence: 0.8,
} as const;

// Trust scores decay over inactivity. If no positive trust event
// (approved_no_edit or approved_with_edit) occurs within DECAY_WINDOW_MS,
// the score is multiplied by DECAY_FACTOR when read. This prevents
// stale trust scores from granting autonomy to tenants who stopped
// actively calibrating the agent months ago.
const DECAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DECAY_FACTOR = 0.85; // 15% decay per inactive window

export type NudgeKind = "batch-daily" | "auto-high-confidence";

export interface RecordEventInput {
  tenantId: string;
  /** Null when the event was system-originated (e.g. sweep). */
  userId?: string | null;
  eventType: TrustEventType;
  /** Optional override delta. When provided, supersedes the table above —
   *  use for composite events (e.g. "approved_no_edit but weighted by
   *  trustScore"). */
  customDelta?: number;
  /** Free-form ref to the action that triggered this event, e.g.
   *  `email:${id}` or `agent_action:${id}`. Surfaced in WS-8 panel. */
  entityRef?: string;
  reason?: string;
}

export interface RecordEventResult {
  previousScore: number;
  newScore: number;
  delta: number;
  eventId: string;
}

/**
 * Record a trust event and atomically update the tenant's score.
 * Idempotency is the caller's concern — emit once per real user action.
 * Failures are logged and swallowed; autonomy must never hinge on
 * audit-log availability.
 *
 * Score is clamped to [0, 1].
 */
export async function recordAutonomyEvent(
  input: RecordEventInput,
): Promise<RecordEventResult | null> {
  const { tenantId, userId = null, eventType, entityRef, reason } = input;
  const delta =
    input.customDelta ?? TRUST_SCORE_DELTAS[eventType] ?? 0;

  try {
    const settings = await getTenantSettings(tenantId);
    const previousScore = settings.trustScore ?? 0;
    const newScore = clamp01(previousScore + delta);

    // Write the audit row first so readers of trust_events always see
    // a consistent pair — the score update follows immediately after.
    const [row] = await db
      .insert(trustEvents)
      .values({
        tenantId,
        userId,
        eventType,
        scoreDelta: delta,
        newScore,
        entityRef: entityRef ?? null,
        reason: reason ?? null,
      })
      .returning({ id: trustEvents.id });

    // No-op write when delta is 0 (nudge lifecycle events). Still
    // record the audit row so WS-8 can render the user's decisions.
    const updates: Partial<TenantSettings> = {};
    if (delta !== 0) {
      updates.trustScore = newScore;
    }
    // Track last positive event for decay calculation.
    if (delta > 0) {
      updates.lastPositiveTrustEventAt = new Date().toISOString();
    }
    if (Object.keys(updates).length > 0) {
      await updateTenantSettings(tenantId, updates);
    }

    return {
      previousScore,
      newScore,
      delta,
      eventId: row.id,
    };
  } catch (err) {
    logger.warn("trust-score: recordAutonomyEvent failed", {
      tenantId,
      eventType,
      err,
    });
    return null;
  }
}

/**
 * Decide whether a nudge should surface for this tenant, and if so,
 * which one. Consults:
 *  1. current trustScore
 *  2. agentMemoryPanelDiscovered (T2+T4 gate — brief §8.1)
 *  3. autonomyNudgeState (never re-offer if already accepted;
 *     re-offer dismissed after 14 days)
 *  4. agentApprovalMode (never suggest a mode the user is already on
 *     or a lower mode than current)
 */
export async function getNudgeCandidate(
  tenantId: string,
): Promise<NudgeKind | null> {
  try {
    const settings = await getTenantSettings(tenantId);
    return computeNudgeCandidate(settings);
  } catch (err) {
    logger.warn("trust-score: getNudgeCandidate failed", { tenantId, err });
    return null;
  }
}

/**
 * Apply time-based decay to a trust score. If the most recent positive
 * event is older than DECAY_WINDOW_MS, the score is multiplied by
 * DECAY_FACTOR for each elapsed window. Returns the effective score.
 */
export function applyTrustDecay(
  rawScore: number,
  lastPositiveEventAt: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!lastPositiveEventAt || rawScore <= 0) return rawScore;
  const elapsed = now.getTime() - new Date(lastPositiveEventAt).getTime();
  if (elapsed <= DECAY_WINDOW_MS) return rawScore;
  const windows = Math.floor(elapsed / DECAY_WINDOW_MS);
  return rawScore * Math.pow(DECAY_FACTOR, windows);
}

/** Pure-function core of `getNudgeCandidate`, exported for unit tests. */
export function computeNudgeCandidate(
  settings: Pick<
    TenantSettings,
    | "trustScore"
    | "agentMemoryPanelDiscovered"
    | "autonomyNudgeState"
    | "agentApprovalMode"
    | "lastPositiveTrustEventAt"
  >,
  now: Date = new Date(),
): NudgeKind | null {
  // Gate 1 — panel discovery. Brief §8.1 T2+T4: no nudge until the
  // user has seen the Agent Memory surface at least once.
  if (!settings.agentMemoryPanelDiscovered) return null;

  const score = applyTrustDecay(
    settings.trustScore ?? 0,
    settings.lastPositiveTrustEventAt,
    now,
  );
  const state = settings.autonomyNudgeState;
  const currentMode = settings.agentApprovalMode;

  // Gate 2 — auto-high-confidence nudge (higher threshold first).
  if (score >= NUDGE_THRESHOLDS.autoHighConfidence) {
    // Never suggest a mode the user already has or surpassed.
    if (currentMode === "auto-high-confidence" || currentMode === "auto") {
      // Already at the top; no further nudge.
      return null;
    }
    if (state?.autoHighConfidenceAcceptedAt) return null;
    if (shouldReSurfaceAfterDismissal(state?.autoHighConfidenceDismissedAt, now)) {
      return "auto-high-confidence";
    }
    if (state?.autoHighConfidenceOffered) return null;
    return "auto-high-confidence";
  }

  // Gate 3 — batch-daily nudge.
  if (score >= NUDGE_THRESHOLDS.batchDaily) {
    if (
      currentMode === "batch-daily" ||
      currentMode === "auto-high-confidence" ||
      currentMode === "auto"
    ) {
      return null;
    }
    if (state?.batchDailyAcceptedAt) return null;
    if (shouldReSurfaceAfterDismissal(state?.batchDailyDismissedAt, now)) {
      return "batch-daily";
    }
    if (state?.batchDailyOffered) return null;
    return "batch-daily";
  }

  return null;
}

/**
 * Record the user's response to a nudge. Logs to trust_events and
 * updates autonomyNudgeState atomically.
 */
export async function recordNudgeResponse(input: {
  tenantId: string;
  userId?: string | null;
  nudge: NudgeKind;
  response: "accepted" | "dismissed";
}): Promise<void> {
  const { tenantId, userId = null, nudge, response } = input;
  try {
    const settings = await getTenantSettings(tenantId);
    const state = settings.autonomyNudgeState ?? {
      batchDailyOffered: false,
      autoHighConfidenceOffered: false,
    };
    const nowIso = new Date().toISOString();
    const updatedState = { ...state };

    if (nudge === "batch-daily") {
      updatedState.batchDailyOffered = true;
      if (response === "accepted") {
        updatedState.batchDailyAcceptedAt = nowIso;
      } else {
        updatedState.batchDailyDismissedAt = nowIso;
      }
    } else {
      updatedState.autoHighConfidenceOffered = true;
      if (response === "accepted") {
        updatedState.autoHighConfidenceAcceptedAt = nowIso;
      } else {
        updatedState.autoHighConfidenceDismissedAt = nowIso;
      }
    }

    const updates: Partial<TenantSettings> = {
      autonomyNudgeState: updatedState,
    };

    // If accepted, also mutate the mode itself — this is the whole
    // point of the nudge. The user's click = explicit consent to the
    // new mode per brief §8.1 T2 criterion.
    if (response === "accepted") {
      updates.agentApprovalMode = nudge;
    }

    await updateTenantSettings(tenantId, updates);

    // Audit log — the behavior change is visible in the panel.
    await recordAutonomyEvent({
      tenantId,
      userId,
      eventType: response === "accepted" ? "nudge_accepted" : "nudge_dismissed",
      reason: `${nudge} nudge ${response}`,
    });
  } catch (err) {
    logger.warn("trust-score: recordNudgeResponse failed", {
      tenantId,
      nudge,
      response,
      err,
    });
  }
}

/**
 * Fetch the recent audit trail for a tenant. Used by WS-8's Agent
 * Memory panel's learned-preference category.
 */
export async function getRecentTrustEvents(
  tenantId: string,
  limit = 50,
) {
  return db
    .select()
    .from(trustEvents)
    .where(eq(trustEvents.tenantId, tenantId))
    .orderBy(desc(trustEvents.createdAt))
    .limit(limit);
}

/**
 * Dismissed nudges re-surface 14 days later unless the tenant
 * regressed in score (caller shouldn't re-check if score dropped
 * below threshold).
 */
const REDISPLAY_AFTER_DAYS = 14;
function shouldReSurfaceAfterDismissal(
  dismissedAt: string | undefined,
  now: Date,
): boolean {
  if (!dismissedAt) return false;
  const dismissedMs = new Date(dismissedAt).getTime();
  if (!Number.isFinite(dismissedMs)) return false;
  const ageDays = (now.getTime() - dismissedMs) / (1000 * 60 * 60 * 24);
  return ageDays >= REDISPLAY_AFTER_DAYS;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
