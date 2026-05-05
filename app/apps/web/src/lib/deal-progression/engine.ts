/**
 * Autonomous Deal Progression Engine
 *
 * Monitors deals in the pipeline, detects progression signals from
 * activities (emails, meetings, tasks), and either suggests or
 * executes stage changes based on the tenant's trust/approval mode.
 *
 * Signal detection:
 * - Meeting completed with positive sentiment -> qualify to demo
 * - Demo completed + follow-up sent -> demo to proposal
 * - Proposal sent + positive reply -> proposal to negotiation
 * - Contract signed / verbal yes -> negotiation to won
 * - 30 days no activity -> flag as stalled
 * - Negative reply + no follow-up in 14d -> flag at risk
 *
 * Progression logic:
 * 1. Gather recent activities for the deal (emails, meetings, tasks)
 * 2. Analyze sentiment and intent patterns via signal detectors
 * 3. Match against progression rules
 * 4. If trust mode allows -> auto-progress and log
 * 5. If not -> create a "suggested progression" notification
 */

import { db } from "@/db";
import {
  activities,
  deals,
  notifications,
  users,
} from "@/db/schema";
import { eq, and, desc, gte, ne } from "drizzle-orm";
import { getTenantSettings, type PipelineStageDef } from "@/lib/config/tenant-settings";
import {
  readApprovalMode,
  enforceAgentApprovalMode,
  type ApprovalModeV2,
} from "@/lib/guardrails/approval-mode";
import { recordAgentAction } from "@/lib/agents/agent-actions";
import { recordAutonomyEvent } from "@/lib/guardrails/trust-score";
import { detectAllSignals, type Signal, type SignalType } from "./signals";
import logger from "@/lib/observability/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgressionResult {
  shouldProgress: boolean;
  fromStage: string;
  toStage: string;
  confidence: number;
  signals: Signal[];
  reasoning: string;
  /** True when the signal is a flag (stalled/at-risk) rather than a
   *  forward stage move. The cron handles these differently. */
  isFlag: boolean;
  flagType?: "stalled" | "at_risk";
}

export interface ExecutionResult {
  executed: boolean;
  queued: boolean;
  actionId?: string;
  reason: string;
}

export interface BatchResult {
  tenantId: string;
  evaluated: number;
  progressed: number;
  suggested: number;
  flagged: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Progression rules — maps current stage to required signals and target stage
// ---------------------------------------------------------------------------

export interface ProgressionRule {
  fromStage: string;
  toStage: string;
  /** At least one of these signal groups must be fully present. Each
   *  group is an AND-set; the groups themselves are OR'd. */
  requiredSignals: SignalType[][];
  /** Minimum combined confidence (average of matched signals). */
  minConfidence: number;
  /** Optional boost signals — if present, add to confidence. */
  boostSignals?: SignalType[];
  /** Confidence bonus per boost signal present. */
  boostPerSignal?: number;
}

/**
 * Default progression rules. These are applied when the tenant's
 * pipeline stages map to the standard Elevay enum. Tenants with
 * custom stages can override via tenant settings in a future release.
 */
export const PROGRESSION_RULES: ProgressionRule[] = [
  // lead -> qualification: first meeting scheduled/completed
  {
    fromStage: "lead",
    toStage: "qualification",
    requiredSignals: [
      ["first_meeting_scheduled"],
      ["meeting_completed_positive"],
    ],
    minConfidence: 0.7,
    boostSignals: ["champion_engagement"],
    boostPerSignal: 0.05,
  },
  // qualification -> demo: meeting completed positive sentiment
  {
    fromStage: "qualification",
    toStage: "demo",
    requiredSignals: [
      ["meeting_completed_positive"],
      ["multiple_positive_interactions"],
    ],
    minConfidence: 0.75,
    boostSignals: ["champion_engagement"],
    boostPerSignal: 0.05,
  },
  // demo -> proposal: demo completed + follow-up sent, or proposal sent
  {
    fromStage: "demo",
    toStage: "proposal",
    requiredSignals: [
      ["follow_up_sent_after_demo"],
      ["proposal_sent"],
    ],
    minConfidence: 0.7,
    boostSignals: ["multiple_positive_interactions", "champion_engagement"],
    boostPerSignal: 0.05,
  },
  // trial -> proposal: same as demo -> proposal
  {
    fromStage: "trial",
    toStage: "proposal",
    requiredSignals: [
      ["follow_up_sent_after_demo"],
      ["proposal_sent"],
    ],
    minConfidence: 0.7,
    boostSignals: ["multiple_positive_interactions"],
    boostPerSignal: 0.05,
  },
  // proposal -> negotiation: positive reply to proposal
  {
    fromStage: "proposal",
    toStage: "negotiation",
    requiredSignals: [["positive_reply_to_proposal"]],
    minConfidence: 0.8,
    boostSignals: ["multiple_positive_interactions", "champion_engagement"],
    boostPerSignal: 0.05,
  },
  // negotiation -> won: contract signed or verbal yes
  {
    fromStage: "negotiation",
    toStage: "won",
    requiredSignals: [["contract_or_verbal_yes"]],
    minConfidence: 0.85,
  },
];

/**
 * Flag rules — these don't move the deal but create alerts.
 */
export interface FlagRule {
  signalType: SignalType;
  flagType: "stalled" | "at_risk";
  /** Stages where this flag applies. Empty means all. */
  applicableStages: string[];
}

export const FLAG_RULES: FlagRule[] = [
  {
    signalType: "stalled_no_activity",
    flagType: "stalled",
    applicableStages: [], // any stage
  },
  {
    signalType: "at_risk_negative",
    flagType: "at_risk",
    applicableStages: [], // any stage
  },
];

// ---------------------------------------------------------------------------
// Core evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a deal should progress to its next stage based on
 * recent activity signals. Returns the evaluation result — caller
 * decides whether to execute.
 */
export async function evaluateDealProgression(
  dealId: string,
  tenantId: string,
): Promise<ProgressionResult | null> {
  // 1. Load the deal
  const [deal] = await db
    .select({
      id: deals.id,
      name: deals.name,
      stage: deals.stage,
      companyId: deals.companyId,
      updatedAt: deals.updatedAt,
    })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
    .limit(1);

  if (!deal || !deal.stage) return null;

  // Skip terminal stages
  if (deal.stage === "won" || deal.stage === "lost") return null;

  // 2. Load tenant pipeline configuration
  const settings = await getTenantSettings(tenantId);
  const stages: PipelineStageDef[] = settings.pipelineStages || [];

  // Build ordered stage list for forward-progression lookup
  const orderedStages = stages.length > 0
    ? stages.filter((s) => s.category !== "done")
    : defaultOrderedStages();

  const stageIndex = new Map(
    orderedStages.map((s, i) => [s.name.toLowerCase(), i]),
  );

  const currentIdx = stageIndex.get(deal.stage.toLowerCase());
  if (currentIdx === undefined) return null;

  // 3. Load recent activities (last 30 days — wide window for signal detection)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const recentActivities = await db
    .select({
      id: activities.id,
      activityType: activities.activityType,
      channel: activities.channel,
      direction: activities.direction,
      occurredAt: activities.occurredAt,
      sentiment: activities.sentiment,
      summary: activities.summary,
      metadata: activities.metadata,
      intent: activities.intent,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "deal"),
        eq(activities.entityId, dealId),
        gte(activities.occurredAt, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(50);

  // Also load company-level activities if the deal has a company
  if (deal.companyId) {
    const companyActivities = await db
      .select({
        id: activities.id,
        activityType: activities.activityType,
        channel: activities.channel,
        direction: activities.direction,
        occurredAt: activities.occurredAt,
        sentiment: activities.sentiment,
        summary: activities.summary,
        metadata: activities.metadata,
        intent: activities.intent,
      })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, tenantId),
          eq(activities.entityType, "company"),
          eq(activities.entityId, deal.companyId),
          gte(activities.occurredAt, thirtyDaysAgo),
        ),
      )
      .orderBy(desc(activities.occurredAt))
      .limit(20);

    // Deduplicate by id (in case an activity is linked to both)
    const existingIds = new Set(recentActivities.map((a) => a.id));
    for (const ca of companyActivities) {
      if (!existingIds.has(ca.id)) {
        recentActivities.push(ca);
      }
    }
  }

  // 4. Detect signals
  // Cast metadata from `unknown` (Drizzle jsonb inference) to the shape
  // our signal detectors expect. The runtime value is always an object.
  const signals = detectAllSignals(
    recentActivities as import("./signals").ActivityRecord[],
  );

  if (signals.length === 0) return null;

  // 5. Check flag rules first (stalled / at_risk)
  for (const flagRule of FLAG_RULES) {
    const flagSignal = signals.find((s) => s.type === flagRule.signalType);
    if (!flagSignal) continue;

    // Check stage applicability
    if (
      flagRule.applicableStages.length > 0 &&
      !flagRule.applicableStages.includes(deal.stage.toLowerCase())
    ) {
      continue;
    }

    return {
      shouldProgress: false,
      fromStage: deal.stage,
      toStage: deal.stage, // stays in place
      confidence: flagSignal.confidence,
      signals: [flagSignal],
      reasoning: `Deal flagged as ${flagRule.flagType}: ${flagSignal.evidence}`,
      isFlag: true,
      flagType: flagRule.flagType,
    };
  }

  // 6. Check progression rules
  const currentStage = deal.stage.toLowerCase();
  const applicableRules = PROGRESSION_RULES.filter(
    (r) => r.fromStage === currentStage,
  );

  for (const rule of applicableRules) {
    // Check that the target stage exists in the pipeline
    const targetIdx = stageIndex.get(rule.toStage.toLowerCase());
    if (targetIdx === undefined) continue;
    // Don't allow backward progression
    if (targetIdx <= currentIdx) continue;

    // Check required signals (OR of AND-groups)
    let matchedGroup: SignalType[] | null = null;
    for (const group of rule.requiredSignals) {
      const allPresent = group.every((signalType) =>
        signals.some((s) => s.type === signalType),
      );
      if (allPresent) {
        matchedGroup = group;
        break;
      }
    }

    if (!matchedGroup) continue;

    // Calculate confidence from matched signals
    const matchedSignals = signals.filter((s) =>
      matchedGroup!.includes(s.type),
    );
    let avgConfidence =
      matchedSignals.reduce((sum, s) => sum + s.confidence, 0) /
      matchedSignals.length;

    // Apply boost signals
    if (rule.boostSignals && rule.boostPerSignal) {
      for (const boostType of rule.boostSignals) {
        if (signals.some((s) => s.type === boostType)) {
          avgConfidence += rule.boostPerSignal;
        }
      }
    }

    // Clamp to [0, 1]
    avgConfidence = Math.min(1, Math.max(0, avgConfidence));

    if (avgConfidence < rule.minConfidence) continue;

    // Collect all relevant signals for this rule (matched + boosts found)
    const relevantSignals = signals.filter(
      (s) =>
        matchedGroup!.includes(s.type) ||
        (rule.boostSignals && rule.boostSignals.includes(s.type)),
    );

    const reasoning = buildReasoning(deal.name, currentStage, rule.toStage, relevantSignals);

    return {
      shouldProgress: true,
      fromStage: deal.stage,
      toStage: rule.toStage,
      confidence: avgConfidence,
      signals: relevantSignals,
      reasoning,
      isFlag: false,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Execute (or queue) a deal progression based on the tenant's approval
 * mode. Handles the full lifecycle: approval check, deal update,
 * activity log, agent-action record, trust event, notifications.
 */
export async function executeProgression(
  dealId: string,
  tenantId: string,
  result: ProgressionResult,
): Promise<ExecutionResult> {
  const settings = await getTenantSettings(tenantId);
  const mode: ApprovalModeV2 = readApprovalMode(settings);

  // For flags, always create a notification — never auto-execute
  if (result.isFlag) {
    await createFlagNotification(dealId, tenantId, result);
    return {
      executed: false,
      queued: false,
      reason: `Flag created: ${result.flagType} — ${result.reasoning}`,
    };
  }

  // Check approval mode for deal-stage-change
  const decision = enforceAgentApprovalMode({
    mode,
    action: "deal-stage-change",
    confidence: result.confidence,
    trustScore: settings.trustScore,
  });

  if (decision.allowed) {
    // Auto-execute the progression
    return await executeDealStageChange(dealId, tenantId, result);
  }

  // Not allowed — queue as suggestion
  await createProgressionSuggestion(dealId, tenantId, result, decision.reason);

  // Record agent action for undo capability even for suggestions
  const { id: actionId } = await recordAgentAction({
    tenantId,
    actionType: "deal-stage-change-suggested",
    payload: {
      dealId,
      fromStage: result.fromStage,
      toStage: result.toStage,
      confidence: result.confidence,
      signals: result.signals.map((s) => ({
        type: s.type,
        confidence: s.confidence,
        evidence: s.evidence,
      })),
      reasoning: result.reasoning,
    },
  });

  return {
    executed: false,
    queued: true,
    actionId,
    reason: decision.reason,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function executeDealStageChange(
  dealId: string,
  tenantId: string,
  result: ProgressionResult,
): Promise<ExecutionResult> {
  try {
    // Update the deal stage
    await db
      .update(deals)
      .set({
        stage: result.toStage as typeof deals.$inferInsert.stage,
        updatedAt: new Date(),
      })
      .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)));

    // Log the stage change as an activity
    await db.insert(activities).values({
      tenantId,
      actorType: "system",
      entityType: "deal",
      entityId: dealId,
      activityType: "deal_stage_changed",
      summary: `Auto-progressed from ${result.fromStage} to ${result.toStage}: ${result.reasoning}`,
      metadata: {
        oldStage: result.fromStage,
        newStage: result.toStage,
        confidence: result.confidence,
        signals: result.signals.map((s) => s.type),
        triggeredBy: "deal_progression_engine",
      },
    });

    // Record the agent action for undo capability
    const { id: actionId } = await recordAgentAction({
      tenantId,
      actionType: "deal-stage-change",
      payload: {
        dealId,
        fromStage: result.fromStage,
        toStage: result.toStage,
        confidence: result.confidence,
        signals: result.signals.map((s) => ({
          type: s.type,
          confidence: s.confidence,
          evidence: s.evidence,
        })),
        reasoning: result.reasoning,
      },
      reversibleForMs: 24 * 60 * 60 * 1000, // 24h undo window
    });

    // Record positive trust event (agent acted, user can approve or undo)
    await recordAutonomyEvent({
      tenantId,
      eventType: "approved_no_edit",
      entityRef: `deal:${dealId}`,
      reason: `Deal auto-progressed ${result.fromStage} -> ${result.toStage} (confidence: ${result.confidence.toFixed(2)})`,
    }).catch((err) =>
      logger.warn("deal-progression: trust event write failed", { err }),
    );

    return {
      executed: true,
      queued: false,
      actionId,
      reason: `Auto-executed: ${result.reasoning}`,
    };
  } catch (err) {
    logger.warn("deal-progression: executeDealStageChange failed", {
      dealId,
      tenantId,
      err,
    });
    return {
      executed: false,
      queued: false,
      reason: `Execution failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

async function createProgressionSuggestion(
  dealId: string,
  tenantId: string,
  result: ProgressionResult,
  queueReason: string,
): Promise<void> {
  const tenantUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .limit(5);

  for (const user of tenantUsers) {
    await db.insert(notifications).values({
      tenantId,
      userId: user.id,
      type: "deal_risk",
      title: `${result.fromStage} -> ${result.toStage}: Ready to progress?`,
      body: `${result.reasoning} (confidence: ${(result.confidence * 100).toFixed(0)}%). ${queueReason}`,
      entityType: "deal",
      entityId: dealId,
    });
  }
}

async function createFlagNotification(
  dealId: string,
  tenantId: string,
  result: ProgressionResult,
): Promise<void> {
  // Load deal name for the notification
  const [deal] = await db
    .select({ name: deals.name })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
    .limit(1);

  const dealName = deal?.name || "Unknown deal";
  const flagLabel = result.flagType === "stalled" ? "Stalled" : "At Risk";

  const tenantUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .limit(5);

  for (const user of tenantUsers) {
    await db.insert(notifications).values({
      tenantId,
      userId: user.id,
      type: "deal_risk",
      title: `${dealName}: ${flagLabel}`,
      body: result.reasoning,
      entityType: "deal",
      entityId: dealId,
    });
  }

  // Record as agent action for audit trail
  await recordAgentAction({
    tenantId,
    actionType: `deal-flag-${result.flagType}`,
    payload: {
      dealId,
      dealName,
      flagType: result.flagType,
      confidence: result.confidence,
      signals: result.signals.map((s) => ({
        type: s.type,
        evidence: s.evidence,
      })),
      reasoning: result.reasoning,
    },
  });
}

function buildReasoning(
  dealName: string,
  fromStage: string,
  toStage: string,
  signals: Signal[],
): string {
  const signalSummary = signals
    .map((s) => s.evidence)
    .join("; ");

  return `${dealName}: signals detected for ${fromStage} -> ${toStage} (${signalSummary})`;
}

/**
 * Default stage ordering when the tenant has no custom pipeline.
 * Matches the dealStageEnum in db/schema.ts.
 */
function defaultOrderedStages(): PipelineStageDef[] {
  return [
    { name: "lead", category: "in_progress" },
    { name: "qualification", category: "in_progress" },
    { name: "demo", category: "in_progress" },
    { name: "trial", category: "in_progress" },
    { name: "proposal", category: "in_progress" },
    { name: "negotiation", category: "in_progress" },
  ];
}

// ---------------------------------------------------------------------------
// Batch evaluation — called by the cron
// ---------------------------------------------------------------------------

/**
 * Evaluate all active deals for a single tenant. Returns a summary of
 * what happened. This is the function the cron route calls per tenant.
 */
export async function evaluateTenantDeals(
  tenantId: string,
): Promise<BatchResult> {
  const result: BatchResult = {
    tenantId,
    evaluated: 0,
    progressed: 0,
    suggested: 0,
    flagged: 0,
    errors: 0,
  };

  try {
    // Fetch active deals (not won/lost), most recently updated first
    const activeDeals = await db
      .select({
        id: deals.id,
        stage: deals.stage,
      })
      .from(deals)
      .where(
        and(
          eq(deals.tenantId, tenantId),
          ne(deals.stage, "won"),
          ne(deals.stage, "lost"),
        ),
      )
      .orderBy(desc(deals.updatedAt))
      .limit(50); // Batch limit for cost control

    for (const deal of activeDeals) {
      if (!deal.stage) continue;

      try {
        const evaluation = await evaluateDealProgression(deal.id, tenantId);
        if (!evaluation) continue;

        result.evaluated++;

        const execution = await executeProgression(deal.id, tenantId, evaluation);

        if (evaluation.isFlag) {
          result.flagged++;
        } else if (execution.executed) {
          result.progressed++;
        } else if (execution.queued) {
          result.suggested++;
        }
      } catch (err) {
        result.errors++;
        logger.warn(`deal-progression: failed to evaluate deal ${deal.id}`, {
          tenantId,
          dealId: deal.id,
          err,
        });
      }
    }
  } catch (err) {
    logger.warn("deal-progression: tenant batch failed", { tenantId, err });
  }

  return result;
}
