/**
 * Differentiation Angle 2: Autonomous Deal Progression
 *
 * The agent doesn't just brief — it acts. Every weekday morning at 9am,
 * it assesses each open deal, decides the best action, and executes
 * (or defers to the founder) based on the approval mode setting.
 *
 * Actions: SEND_FOLLOWUP, SCHEDULE_MEETING, UPDATE_STAGE, CREATE_TASK,
 * RE_ENGAGE, HOLD.
 *
 * This is the feature Lightfield can't replicate without an action layer.
 */

import { inngest } from "./client";
import { db } from "@/db";
import {
  deals,
  activities,
  contacts,
  companies,
  tasks,
  notifications,
  users,
} from "@/db/schema";
import { and, eq, notInArray, desc } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { ageInStage } from "@/lib/deal-helpers";
import { getTenantSettings } from "@/lib/tenant-settings";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

// ── Decision schema ──────────────────────────────────────

const dealDecisionSchema = z.object({
  action: z.enum([
    "SEND_FOLLOWUP",
    "SCHEDULE_MEETING",
    "CREATE_TASK",
    "RE_ENGAGE",
    "HOLD",
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  emailDraft: z.object({
    subject: z.string(),
    body: z.string(),
  }).optional(),
  taskDescription: z.string().optional(),
});

// ── Main function ────────────────────────────────────────

export const autoPipelineStep = inngest.createFunction(
  {
    id: "auto-pipeline-step",
    retries: 1,
    triggers: [{ cron: "0 9 * * 1-5" }], // Weekdays 9am UTC
  },
  async ({ step }: { step: any }) => {
    // Get all tenants
    const allUsers = await step.run("list-users", async () => {
      return db
        .select({ id: users.id, tenantId: users.tenantId, role: users.role })
        .from(users)
        .where(eq(users.role, "admin"));
    });

    // Group by tenant
    const tenantMap = new Map<string, string[]>();
    for (const u of allUsers) {
      if (!u.tenantId) continue;
      const list = tenantMap.get(u.tenantId) || [];
      list.push(u.id);
      tenantMap.set(u.tenantId, list);
    }

    const summary = {
      tenantsProcessed: 0,
      dealsAssessed: 0,
      actionsExecuted: 0,
      actionsDeferred: 0,
    };

    for (const [tenantId, userIds] of tenantMap) {
      await step.run(`pipeline-${tenantId}`, async () => {
        const settings = await getTenantSettings(tenantId);
        const { readApprovalMode } = await import(
          "@/lib/guardrails/approval-mode"
        );
        const approvalMode = readApprovalMode(settings);

        const model = getLLMModel();
        if (!model) return;

        // Fetch all open deals
        const openDeals = await db
          .select()
          .from(deals)
          .where(
            and(
              eq(deals.tenantId, tenantId),
              notInArray(deals.stage, ["won", "lost"]),
            ),
          )
          .orderBy(desc(deals.updatedAt));

        const actions: Array<{
          dealName: string;
          dealId: string;
          action: string;
          confidence: number;
          reasoning: string;
          executed: boolean;
        }> = [];

        for (const deal of openDeals.slice(0, 20)) {
          // Fetch recent activities
          const recentActs = await db
            .select({
              summary: activities.summary,
              activityType: activities.activityType,
              direction: activities.direction,
              occurredAt: activities.occurredAt,
            })
            .from(activities)
            .where(
              and(
                eq(activities.tenantId, tenantId),
                eq(activities.entityId, deal.id),
                eq(activities.entityType, "deal"),
              ),
            )
            .orderBy(desc(activities.occurredAt))
            .limit(10);

          const lastActivity = recentActs[0];
          const daysSinceActivity = lastActivity?.occurredAt
            ? Math.floor((Date.now() - lastActivity.occurredAt.getTime()) / 86400000)
            : 30;

          const age = ageInStage(deal.updatedAt, deal.stage);
          const companyName = deal.companyId
            ? await db
                .select({ name: companies.name })
                .from(companies)
                .where(eq(companies.id, deal.companyId))
                .limit(1)
                .then((r) => r[0]?.name ?? "unknown")
            : "unknown";

          const contactName = deal.contactId
            ? await db
                .select({ firstName: contacts.firstName, lastName: contacts.lastName })
                .from(contacts)
                .where(eq(contacts.id, deal.contactId))
                .limit(1)
                .then((r) =>
                  r[0]
                    ? [r[0].firstName, r[0].lastName].filter(Boolean).join(" ")
                    : "unknown",
                )
            : "unknown";

          const activityTimeline = recentActs
            .map((a) => {
              const date = a.occurredAt?.toISOString().split("T")[0] ?? "";
              return `[${date}] ${a.activityType} (${a.direction ?? "?"}) — ${a.summary || "no summary"}`;
            })
            .join("\n");

          // LLM decision
          const decision = await tracedGenerateObject({
            model,
            schema: dealDecisionSchema,
            prompt: `You are an autonomous sales agent deciding the next action for a deal. Be decisive.

## Deal
- Name: ${deal.name}
- Company: ${companyName}
- Contact: ${contactName}
- Stage: ${deal.stage}
- Value: ${deal.value ? `$${deal.value}` : "unknown"}
- Days in stage: ${age?.days ?? "unknown"} (${age?.bucket ?? "unknown"})
- Days since last activity: ${daysSinceActivity}
- Summary: ${deal.summary || "none"}

## Recent Activity
${activityTimeline || "No activities recorded"}

## Decision Rules
- SEND_FOLLOWUP: If >3 days since our last outbound and deal is active. Include emailDraft.
- SCHEDULE_MEETING: If deal is at demo/trial stage and no meeting scheduled. Include emailDraft proposing times.
- CREATE_TASK: If the situation needs human judgment (ambiguous signals, sensitive relationship, legal implications). Include taskDescription.
- RE_ENGAGE: If deal is stalled (>14 days) or frozen (>30 days). Include emailDraft with a fresh angle.
- HOLD: If activity is recent and deal is progressing normally.

Choose ONE action. Set confidence 0.0-1.0 (higher = more certain this is the right move). Explain your reasoning in 1-2 sentences.

${daysSinceActivity < 2 ? "Recent activity detected — likely HOLD unless there's a clear reason to act." : ""}`,
            _trace: {
              agentId: "auto-pipeline",
              tenantId,
            },
          });

          const d = decision.object;
          summary.dealsAssessed++;

          // WS-1 — map v2 approval modes to this pipeline's historical
          // "shouldExecute" semantics. The pipeline's decisions are
          // typed differently from generic guarded-actions (CREATE_TASK,
          // SEND_FOLLOWUP, etc.), so we don't route through
          // enforceAgentApprovalMode here — we keep the per-mode ruleset
          // that the pipeline already encodes and just move it to v2
          // vocabulary. auto-high-confidence matches the legacy "auto"
          // threshold (≥0.7). batch-daily pairs with the legacy "ask"
          // threshold (≥0.9 except sends). review-each never auto-executes.
          const shouldExecute =
            approvalMode === "auto-high-confidence"
              ? d.confidence >= 0.7
              : approvalMode === "batch-daily"
                ? d.confidence >= 0.9 && d.action !== "SEND_FOLLOWUP"
                : false; // review-each = always require human approval

          if (d.action === "HOLD") {
            actions.push({
              dealName: deal.name,
              dealId: deal.id,
              action: d.action,
              confidence: d.confidence,
              reasoning: d.reasoning,
              executed: false,
            });
            continue;
          }

          if (shouldExecute && d.action === "CREATE_TASK" && d.taskDescription) {
            // Create task for founder review
            await db.insert(tasks).values({
              tenantId,
              assigneeId: userIds[0],
              entityType: "deal",
              entityId: deal.id,
              title: `[Auto] ${deal.name}: ${d.taskDescription.slice(0, 100)}`,
              description: `**Auto-generated by pipeline agent**\n\n${d.reasoning}\n\n${d.taskDescription}`,
              status: "todo",
              priority: d.confidence >= 0.8 ? "high" : "medium",
            });
            summary.actionsExecuted++;
          } else if (shouldExecute && d.emailDraft) {
            // Queue the email for sending via existing pipeline
            await inngest.send({
              name: "email/auto-pipeline-draft",
              data: {
                tenantId,
                dealId: deal.id,
                contactId: deal.contactId,
                subject: d.emailDraft.subject,
                body: d.emailDraft.body,
                action: d.action,
                confidence: d.confidence,
              },
            });
            summary.actionsExecuted++;
          } else {
            // Deferred — create task for approval
            await db.insert(tasks).values({
              tenantId,
              assigneeId: userIds[0],
              entityType: "deal",
              entityId: deal.id,
              title: `[Review] ${deal.name}: ${d.action.toLowerCase().replace(/_/g, " ")}`,
              description: `**Agent recommendation (confidence: ${(d.confidence * 100).toFixed(0)}%)**\n\n${d.reasoning}${d.emailDraft ? `\n\n**Draft email:**\nSubject: ${d.emailDraft.subject}\n\n${d.emailDraft.body}` : ""}`,
              status: "todo",
              priority: "medium",
            });
            summary.actionsDeferred++;
          }

          actions.push({
            dealName: deal.name,
            dealId: deal.id,
            action: d.action,
            confidence: d.confidence,
            reasoning: d.reasoning,
            executed: shouldExecute,
          });
        }

        // Send morning digest notification
        const executed = actions.filter((a) => a.executed && a.action !== "HOLD");
        const deferred = actions.filter((a) => !a.executed && a.action !== "HOLD");

        if (executed.length > 0 || deferred.length > 0) {
          const title =
            executed.length > 0
              ? `Pipeline: ${executed.length} action${executed.length > 1 ? "s" : ""} taken, ${deferred.length} need your review`
              : `Pipeline: ${deferred.length} action${deferred.length > 1 ? "s" : ""} need your review`;

          const body = [
            ...executed.map(
              (a) => `Executed: ${a.action} on "${a.dealName}" (${(a.confidence * 100).toFixed(0)}% confidence)`,
            ),
            ...deferred.map(
              (a) => `Review: ${a.action} on "${a.dealName}" — ${a.reasoning.slice(0, 100)}`,
            ),
          ].join("\n");

          for (const userId of userIds) {
            await db.insert(notifications).values({
              tenantId,
              userId,
              type: "system",
              title,
              body: body.slice(0, 1000),
            });
          }
        }

        summary.tenantsProcessed++;
      });
    }

    return summary;
  },
);
