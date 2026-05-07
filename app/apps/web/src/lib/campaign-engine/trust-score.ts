import { db } from "@/db";
import { systemTrustScore } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { TrustEventType, TrustScoreState, AutonomyLevel } from "./types";

const EVENT_DELTAS: Record<TrustEventType, number> = {
  approved_without_edit: 2,
  approved_with_minor_edit: 1,
  rejected: -3,
  email_positive_reply: 5,
  email_negative_reply: -2,
  meeting_booked: 10,
  factual_error: -5,
  wrong_person: -10,
  escalation_warranted: 3,
  escalation_unnecessary: -1,
};

const DOWNGRADE_THRESHOLD = 40;
const UPGRADE_THRESHOLD = 80;
const MIN_ACTIONS_FOR_SCORE = 10;

export async function updateTrustScore(
  tenantId: string,
  eventType: TrustEventType
): Promise<TrustScoreState> {
  const delta = EVENT_DELTAS[eventType] || 0;

  // Get current state
  let [current] = await db
    .select()
    .from(systemTrustScore)
    .where(eq(systemTrustScore.tenantId, tenantId))
    .limit(1);

  if (!current) {
    // Initialize
    await db.insert(systemTrustScore).values({ tenantId, overall: 50 });
    [current] = await db
      .select()
      .from(systemTrustScore)
      .where(eq(systemTrustScore.tenantId, tenantId))
      .limit(1);
  }

  const newScore = Math.max(0, Math.min(100, (current.overall || 50) + delta));
  const newActionsCount = (current.actionsCount || 0) + 1;
  const newApprovals = eventType === "approved_without_edit"
    ? (current.approvalsWithoutEdit || 0) + 1
    : (current.approvalsWithoutEdit || 0);
  const newRejections = eventType === "rejected"
    ? (current.rejections || 0) + 1
    : (current.rejections || 0);

  await db
    .update(systemTrustScore)
    .set({
      overall: newScore,
      actionsCount: newActionsCount,
      approvalsWithoutEdit: newApprovals,
      rejections: newRejections,
      lastUpdatedAt: new Date(),
    })
    .where(eq(systemTrustScore.tenantId, tenantId));

  return buildTrustState(newScore, newActionsCount, newApprovals, newRejections, current);
}

export async function getTrustScore(tenantId: string): Promise<TrustScoreState> {
  const [current] = await db
    .select()
    .from(systemTrustScore)
    .where(eq(systemTrustScore.tenantId, tenantId))
    .limit(1);

  if (!current) {
    return {
      overall: 50,
      perPlaybook: {},
      perAction: {},
      actionsCount: 0,
      approvalsWithoutEdit: 0,
      rejections: 0,
      trend: "stable",
      suggestedLevel: "copilot",
      readyForUpgrade: false,
      shouldDowngrade: false,
    };
  }

  return buildTrustState(
    current.overall || 50,
    current.actionsCount || 0,
    current.approvalsWithoutEdit || 0,
    current.rejections || 0,
    current
  );
}

function buildTrustState(
  overall: number,
  actionsCount: number,
  approvalsWithoutEdit: number,
  rejections: number,
  dbRow: typeof systemTrustScore.$inferSelect
): TrustScoreState {
  const shouldDowngrade = overall < DOWNGRADE_THRESHOLD && actionsCount >= MIN_ACTIONS_FOR_SCORE;
  const readyForUpgrade = overall >= UPGRADE_THRESHOLD && actionsCount >= MIN_ACTIONS_FOR_SCORE;

  let suggestedLevel: AutonomyLevel = "copilot";
  if (overall >= 80) suggestedLevel = "autonomous";
  else if (overall >= 65) suggestedLevel = "guided";

  // Trend: compare to 7 days ago (simplified: based on recent approval rate)
  const approvalRate = actionsCount > 0 ? approvalsWithoutEdit / actionsCount : 0;
  let trend: "rising" | "stable" | "falling" = "stable";
  if (approvalRate > 0.85 && overall > 60) trend = "rising";
  else if (rejections > actionsCount * 0.2) trend = "falling";

  return {
    overall,
    perPlaybook: (dbRow.perPlaybook || {}) as Record<string, number>,
    perAction: (dbRow.perAction || {}) as Record<string, number>,
    actionsCount,
    approvalsWithoutEdit,
    rejections,
    trend,
    suggestedLevel,
    readyForUpgrade,
    shouldDowngrade,
  };
}
