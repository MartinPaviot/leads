/**
 * Coaching Engine — Inngest Functions (C5/C7)
 *
 * - analyzeOutgoingEmail: pre-send email review
 * - postInteractionCoaching: post-email/meeting coaching
 * - analyzeDealEvent: coaching on deal stage changes
 * - weeklyPerformanceSnapshot: aggregate weekly AE metrics
 */

import { inngest } from "./client";
import { db } from "@/db";
import {
  activities,
  deals,
  contacts,
  companies,
  coachingInsights,
  aePerformanceSnapshots,
  outboundEmails,
  users,
  notifications,
} from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { reviewEmail, type PreSendContext } from "@/lib/coaching/pre-send-review";
import { scoreInteraction, type InteractionContext } from "@/lib/coaching/interaction-scorer";
import { aggregatePerformance } from "@/lib/coaching/performance-aggregator";

// ── C5: Pre-send email analysis ──────────────────────────

export const analyzeOutgoingEmail = inngest.createFunction(
  {
    id: "coaching-pre-send-analysis",
    retries: 1,
    triggers: [{ event: "coaching/pre-send-analysis" }],
  },
  async ({ event }: {
    event: {
      data: {
        tenantId: string;
        emailId: string;
        dealId?: string;
        contactId?: string;
        userId?: string;
      };
    };
  }) => {
    const { tenantId, emailId, dealId, contactId, userId } = event.data;

    // Load the email draft
    const [email] = await db
      .select()
      .from(outboundEmails)
      .where(and(eq(outboundEmails.id, emailId), eq(outboundEmails.tenantId, tenantId)))
      .limit(1);

    if (!email) return { error: "Email not found" };

    // Load deal context
    let dealName: string | undefined;
    let dealStage: string | undefined;
    let dealValue: number | undefined;
    if (dealId || email.campaignId) {
      const dId = dealId || email.campaignId;
      if (dId) {
        const [deal] = await db.select().from(deals).where(eq(deals.id, dId)).limit(1);
        if (deal) {
          dealName = deal.name;
          dealStage = deal.stage ?? undefined;
          dealValue = deal.value ? Number(deal.value) : undefined;
        }
      }
    }

    // Load contact context
    let contactName: string | undefined;
    let contactTitle: string | undefined;
    let companyName: string | undefined;
    const cId = contactId || email.contactId;
    if (cId) {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, cId)).limit(1);
      if (contact) {
        contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || undefined;
        contactTitle = contact.title ?? undefined;
        if (contact.companyId) {
          const [company] = await db.select().from(companies).where(eq(companies.id, contact.companyId)).limit(1);
          companyName = company?.name ?? undefined;
        }
      }
    }

    // Load known objections and next steps from recent activities
    const knownObjections: string[] = [];
    const pendingNextSteps: string[] = [];
    const recentSummaries: string[] = [];

    if (cId) {
      const recentActs = await db
        .select({ summary: activities.summary, metadata: activities.metadata })
        .from(activities)
        .where(and(eq(activities.tenantId, tenantId), eq(activities.entityId, cId)))
        .orderBy(desc(activities.occurredAt))
        .limit(10);

      for (const act of recentActs) {
        if (act.summary) recentSummaries.push(act.summary);
        const meta = act.metadata as Record<string, unknown> | null;
        const signals = meta?.extractedSignals as Record<string, unknown> | undefined;
        if (signals) {
          if (Array.isArray(signals.objections)) {
            for (const o of signals.objections) {
              if (typeof o === "string" && !knownObjections.includes(o)) knownObjections.push(o);
            }
          }
          if (Array.isArray(signals.next_steps)) {
            for (const ns of signals.next_steps) {
              if (typeof ns === "string") pendingNextSteps.push(ns);
            }
          }
        }
      }
    }

    const ctx: PreSendContext = {
      emailSubject: email.subject,
      emailBody: email.bodyText || email.bodyHtml || "",
      dealName,
      dealStage,
      dealValue,
      contactName,
      contactTitle,
      companyName,
      knownObjections,
      pendingNextSteps,
      recentInteractionSummaries: recentSummaries.slice(0, 5),
    };

    const score = await reviewEmail(ctx, tenantId);

    // Store coaching insight
    await db.insert(coachingInsights).values({
      tenantId,
      userId: userId || null,
      entityType: "email",
      entityId: emailId,
      insightType: "pre_send",
      category: score.verdict === "revise"
        ? findWeakestDimension(score)
        : "completeness",
      score: score.overallScore,
      summary: score.verdict === "send"
        ? "Email looks good — ready to send."
        : score.topSuggestion || "Consider revising before sending.",
      detail: formatScoreDetail(score),
      suggestion: score.topSuggestion || null,
    });

    return { verdict: score.verdict, overallScore: score.overallScore };
  },
);

// ── C5: Post-interaction coaching ────────────────────────

export const postInteractionCoaching = inngest.createFunction(
  {
    id: "coaching-post-interaction",
    retries: 1,
    triggers: [{ event: "coaching/post-interaction" }],
  },
  async ({ event }: {
    event: {
      data: {
        tenantId: string;
        activityId: string;
        userId?: string;
      };
    };
  }) => {
    const { tenantId, activityId, userId } = event.data;

    const [activity] = await db
      .select()
      .from(activities)
      .where(and(eq(activities.id, activityId), eq(activities.tenantId, tenantId)))
      .limit(1);

    if (!activity) return { error: "Activity not found" };
    if (!activity.rawContent && !activity.summary) return { skipped: "no content" };

    // Load recent interactions for context
    const recentActs = await db
      .select({ summary: activities.summary })
      .from(activities)
      .where(and(eq(activities.tenantId, tenantId), eq(activities.entityId, activity.entityId)))
      .orderBy(desc(activities.occurredAt))
      .limit(5);

    // Load deal/contact names
    let dealName: string | undefined;
    let dealStage: string | undefined;
    let contactName: string | undefined;
    let contactTitle: string | undefined;

    if (activity.entityType === "deal") {
      const [deal] = await db.select().from(deals).where(eq(deals.id, activity.entityId)).limit(1);
      dealName = deal?.name;
      dealStage = deal?.stage ?? undefined;
    }
    if (activity.entityType === "contact") {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, activity.entityId)).limit(1);
      if (contact) {
        contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || undefined;
        contactTitle = contact.title ?? undefined;
      }
    }

    const ctx: InteractionContext = {
      interactionType: activity.activityType as InteractionContext["interactionType"],
      content: activity.rawContent || activity.summary || "",
      subject: (activity.metadata as Record<string, unknown>)?.subject as string | undefined,
      dealName,
      dealStage,
      contactName,
      contactTitle,
      direction: activity.direction as "inbound" | "outbound" | undefined,
      sentiment: activity.sentiment ?? undefined,
      previousInteractionSummaries: recentActs
        .filter((a) => a.summary)
        .map((a) => a.summary!),
    };

    const score = await scoreInteraction(ctx, tenantId);

    await db.insert(coachingInsights).values({
      tenantId,
      userId: userId || null,
      entityType: activity.entityType,
      entityId: activity.entityId,
      activityId,
      insightType: "post_interaction",
      category: score.category,
      score: score.overallScore,
      summary: score.coachingAdvice.slice(0, 200),
      detail: `**Strengths:**\n${score.strengths.map((s) => `- ${s}`).join("\n")}\n\n**Improvements:**\n${score.improvements.map((i) => `- ${i}`).join("\n")}\n\n**Coaching:**\n${score.coachingAdvice}`,
      suggestion: score.suggestedFollowUp || null,
    });

    return { score: score.overallScore, category: score.category };
  },
);

// ── C5: Deal event coaching ──────────────────────────────

export const analyzeDealEvent = inngest.createFunction(
  {
    id: "coaching-deal-event",
    retries: 1,
    triggers: [{ event: "coaching/deal-event" }],
  },
  async ({ event }: {
    event: {
      data: {
        tenantId: string;
        dealId: string;
        eventType: string;
        userId?: string;
        previousStage?: string;
        newStage?: string;
      };
    };
  }) => {
    const { tenantId, dealId, eventType, userId, previousStage, newStage } = event.data;

    if (eventType !== "stage_changed") return { skipped: "only stage changes coached" };

    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
    if (!deal) return { error: "Deal not found" };

    // Check for skipped stages
    const stageOrder = ["lead", "qualification", "demo", "trial", "proposal", "negotiation", "won", "lost"];
    const prevIdx = stageOrder.indexOf(previousStage || "");
    const newIdx = stageOrder.indexOf(newStage || "");
    const skippedStages = prevIdx >= 0 && newIdx > prevIdx + 1
      ? stageOrder.slice(prevIdx + 1, newIdx)
      : [];

    if (skippedStages.length === 0 && newStage !== "lost") {
      return { skipped: "normal progression, no coaching needed" };
    }

    const summary = skippedStages.length > 0
      ? `Deal "${deal.name}" skipped ${skippedStages.join(", ")} stages (${previousStage} → ${newStage}). This may indicate rushed progression — verify the prospect is genuinely ready.`
      : `Deal "${deal.name}" moved to ${newStage}. ${newStage === "lost" ? "Review what went wrong to improve next time." : ""}`;

    await db.insert(coachingInsights).values({
      tenantId,
      userId: userId || null,
      entityType: "deal",
      entityId: dealId,
      insightType: "process_gap",
      category: "process_adherence",
      score: skippedStages.length > 0 ? 0.4 : 0.7,
      summary,
      detail: skippedStages.length > 0
        ? `Skipped stages: ${skippedStages.join(", ")}.\n\nBefore advancing, make sure you've completed the key activities for each stage:\n${skippedStages.map((s) => `- **${s}**: typical milestones for this stage`).join("\n")}`
        : `Deal moved to ${newStage}. Review the deal history for lessons learned.`,
      suggestion: skippedStages.length > 0
        ? `Consider validating that ${skippedStages[0]} criteria are met before proceeding.`
        : null,
    });

    // Send notification
    if (userId) {
      await db.insert(notifications).values({
        tenantId,
        userId,
        type: "system",
        title: skippedStages.length > 0
          ? `Coaching: "${deal.name}" skipped stages`
          : `Deal "${deal.name}" moved to ${newStage}`,
        body: summary,
        entityType: "deal",
        entityId: dealId,
      });
    }

    return { coached: true, skippedStages };
  },
);

// ── C7: Weekly performance snapshot ──────────────────────

export const weeklyPerformanceSnapshot = inngest.createFunction(
  {
    id: "coaching-weekly-performance",
    retries: 1,
    triggers: [{ cron: "0 8 * * 1" }], // Mondays 8am UTC
  },
  async ({ step }: { step: any }) => {
    const allUsers = await step.run("list-users", async () => {
      return db.select({ id: users.id, tenantId: users.tenantId }).from(users);
    });

    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const periodStart = new Date(periodEnd.getTime() - 7 * 86400000);

    let snapshots = 0;

    for (const user of allUsers) {
      if (!user.tenantId) continue;

      await step.run(`snapshot-${user.id}`, async () => {
        const metrics = await aggregatePerformance(
          user.tenantId!,
          user.id,
          periodStart,
          periodEnd,
        );

        await db.insert(aePerformanceSnapshots).values({
          tenantId: user.tenantId!,
          userId: user.id,
          periodStart,
          periodEnd,
          ...metrics,
        });

        snapshots++;
      });
    }

    return { snapshots };
  },
);

// ── Helpers ──────────────────────────────────────────────

function findWeakestDimension(score: { dimensions: Record<string, { score: number }> }): string {
  let weakest = "completeness";
  let lowestScore = 1;
  for (const [key, dim] of Object.entries(score.dimensions)) {
    if (dim.score < lowestScore) {
      lowestScore = dim.score;
      weakest = key === "objectionHandling" ? "objection_handling"
        : key === "nextStep" ? "next_step"
        : key === "processAdherence" ? "process_adherence"
        : key;
    }
  }
  return weakest;
}

function formatScoreDetail(score: {
  dimensions: Record<string, { score: number; feedback: string }>;
  overallScore: number;
  verdict: string;
}): string {
  const lines: string[] = [];
  lines.push(`**Overall: ${(score.overallScore * 100).toFixed(0)}% — ${score.verdict.toUpperCase()}**\n`);
  for (const [key, dim] of Object.entries(score.dimensions)) {
    const label = key.replace(/([A-Z])/g, " $1").trim();
    lines.push(`- **${label}** (${(dim.score * 100).toFixed(0)}%): ${dim.feedback}`);
  }
  return lines.join("\n");
}
