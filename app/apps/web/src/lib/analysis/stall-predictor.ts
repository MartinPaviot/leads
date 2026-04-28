/**
 * Deal Stall Predictor
 *
 * Analyzes historical patterns to predict which active deals will
 * stall in the next 7 days. Uses temporal pattern matching:
 *
 * Stall indicators (learned from closed deals):
 * - Current time-in-stage exceeds the 75th percentile for that stage
 * - Activity frequency dropped by >50% compared to previous 2 weeks
 * - Last email was outbound with no reply (one-sided conversation)
 * - No meeting scheduled in next 14 days
 * - Contact's buyer intent score is declining
 *
 * The predictor doesn't just flag -- it suggests interventions:
 * - "Schedule a check-in call with Sarah (champion)"
 * - "Send the case study they asked about 2 weeks ago"
 * - "Propose a mutual action plan to reset momentum"
 *
 * Pure math -- no LLM. Analyze time-in-stage distributions from
 * historical deals, compute z-scores for current deals, flag outliers.
 */

import { db } from "@/db";
import { deals, activities, contacts } from "@/db/schema";
import { and, eq, desc, sql, notInArray, gte } from "drizzle-orm";
import { scoreBuyerIntent } from "@/lib/scoring/buyer-intent";

// ── Types ────────────────────────────────────────────────────

export interface StallIndicator {
  type: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

export interface SuggestedIntervention {
  action: string;
  priority: number;
  reasoning: string;
}

export interface StallPrediction {
  dealId: string;
  dealName: string;
  stallProbability: number; // 0-1
  daysUntilLikelyStall: number;
  indicators: StallIndicator[];
  suggestedInterventions: SuggestedIntervention[];
}

// ── Configuration ────────────────────────────────────────────

/**
 * Default stage duration benchmarks (in days) used when the tenant
 * has too few closed deals to compute empirical percentiles. Derived
 * from typical B2B SaaS founder-led sales cycles.
 */
const DEFAULT_STAGE_P75: Record<string, number> = {
  lead: 14,
  qualification: 21,
  demo: 14,
  trial: 30,
  proposal: 14,
  negotiation: 21,
};

/**
 * How much each indicator contributes to overall stall probability.
 * These are additive weights capped at 1.0. Higher weight = stronger
 * stall signal.
 */
const INDICATOR_WEIGHTS = {
  time_in_stage: 0.30,
  activity_drop: 0.25,
  one_sided_email: 0.15,
  no_upcoming_meeting: 0.10,
  intent_cooling: 0.15,
  no_recent_activity: 0.05,
} as const;

// ── Helpers ──────────────────────────────────────────────────

/**
 * Compute the empirical 75th percentile of stage durations (in days)
 * for each stage from the tenant's closed deals. Falls back to defaults
 * when sample size is too small.
 */
async function computeStageP75(
  tenantId: string,
): Promise<Record<string, number>> {
  // Fetch all closed deals with their stage change timeline.
  // Since we don't have a stage_changed_at column, we reconstruct
  // from deal_stage_changed activities.
  const stageChanges = await db
    .select({
      entityId: activities.entityId,
      metadata: activities.metadata,
      occurredAt: activities.occurredAt,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "deal"),
        eq(activities.activityType, "deal_stage_changed"),
      ),
    )
    .orderBy(activities.occurredAt);

  // Group stage transitions by deal and compute time-in-stage
  const stageDurations: Record<string, number[]> = {};

  const dealTransitions = new Map<
    string,
    Array<{ stage: string; at: Date }>
  >();

  for (const change of stageChanges) {
    const meta = (change.metadata || {}) as {
      oldStage?: string;
      newStage?: string;
    };
    if (!meta.newStage || !change.occurredAt || !change.entityId) continue;

    const existing = dealTransitions.get(change.entityId) || [];
    existing.push({ stage: meta.newStage, at: change.occurredAt });
    dealTransitions.set(change.entityId, existing);
  }

  for (const transitions of dealTransitions.values()) {
    // Sort by date
    transitions.sort((a, b) => a.at.getTime() - b.at.getTime());

    for (let i = 0; i < transitions.length - 1; i++) {
      const stage = transitions[i].stage;
      const daysInStage = Math.max(
        1,
        Math.round(
          (transitions[i + 1].at.getTime() - transitions[i].at.getTime()) /
            (24 * 60 * 60 * 1000),
        ),
      );

      if (!stageDurations[stage]) stageDurations[stage] = [];
      stageDurations[stage].push(daysInStage);
    }
  }

  // Compute P75 for each stage
  const p75: Record<string, number> = { ...DEFAULT_STAGE_P75 };

  for (const [stage, durations] of Object.entries(stageDurations)) {
    if (durations.length < 5) continue; // Need at least 5 observations

    const sorted = [...durations].sort((a, b) => a - b);
    const idx75 = Math.floor(sorted.length * 0.75);
    p75[stage] = sorted[idx75];
  }

  return p75;
}

/**
 * Check if the last email exchange was one-sided (we sent, no reply).
 */
function isOneSidedEmail(
  recentActivities: Array<{
    activityType: string | null;
    direction: string | null;
    occurredAt: Date | null;
  }>,
): { oneSided: boolean; daysSinceOutbound: number } {
  // Find the most recent email activity
  const lastOutbound = recentActivities.find(
    (a) =>
      (a.activityType === "email_sent" ||
        a.activityType === "sequence_step_sent") &&
      a.direction === "outbound",
  );
  const lastInbound = recentActivities.find(
    (a) =>
      (a.activityType === "email_received" ||
        a.activityType === "email_replied") &&
      a.direction === "inbound",
  );

  if (!lastOutbound?.occurredAt) {
    return { oneSided: false, daysSinceOutbound: 0 };
  }

  const daysSinceOutbound = Math.round(
    (Date.now() - lastOutbound.occurredAt.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (!lastInbound?.occurredAt) {
    // All outbound, zero inbound
    return { oneSided: true, daysSinceOutbound };
  }

  // One-sided if last outbound is more recent than last inbound AND
  // the outbound was sent at least 3 days ago (give time to reply)
  const outboundIsMoreRecent =
    lastOutbound.occurredAt.getTime() > lastInbound.occurredAt.getTime();

  return {
    oneSided: outboundIsMoreRecent && daysSinceOutbound >= 3,
    daysSinceOutbound,
  };
}

/**
 * Compare activity volume in the last 14 days vs the previous 14 days.
 * Returns the drop percentage (0-1 where 1 = 100% drop).
 */
function computeActivityDrop(
  activityDates: Date[],
  now: Date,
): { dropPercent: number; recentCount: number; previousCount: number } {
  const fourteenDaysAgo = new Date(
    now.getTime() - 14 * 24 * 60 * 60 * 1000,
  );
  const twentyEightDaysAgo = new Date(
    now.getTime() - 28 * 24 * 60 * 60 * 1000,
  );

  const recentCount = activityDates.filter(
    (d) => d.getTime() >= fourteenDaysAgo.getTime(),
  ).length;
  const previousCount = activityDates.filter(
    (d) =>
      d.getTime() >= twentyEightDaysAgo.getTime() &&
      d.getTime() < fourteenDaysAgo.getTime(),
  ).length;

  if (previousCount === 0) {
    return {
      dropPercent: recentCount === 0 ? 1 : 0,
      recentCount,
      previousCount,
    };
  }

  const dropPercent = Math.max(
    0,
    (previousCount - recentCount) / previousCount,
  );
  return { dropPercent, recentCount, previousCount };
}

/**
 * Check if there are any upcoming meetings in the next 14 days.
 */
async function hasUpcomingMeeting(
  tenantId: string,
  entityIds: string[],
  now: Date,
): Promise<boolean> {
  if (entityIds.length === 0) return false;

  const fourteenDaysFromNow = new Date(
    now.getTime() + 14 * 24 * 60 * 60 * 1000,
  );

  for (const entityId of entityIds) {
    const [meeting] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, tenantId),
          eq(activities.entityId, entityId),
          eq(activities.activityType, "meeting_scheduled"),
          gte(activities.occurredAt, now),
          sql`${activities.occurredAt} <= ${fourteenDaysFromNow.toISOString()}::timestamp`,
        ),
      )
      .limit(1);

    if (meeting) return true;
  }

  return false;
}

/**
 * Generate contextual intervention suggestions based on the specific
 * indicators detected. Each suggestion is actionable and references
 * deal-specific context.
 */
function generateInterventions(
  indicators: StallIndicator[],
  dealName: string,
  contactName: string | null,
  dealProps: Record<string, unknown>,
): SuggestedIntervention[] {
  const interventions: SuggestedIntervention[] = [];
  let priority = 1;

  for (const ind of indicators) {
    switch (ind.type) {
      case "time_in_stage":
        interventions.push({
          action: `Review deal "${dealName}" -- it has exceeded the typical time for this stage. Consider whether it needs a different approach or should be re-qualified.`,
          priority: priority++,
          reasoning: ind.detail,
        });
        break;

      case "activity_drop":
        if (contactName) {
          interventions.push({
            action: `Schedule a check-in call with ${contactName} to re-engage and understand current priorities.`,
            priority: priority++,
            reasoning: ind.detail,
          });
        } else {
          interventions.push({
            action: `Re-engage this deal with a targeted follow-up email referencing the last conversation.`,
            priority: priority++,
            reasoning: ind.detail,
          });
        }
        break;

      case "one_sided_email":
        interventions.push({
          action: `Try a different channel (phone call, LinkedIn message) since email outreach is going unanswered.`,
          priority: priority++,
          reasoning: ind.detail,
        });
        break;

      case "no_upcoming_meeting":
        interventions.push({
          action: `Propose a mutual action plan meeting to align on next steps and timeline.`,
          priority: priority++,
          reasoning: ind.detail,
        });
        break;

      case "intent_cooling":
        // Check if there were document requests we can follow up on
        if (dealProps.nextSteps && (dealProps.nextSteps as string[]).length > 0) {
          const nextStep = (dealProps.nextSteps as string[])[
            (dealProps.nextSteps as string[]).length - 1
          ];
          interventions.push({
            action: `Follow up on the pending next step: "${nextStep}"`,
            priority: priority++,
            reasoning: ind.detail,
          });
        } else {
          interventions.push({
            action: `Send a value-add resource (case study, ROI calculator, or relevant industry insight) to rekindle engagement.`,
            priority: priority++,
            reasoning: ind.detail,
          });
        }
        break;

      case "no_recent_activity":
        interventions.push({
          action: `This deal has no recent activity at all. Determine if it should be marked as lost or if a re-engagement attempt is warranted.`,
          priority: priority++,
          reasoning: ind.detail,
        });
        break;
    }
  }

  // Cap at 3 interventions to avoid overwhelm
  return interventions.slice(0, 3);
}

// ── Main Prediction Function ─────────────────────────────────

export async function predictStalls(
  tenantId: string,
): Promise<StallPrediction[]> {
  const now = new Date();

  // 1. Compute stage percentile benchmarks from tenant history
  const stageP75 = await computeStageP75(tenantId);

  // 2. Fetch all open deals
  const openDeals = await db
    .select({
      id: deals.id,
      name: deals.name,
      stage: deals.stage,
      value: deals.value,
      contactId: deals.contactId,
      companyId: deals.companyId,
      properties: deals.properties,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
    })
    .from(deals)
    .where(
      and(
        eq(deals.tenantId, tenantId),
        notInArray(deals.stage, ["won", "lost"]),
        sql`${deals.deletedAt} IS NULL`,
      ),
    );

  if (openDeals.length === 0) return [];

  // 3. Analyze each deal
  const predictions: StallPrediction[] = [];

  for (const deal of openDeals) {
    const indicators: StallIndicator[] = [];
    const dealProps = (deal.properties || {}) as Record<string, unknown>;

    // Entity IDs to search for activities (deal + contact)
    const entityIds = [deal.id];
    if (deal.contactId) entityIds.push(deal.contactId);

    // Fetch recent activities for this deal
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const dealActivities = await db
      .select({
        activityType: activities.activityType,
        direction: activities.direction,
        occurredAt: activities.occurredAt,
      })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, tenantId),
          sql`${activities.entityId} IN (${sql.join(entityIds.map((id) => sql`${id}`), sql`, `)})`,
          gte(activities.occurredAt, sixtyDaysAgo),
        ),
      )
      .orderBy(desc(activities.occurredAt));

    const activityDates = dealActivities
      .map((a) => a.occurredAt)
      .filter((d): d is Date => d !== null);

    // -- Indicator 1: Time in stage exceeds P75 --
    const lastStageChange = deal.updatedAt || deal.createdAt;
    const daysInStage = lastStageChange
      ? Math.max(
          0,
          Math.round(
            (now.getTime() - new Date(lastStageChange).getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : 0;

    const stageKey = deal.stage || "lead";
    const p75ForStage = stageP75[stageKey] || 21;

    if (daysInStage > p75ForStage) {
      const severity: StallIndicator["severity"] =
        daysInStage > p75ForStage * 2 ? "high" : "medium";
      indicators.push({
        type: "time_in_stage",
        severity,
        detail: `${daysInStage} days in "${stageKey}" stage (75th percentile: ${p75ForStage} days)`,
      });
    }

    // -- Indicator 2: Activity frequency dropped >50% --
    const { dropPercent, recentCount, previousCount } = computeActivityDrop(
      activityDates,
      now,
    );

    if (dropPercent > 0.5 && previousCount >= 2) {
      indicators.push({
        type: "activity_drop",
        severity: dropPercent > 0.75 ? "high" : "medium",
        detail: `Activity dropped ${Math.round(dropPercent * 100)}%: ${previousCount} activities (14-28d ago) to ${recentCount} (last 14d)`,
      });
    }

    // -- Indicator 3: One-sided email conversation --
    const { oneSided, daysSinceOutbound } = isOneSidedEmail(dealActivities);
    if (oneSided && daysSinceOutbound >= 3) {
      indicators.push({
        type: "one_sided_email",
        severity: daysSinceOutbound >= 7 ? "high" : "medium",
        detail: `Last outbound email ${daysSinceOutbound} days ago with no reply`,
      });
    }

    // -- Indicator 4: No upcoming meeting --
    const hasMeeting = await hasUpcomingMeeting(tenantId, entityIds, now);
    if (!hasMeeting && daysInStage > 7) {
      indicators.push({
        type: "no_upcoming_meeting",
        severity: "low",
        detail: "No meeting scheduled in the next 14 days",
      });
    }

    // -- Indicator 5: Buyer intent score declining --
    if (deal.contactId) {
      try {
        const intentScore = await scoreBuyerIntent(deal.contactId, tenantId);
        if (intentScore.trend === "cooling") {
          indicators.push({
            type: "intent_cooling",
            severity: intentScore.score < 30 ? "high" : "medium",
            detail: `Buyer intent score is cooling (${intentScore.score}/100, trend: ${intentScore.trend})`,
          });
        }
      } catch {
        // Non-critical: if scoring fails, skip this indicator
      }
    }

    // -- Indicator 6: No recent activity at all --
    if (activityDates.length === 0 || recentCount === 0) {
      const daysSinceAny =
        activityDates.length > 0
          ? Math.round(
              (now.getTime() -
                Math.max(...activityDates.map((d) => d.getTime()))) /
                (24 * 60 * 60 * 1000),
            )
          : daysInStage;

      if (daysSinceAny > 14) {
        indicators.push({
          type: "no_recent_activity",
          severity: daysSinceAny > 30 ? "high" : "medium",
          detail: `No activity in ${daysSinceAny} days`,
        });
      }
    }

    // Skip deals with no indicators
    if (indicators.length === 0) continue;

    // Compute stall probability from weighted indicators
    let stallProbability = 0;
    for (const ind of indicators) {
      const weight =
        INDICATOR_WEIGHTS[ind.type as keyof typeof INDICATOR_WEIGHTS] || 0.05;
      // Severity multiplier: high = 1.0, medium = 0.7, low = 0.4
      const severityMult =
        ind.severity === "high" ? 1.0 : ind.severity === "medium" ? 0.7 : 0.4;
      stallProbability += weight * severityMult;
    }
    stallProbability = Math.min(1.0, Math.round(stallProbability * 100) / 100);

    // Estimate days until stall: inverse of probability mapped to 1-14 day range
    const daysUntilLikelyStall = Math.max(
      1,
      Math.round(14 * (1 - stallProbability)),
    );

    // Resolve contact name for intervention suggestions
    let contactName: string | null = null;
    if (deal.contactId) {
      const [contact] = await db
        .select({
          firstName: contacts.firstName,
          lastName: contacts.lastName,
        })
        .from(contacts)
        .where(eq(contacts.id, deal.contactId))
        .limit(1);
      if (contact) {
        contactName = [contact.firstName, contact.lastName]
          .filter(Boolean)
          .join(" ");
      }
    }

    // Generate interventions
    const suggestedInterventions = generateInterventions(
      indicators,
      deal.name,
      contactName,
      dealProps,
    );

    predictions.push({
      dealId: deal.id,
      dealName: deal.name,
      stallProbability,
      daysUntilLikelyStall,
      indicators,
      suggestedInterventions,
    });
  }

  // Sort by stall probability descending (most at-risk first)
  predictions.sort((a, b) => b.stallProbability - a.stallProbability);

  return predictions;
}
