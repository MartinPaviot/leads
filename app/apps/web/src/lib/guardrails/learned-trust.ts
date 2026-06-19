/**
 * F005 — Learned Trust Model
 *
 * Adjusts approval thresholds dynamically per tenant based on:
 * 1. Outcome data (F003) — did the agent's actions lead to good results?
 * 2. CLE-11 reversal/bounce (the user undid it, or the send bounced/canceled)
 *    counted as a BAD outcome (read-only join — design §5.2).
 *
 * The model starts at the static HIGH_CONFIDENCE_THRESHOLDS values and moves
 * toward more or less autonomy based on evidence, INCREMENTALLY from the
 * current learned value (not re-derived from the static base each week — so
 * sustained good outcomes compound toward, but never past, the 0.5 floor, and a
 * bad streak walks back toward the 1.0 ceiling). Always bounded to [0.5, 1.0].
 *
 * CLE-16: the learner NEVER writes a key for a HARD_EXCLUDED_ACTIONS class
 * (outbound/irreversible), so even a future code path that forgot the core's
 * hard rules cannot read a lowered bar for money/destructive/outbound. The read
 * paths clamp into [0.5, 1.0] too, so a hand-edited/legacy out-of-range value
 * cannot widen autonomy.
 */

import { db } from "@/db";
import { actionOutcomes, toolCallEvents, outboundEmails } from "@/db/schema";
import { and, eq, sql, inArray } from "drizzle-orm";
import { HIGH_CONFIDENCE_THRESHOLDS, type GuardedAction } from "./approval-mode";
import { HARD_EXCLUDED_ACTIONS, clampThreshold } from "./level-behavior";
import { getTenantSettings, updateTenantSettings } from "@/lib/config/tenant-settings";
import logger from "@/lib/observability/logger";

const MIN_THRESHOLD = 0.5;
const MAX_THRESHOLD = 1.0;
const MIN_OUTCOMES_FOR_ADJUSTMENT = 10;
const STEP = 0.05;

interface TrustStats {
  actionType: string;
  positiveOutcomes: number;
  totalOutcomes: number;
  approvedActions: number;
  totalProposals: number;
}

export async function computeEffectiveThresholds(
  tenantId: string,
): Promise<Record<string, number>> {
  const settings = await getTenantSettings(tenantId);
  const learned = settings.learnedThresholds;

  if (learned && Object.keys(learned).length > 0) {
    // EC-5 — clamp learned values at READ time so a hand-edited / legacy
    // out-of-range value can never widen autonomy beyond [0.5, 1.0].
    const clamped: Record<string, number> = {};
    for (const [k, v] of Object.entries(learned)) clamped[k] = clampThreshold(v);
    return { ...HIGH_CONFIDENCE_THRESHOLDS, ...clamped };
  }

  return { ...HIGH_CONFIDENCE_THRESHOLDS };
}

export function getEffectiveThreshold(
  action: GuardedAction,
  learnedThresholds?: Record<string, number>,
): number {
  if (learnedThresholds?.[action] !== undefined) {
    // EC-5 — read-clamp (see computeEffectiveThresholds).
    return clampThreshold(learnedThresholds[action]);
  }
  return HIGH_CONFIDENCE_THRESHOLDS[action];
}

export async function recalculateThresholds(tenantId: string): Promise<Record<string, number>> {
  const stats = await getOutcomeStats(tenantId);
  // Current learned values are the baseline for the INCREMENTAL update (design
  // §3.2): delta is applied to prev = learned(c) ?? base(c), not always base.
  const settings = await getTenantSettings(tenantId);
  const currentLearned = settings.learnedThresholds ?? {};
  const newThresholds: Record<string, number> = {};

  for (const stat of stats) {
    // AC-7 — the learner writes NO key for the hard-excluded outbound classes.
    // The good/bad signal for them is still computed above (observability) but
    // never produces a learned bar that the core could read low.
    if (HARD_EXCLUDED_ACTIONS.has(stat.actionType as GuardedAction)) continue;

    const baseThreshold =
      HIGH_CONFIDENCE_THRESHOLDS[stat.actionType as GuardedAction] ?? 0.8;

    // prev = current learned (incremental) or the static base on cold start.
    const prev = clampThreshold(currentLearned[stat.actionType] ?? baseThreshold);

    let threshold = prev;
    let goodRate = 0;

    if (stat.totalOutcomes >= MIN_OUTCOMES_FOR_ADJUSTMENT) {
      goodRate = stat.positiveOutcomes / stat.totalOutcomes;
      // Dead-band [0.5, 0.8): no move (anti-oscillation, EC-2).
      if (goodRate >= 0.8) threshold = prev - STEP; // good outcomes LOWER the bar (AC-2)
      else if (goodRate < 0.5) threshold = prev + STEP; // bad outcomes RAISE the bar (AC-3)
    }

    threshold = Math.round(clampThreshold(threshold) * 100) / 100;
    newThresholds[stat.actionType] = threshold;

    // AC-20 — observability: one structured line per CHANGED class.
    if (threshold !== prev) {
      logger.info("learned-threshold.update", {
        tenantId,
        actionType: stat.actionType,
        oldThreshold: prev,
        newThreshold: threshold,
        sampleSize: stat.totalOutcomes,
        goodRate: Math.round(goodRate * 100) / 100,
      });
    }
  }

  await updateTenantSettings(tenantId, {
    learnedThresholds: newThresholds,
    trustStatsUpdatedAt: new Date().toISOString(),
  });

  return newThresholds;
}

async function getOutcomeStats(tenantId: string): Promise<TrustStats[]> {
  // F003 — resolved outcome rows: a row with positivity > 0.3 is a good outcome.
  const rows = await db
    .select({
      actionType: actionOutcomes.actionType,
      totalOutcomes: sql<number>`count(*)`.as("total"),
      positiveOutcomes: sql<number>`count(*) filter (where ${actionOutcomes.positivity} > 0.3)`.as("positive"),
    })
    .from(actionOutcomes)
    .where(
      and(
        eq(actionOutcomes.tenantId, tenantId),
        inArray(actionOutcomes.status, ["resolved", "expired"]),
      ),
    )
    .groupBy(actionOutcomes.actionType);

  // Normalize the F003 outcome vocabulary (send_followup / create_task / …) to the
  // GuardedAction vocabulary the learner + decideAction key on. WITHOUT this, an
  // F003 "send_followup" row would (a) bypass the HARD_EXCLUDED_ACTIONS skip
  // (it isn't literally "email-send") and (b) write a learned key buildEffectiveThresholdMap
  // never reads. Normalizing first makes the exclusion bite on real vocab AND makes a
  // learnable bar (task-create / deal-stage-change) actually reach the core.
  const stats = new Map<string, TrustStats>();
  for (const r of rows) {
    const actionType = normalizeToGuardedAction(r.actionType);
    const existing = stats.get(actionType);
    if (existing) {
      existing.positiveOutcomes += Number(r.positiveOutcomes);
      existing.totalOutcomes += Number(r.totalOutcomes);
    } else {
      stats.set(actionType, {
        actionType,
        positiveOutcomes: Number(r.positiveOutcomes),
        totalOutcomes: Number(r.totalOutcomes),
        approvedActions: 0,
        totalProposals: 0,
      });
    }
  }

  // CLE-11 bad-outcome signal (design §5.2) — READ-ONLY joins. Each row maps to
  // an action class and counts as a BAD outcome (decrements the good count and
  // increments the total). A good-then-reverted action nets bad: the reversal
  // is an explicit user undo, a stronger signal than the F003 positivity
  // heuristic. CLE-16 never writes tool_call_events / outbound_emails.
  const badRows = await getBadSignalCounts(tenantId);
  for (const { actionType, badCount } of badRows) {
    const existing = stats.get(actionType);
    if (existing) {
      // Add the reversals/bounces as bad outcomes. The good count is left as-is
      // (those bad events are NOT positive), and the total grows by badCount —
      // so a previously-all-good class with reversals drops below the good-rate
      // bands. (A good F003 row + a later reversal => the reversal adds a bad
      // outcome on top, dominating the rate.)
      existing.totalOutcomes += badCount;
    } else {
      stats.set(actionType, {
        actionType,
        positiveOutcomes: 0,
        totalOutcomes: badCount,
        approvedActions: 0,
        totalProposals: 0,
      });
    }
  }

  return Array.from(stats.values());
}

/**
 * Read-only aggregation of CLE-11 "the agent's action went wrong" signals,
 * mapped to the F005 actionType vocabulary (design §5.2):
 *   - reverted chat/PAR actions: tool_call_events WHERE status='reverted'
 *     (toolName → actionType via TOOL_NAME_TO_ACTION_TYPE)
 *   - canceled/bounced outbound: outbound_emails WHERE status IN
 *     ('canceled','bounced') -> "email-send" (the hard-excluded outbound class;
 *     counted for observability only, never produces a learned key).
 * Never writes either table (AC-24).
 */
async function getBadSignalCounts(
  tenantId: string,
): Promise<Array<{ actionType: string; badCount: number }>> {
  const out = new Map<string, number>();

  const revertedRows = await db
    .select({
      toolName: toolCallEvents.toolName,
      n: sql<number>`count(*)`.as("n"),
    })
    .from(toolCallEvents)
    .where(
      and(
        eq(toolCallEvents.tenantId, tenantId),
        eq(toolCallEvents.status, "reverted"),
      ),
    )
    .groupBy(toolCallEvents.toolName);

  for (const r of revertedRows) {
    const actionType = TOOL_NAME_TO_ACTION_TYPE[r.toolName] ?? r.toolName;
    out.set(actionType, (out.get(actionType) ?? 0) + Number(r.n));
  }

  const [{ n: outboundBad } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)`.as("n") })
    .from(outboundEmails)
    .where(
      and(
        eq(outboundEmails.tenantId, tenantId),
        inArray(outboundEmails.status, ["canceled", "bounced"]),
      ),
    );

  const outboundCount = Number(outboundBad);
  if (outboundCount > 0) {
    // Maps to the outbound GuardedAction class. This class is hard-excluded, so
    // it never produces a learned key (the bad count is computed for
    // completeness/observability only — design §5.2 last paragraph).
    out.set("email-send", (out.get("email-send") ?? 0) + outboundCount);
  }

  return Array.from(out.entries()).map(([actionType, badCount]) => ({ actionType, badCount }));
}

/**
 * Bridge CLE-11 tool names to the `GuardedAction` vocabulary the learner +
 * decideAction key on (so a learned key connects to
 * `decideAction`'s `extra.learnedThresholds[actionKey]` lookup). Best-effort;
 * unknown tools fall back to the raw tool name (which won't match a learnable
 * class, so it's inert).
 */
const TOOL_NAME_TO_ACTION_TYPE: Record<string, string> = {
  createContact: "contact-create",
  updateContact: "contact-update",
  createTask: "task-create",
  updateDeal: "deal-stage-change",
  advanceDeal: "deal-stage-change",
};

/**
 * Bridge the F003 outcome vocabulary (`action_outcomes.actionType`, written by
 * the agent-reactor: send_followup / draft_reply / advance_deal / create_task /
 * create_deal / enroll_sequence) to the `GuardedAction` set. The outbound verbs
 * map to the hard-excluded classes so the learner skips them; create_deal has no
 * GuardedAction threshold key and is left raw (inert — never read by the core).
 */
const F003_TO_GUARDED_ACTION: Record<string, string> = {
  send_followup: "email-send",
  draft_reply: "email-reply",
  advance_deal: "deal-stage-change",
  create_task: "task-create",
  enroll_sequence: "sequence-enrollment",
};

function normalizeToGuardedAction(actionType: string): string {
  return F003_TO_GUARDED_ACTION[actionType] ?? actionType;
}
