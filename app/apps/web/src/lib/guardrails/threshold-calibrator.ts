/**
 * Adaptive Confidence Threshold Calibrator
 *
 * Analyzes historical trust events and agent actions to determine
 * whether the current confidence thresholds are too aggressive
 * (auto-approving things users would reject) or too conservative
 * (requiring approval for things users always approve).
 *
 * Calibration logic:
 * - If >95% of auto-executed actions at a confidence level are never undone
 *   -> threshold is too conservative -> suggest lowering by 0.02
 * - If >5% of auto-executed actions are undone
 *   -> threshold is too aggressive -> suggest raising by 0.05
 * - Target: 1-3% undo rate (the user's natural error tolerance)
 *
 * All suggestions are advisory — the tenant decides whether to apply them.
 * This follows the same "explicit trust calibration" principle as the
 * approval-mode guardrail (brief section 6 success criterion 2).
 */

import { db } from "@/db";
import { agentActions } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  HIGH_CONFIDENCE_THRESHOLDS,
  type GuardedAction,
} from "./approval-mode";
import logger from "@/lib/logger";

// ── Public Types ──────────────────────────────────────────────

export interface CalibrationResult {
  /** The action type being calibrated (e.g. "email-send", "deal-stage-change") */
  actionType: string;
  /** Current threshold from HIGH_CONFIDENCE_THRESHOLDS */
  currentThreshold: number;
  /** Suggested new threshold based on historical data */
  suggestedThreshold: number;
  /** Direction of the suggested change */
  direction: "raise" | "lower" | "keep";
  /** Undo rate = undone / (executed + undone). 0-1. */
  undoRate: number;
  /** Total actions in the sample window */
  sampleSize: number;
  /** How much we trust this recommendation */
  confidence: "high" | "medium" | "low";
  /** Human-readable explanation of why we suggest this change */
  reasoning: string;
}

export interface CalibrationSummary {
  tenantId: string;
  calibratedAt: string;
  windowDays: number;
  results: CalibrationResult[];
  /** Overall assessment: are thresholds well-tuned? */
  overallAssessment: "well-tuned" | "too-conservative" | "too-aggressive" | "mixed" | "insufficient-data";
}

// ── Configuration ─────────────────────────────────────────────

/** How far back to look for historical data (days) */
const DEFAULT_WINDOW_DAYS = 90;

/** Minimum actions needed for a statistically meaningful sample */
const MIN_SAMPLE_SIZE = 20;

/** Minimum actions needed for high-confidence recommendation */
const HIGH_CONFIDENCE_SAMPLE_SIZE = 50;

/** Target undo rate range (1-3%) */
const TARGET_UNDO_RATE_LOW = 0.01;
const TARGET_UNDO_RATE_HIGH = 0.03;

/** Threshold for "too aggressive" — raising */
const AGGRESSIVE_UNDO_RATE = 0.05;

/** Threshold for "too conservative" — lowering */
const CONSERVATIVE_UNDO_RATE = 0.01;

/** How much to raise threshold when too aggressive */
const RAISE_DELTA = 0.05;

/** How much to lower threshold when too conservative */
const LOWER_DELTA = 0.02;

/** Never lower a threshold below this floor */
const THRESHOLD_FLOOR = 0.5;

/** Never raise a threshold above this ceiling (except for intentionally blocked actions) */
const THRESHOLD_CEILING = 1.0;

// ── Main calibration function ─────────────────────────────────

/**
 * Calibrate confidence thresholds for a tenant based on historical
 * agent action data.
 *
 * Queries the agentActions table for the specified window, groups by
 * action type, and computes undo rates. Returns calibration suggestions
 * that the tenant can review and optionally apply.
 *
 * @param tenantId - The tenant to calibrate
 * @param windowDays - How many days of history to analyze (default: 90)
 */
export async function calibrateThresholds(
  tenantId: string,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<CalibrationSummary> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  try {
    // Query all actions in the window, grouped by type and status
    const actionStats = await db
      .select({
        actionType: agentActions.actionType,
        status: agentActions.status,
        count: sql<number>`count(*)::int`,
      })
      .from(agentActions)
      .where(
        and(
          eq(agentActions.tenantId, tenantId),
          gte(agentActions.createdAt, since),
        ),
      )
      .groupBy(agentActions.actionType, agentActions.status);

    // Group stats by action type
    const byType = new Map<
      string,
      { executed: number; reversed: number; scheduled: number; failed: number; total: number }
    >();

    for (const row of actionStats) {
      const existing = byType.get(row.actionType) || {
        executed: 0,
        reversed: 0,
        scheduled: 0,
        failed: 0,
        total: 0,
      };

      const countNum = Number(row.count);

      switch (row.status) {
        case "executed":
          existing.executed += countNum;
          break;
        case "reversed":
          existing.reversed += countNum;
          break;
        case "scheduled":
          existing.scheduled += countNum;
          break;
        case "failed":
          existing.failed += countNum;
          break;
      }
      existing.total += countNum;
      byType.set(row.actionType, existing);
    }

    // Compute calibration results for each action type
    const results: CalibrationResult[] = [];

    // Process both known action types (from HIGH_CONFIDENCE_THRESHOLDS) and
    // any additional types found in the data
    const allActionTypes = new Set<string>([
      ...Object.keys(HIGH_CONFIDENCE_THRESHOLDS),
      ...byType.keys(),
    ]);

    for (const actionType of allActionTypes) {
      const stats = byType.get(actionType);
      const currentThreshold =
        HIGH_CONFIDENCE_THRESHOLDS[actionType as GuardedAction] ?? 0.8;

      if (!stats || stats.total === 0) {
        results.push({
          actionType,
          currentThreshold,
          suggestedThreshold: currentThreshold,
          direction: "keep",
          undoRate: 0,
          sampleSize: 0,
          confidence: "low",
          reasoning: `No actions of type "${actionType}" in the last ${windowDays} days. Keeping current threshold.`,
        });
        continue;
      }

      const result = computeCalibration(actionType, currentThreshold, stats, windowDays);
      results.push(result);
    }

    // Sort: actionable suggestions first (raise/lower), then keep
    results.sort((a, b) => {
      const order = { raise: 0, lower: 1, keep: 2 };
      return order[a.direction] - order[b.direction];
    });

    // Compute overall assessment
    const overallAssessment = computeOverallAssessment(results);

    return {
      tenantId,
      calibratedAt: new Date().toISOString(),
      windowDays,
      results,
      overallAssessment,
    };
  } catch (err) {
    logger.warn("threshold-calibrator: calibration failed", { tenantId, err });
    return {
      tenantId,
      calibratedAt: new Date().toISOString(),
      windowDays,
      results: [],
      overallAssessment: "insufficient-data",
    };
  }
}

// ── Calibration computation ───────────────────────────────────

function computeCalibration(
  actionType: string,
  currentThreshold: number,
  stats: { executed: number; reversed: number; scheduled: number; failed: number; total: number },
  windowDays: number,
): CalibrationResult {
  // Only count executed + reversed for undo rate (scheduled and failed are not relevant)
  const completedActions = stats.executed + stats.reversed;

  if (completedActions < MIN_SAMPLE_SIZE) {
    return {
      actionType,
      currentThreshold,
      suggestedThreshold: currentThreshold,
      direction: "keep",
      undoRate: completedActions > 0 ? stats.reversed / completedActions : 0,
      sampleSize: completedActions,
      confidence: "low",
      reasoning:
        `Only ${completedActions} completed actions in ${windowDays} days ` +
        `(need ${MIN_SAMPLE_SIZE}+). Insufficient data for calibration.`,
    };
  }

  const undoRate = stats.reversed / completedActions;
  const confidence: "high" | "medium" | "low" =
    completedActions >= HIGH_CONFIDENCE_SAMPLE_SIZE ? "high" : "medium";

  // Intentionally blocked actions (threshold > 1.0) should never be auto-lowered
  if (currentThreshold > 1.0) {
    return {
      actionType,
      currentThreshold,
      suggestedThreshold: currentThreshold,
      direction: "keep",
      undoRate,
      sampleSize: completedActions,
      confidence,
      reasoning:
        `Action "${actionType}" is intentionally blocked (threshold ${currentThreshold}). ` +
        `Undo rate: ${(undoRate * 100).toFixed(1)}% across ${completedActions} actions. ` +
        `Not auto-adjusting blocked actions.`,
    };
  }

  // Too aggressive: undo rate exceeds 5%
  if (undoRate > AGGRESSIVE_UNDO_RATE) {
    const suggested = Math.min(currentThreshold + RAISE_DELTA, THRESHOLD_CEILING);
    return {
      actionType,
      currentThreshold,
      suggestedThreshold: suggested,
      direction: suggested > currentThreshold ? "raise" : "keep",
      undoRate,
      sampleSize: completedActions,
      confidence,
      reasoning:
        `Undo rate ${(undoRate * 100).toFixed(1)}% exceeds ${AGGRESSIVE_UNDO_RATE * 100}% threshold. ` +
        `${stats.reversed} of ${completedActions} auto-executed actions were undone. ` +
        `Suggesting raise from ${currentThreshold} to ${suggested.toFixed(2)} to reduce false auto-approvals.`,
    };
  }

  // Too conservative: undo rate below 1% with sufficient sample
  if (
    undoRate < CONSERVATIVE_UNDO_RATE &&
    completedActions >= MIN_SAMPLE_SIZE
  ) {
    const suggested = Math.max(currentThreshold - LOWER_DELTA, THRESHOLD_FLOOR);
    return {
      actionType,
      currentThreshold,
      suggestedThreshold: suggested,
      direction: suggested < currentThreshold ? "lower" : "keep",
      undoRate,
      sampleSize: completedActions,
      confidence,
      reasoning:
        `Undo rate ${(undoRate * 100).toFixed(1)}% is below ${CONSERVATIVE_UNDO_RATE * 100}% target. ` +
        `${stats.reversed} of ${completedActions} actions were undone (users almost never override). ` +
        `Suggesting lower from ${currentThreshold} to ${suggested.toFixed(2)} to increase autonomy.`,
    };
  }

  // In the target range (1-3%): well-tuned
  return {
    actionType,
    currentThreshold,
    suggestedThreshold: currentThreshold,
    direction: "keep",
    undoRate,
    sampleSize: completedActions,
    confidence,
    reasoning:
      `Undo rate ${(undoRate * 100).toFixed(1)}% is within target range ` +
      `(${TARGET_UNDO_RATE_LOW * 100}-${TARGET_UNDO_RATE_HIGH * 100}%). ` +
      `${stats.reversed} of ${completedActions} actions undone. Threshold is well-calibrated.`,
  };
}

function computeOverallAssessment(
  results: CalibrationResult[],
): CalibrationSummary["overallAssessment"] {
  const withData = results.filter((r) => r.sampleSize >= MIN_SAMPLE_SIZE);

  if (withData.length === 0) return "insufficient-data";

  const raiseCount = withData.filter((r) => r.direction === "raise").length;
  const lowerCount = withData.filter((r) => r.direction === "lower").length;
  const keepCount = withData.filter((r) => r.direction === "keep").length;

  if (raiseCount > 0 && lowerCount > 0) return "mixed";
  if (raiseCount > keepCount) return "too-aggressive";
  if (lowerCount > keepCount) return "too-conservative";
  return "well-tuned";
}
