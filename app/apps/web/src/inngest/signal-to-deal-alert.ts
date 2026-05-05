/**
 * Differentiation Angle 1: Proactive Deal Intelligence
 *
 * When the weekly signal scan detects a signal (funding, hiring, tech
 * adoption, job change) on a company, this function checks if there's
 * an open deal with that company. If so, it generates an impact
 * assessment and pushes a coaching insight + notification.
 *
 * This is what Lightfield can't do — their context is limited to CRM
 * interactions. Elevay links external market signals to active deals.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { deals, companies, coachingInsights, notifications, users } from "@/db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { trackPipeline } from "@/lib/analytics/pipeline-tracker";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

/**
 * Triggered after a signal scan completes. Receives the detected
 * signals and links them to open deals.
 */
export const signalToDealAlert = inngest.createFunction(
  {
    id: "signal-to-deal-alert",
    retries: 1,
    triggers: [{ event: "signals/deal-alert-check" }],
  },
  async ({ event, step }: {
    event: {
      data: {
        tenantId: string;
        signals: Array<{
          companyId: string;
          companyName: string;
          signalType: string;
          title: string;
          description: string;
        }>;
      };
    };
    step: any;
  }) => {
    const { tenantId, signals } = event.data;
    if (!signals || signals.length === 0) return { processed: 0 };

    const model = getLLMModel();
    if (!model) return { error: "No LLM configured" };

    for (const signal of signals) {
      await trackPipeline({
        traceId: `${signal.companyId}:${signal.signalType}`,
        tenantId,
        companyId: signal.companyId,
        stage: "signal_detected",
        sourceSystem: "inngest",
        metadata: { signalType: signal.signalType, title: signal.title },
      });
    }

    // F001: Fire agent reactor for each signal detected
    for (const signal of signals) {
      await inngest.send({
        name: "agent/react",
        data: {
          tenantId,
          trigger: "signal_detected",
          entityType: "company",
          entityId: signal.companyId,
          metadata: {
            signalType: signal.signalType,
            signalTitle: signal.title,
            signalDescription: signal.description,
          },
          deduplicationKey: `signal_detected:company:${signal.companyId}:${signal.signalType}`,
          firedAt: new Date().toISOString(),
        },
      }).catch(() => {});
    }

    let alertsGenerated = 0;

    for (const signal of signals) {
      await step.run(`check-${signal.companyId}-${signal.signalType}`, async () => {
        // Find open deals for this company
        const openDeals = await db
          .select({ id: deals.id, name: deals.name, stage: deals.stage, value: deals.value })
          .from(deals)
          .where(
            and(
              eq(deals.tenantId, tenantId),
              eq(deals.companyId, signal.companyId),
              notInArray(deals.stage, ["won", "lost"]),
            ),
          );

        if (openDeals.length === 0) {
          // No open deals — auto-enroll contacts into outbound sequence
          await inngest.send({
            name: "signals/auto-enroll",
            data: {
              tenantId,
              companyId: signal.companyId,
              companyName: signal.companyName,
              signalType: signal.signalType,
              signalTitle: signal.title,
            },
          }).catch((e) => console.warn("signal-to-deal-alert: auto-enroll trigger failed", e));
          return;
        }

        for (const deal of openDeals) {
          // Generate impact assessment
          const assessment = await tracedGenerateObject({
            model,
            schema: z.object({
              impact: z.enum(["positive", "negative", "neutral"]),
              impactSummary: z.string(),
              suggestedAction: z.string(),
              urgency: z.enum(["immediate", "this_week", "monitor"]),
            }),
            prompt: `A market signal was detected for a company with an active deal. Assess the impact on the deal.

Signal: ${signal.title}
Details: ${signal.description}
Signal type: ${signal.signalType}
Company: ${signal.companyName}
Deal: ${deal.name} (stage: ${deal.stage}, value: ${deal.value ? `$${deal.value}` : "unknown"})

Questions:
1. Is this signal positive, negative, or neutral for closing this deal?
2. One-sentence impact summary
3. What specific action should the rep take based on this signal?
4. How urgent is the response? (immediate = today, this_week, monitor = passive)`,
            _trace: {
              agentId: "signal-to-deal-alert",
              tenantId,
            },
          });

          const { impact, impactSummary, suggestedAction, urgency } = assessment.object;

          // Store coaching insight
          await db.insert(coachingInsights).values({
            tenantId,
            entityType: "deal",
            entityId: deal.id,
            insightType: "deal_risk",
            category: "timing",
            score: impact === "positive" ? 0.8 : impact === "negative" ? 0.3 : 0.5,
            summary: `${signal.signalType}: ${signal.title} — ${impactSummary}`,
            detail: `**Signal:** ${signal.title}\n**Type:** ${signal.signalType}\n**Company:** ${signal.companyName}\n**Impact:** ${impact}\n\n${impactSummary}\n\n**Suggested action:** ${suggestedAction}\n**Urgency:** ${urgency}`,
            suggestion: suggestedAction,
          });

          // Send notification to all users in tenant
          const tenantUsers = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.tenantId, tenantId));

          for (const user of tenantUsers) {
            await db.insert(notifications).values({
              tenantId,
              userId: user.id,
              type: "system",
              title: `${impact === "positive" ? "+" : impact === "negative" ? "!" : "~"} ${signal.companyName}: ${signal.title}`,
              body: `${impactSummary}\n\nAction: ${suggestedAction}`,
              entityType: "deal",
              entityId: deal.id,
            });
          }

          alertsGenerated++;
        }
      });
    }

    return { alertsGenerated, signalsProcessed: signals.length };
  },
);
