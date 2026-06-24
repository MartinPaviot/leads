/**
 * Campaign Decision Engine — Campaign Engine 1000x
 *
 * Replaces the fixed waterfall sequence with an intelligent decision loop.
 * Triggered by behavioral events (open, click, reply, website visit, timer).
 * Uses the Strategy Selector + Intelligence Brief to decide the NEXT action.
 */

import { inngest } from "./client";
import { releaseEnrollmentById } from "@/lib/anti-collision/enroll-guard";
import { db } from "@/db";
import {
  sequenceEnrollments,
  outboundEmails,
  contacts,
  companies,
  intelligenceBriefs,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { selectStrategy, StrategyError } from "@/lib/campaign-engine/select-strategy";
import { gateAction } from "@/lib/campaign-engine/execution-gate";
import { buildIntelligenceBrief } from "@/lib/campaign-engine/build-intelligence-brief";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { z } from "zod";
import { PLAYBOOK_PROMPTS } from "./decision-engine-prompts";

const decisionSchema = z.object({
  action: z.enum([
    "send_email",
    "wait",
    "switch_channel",
    "request_warm_intro",
    "send_value",
    "stop",
    "escalate_to_human",
  ]),
  reasoning: z.string(),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  waitDays: z.number().optional(),
  channelSuggestion: z.string().optional(),
  angle: z.string().optional(),
});

interface DecisionEvent {
  data: {
    enrollmentId: string;
    tenantId: string;
    contactId: string;
    companyId: string;
    triggerEvent: string; // "email_opened", "email_clicked", "timer_elapsed", "website_visited"
    metadata?: Record<string, unknown>;
  };
}

export const campaignDecisionEngine = inngest.createFunction(
  {
    id: "campaign-engine/decide-next-action",
    name: "Campaign Decision Engine",
    retries: 1,
    concurrency: [{ limit: 5 }],
    debounce: { key: "event.data.enrollmentId", period: "30m" },
    triggers: [
      { event: "campaign-engine/event-occurred" },
    ],
  },
  async ({ event, step }: { event: DecisionEvent; step: any }) => {
    const { enrollmentId, tenantId, contactId, companyId, triggerEvent, metadata } = event.data;

    // Load current state
    const state = await step.run("load-state", async () => {
      const [enrollment] = await db
        .select()
        .from(sequenceEnrollments)
        .where(eq(sequenceEnrollments.id, enrollmentId))
        .limit(1);

      if (!enrollment || enrollment.status !== "active") return null;

      // Get email history for this enrollment
      const emails = await db
        .select()
        .from(outboundEmails)
        .where(eq(outboundEmails.enrollmentId, enrollmentId))
        .orderBy(desc(outboundEmails.sentAt));

      const [contact] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);

      return {
        enrollment,
        emailsSent: emails.filter(e => e.status === "sent" || e.status === "delivered").length,
        lastEmailSentAt: emails[0]?.sentAt?.toISOString() || null,
        opens: emails.filter(e => e.openedAt).length,
        clicks: emails.filter(e => e.clickedAt).length,
        contactName: `${contact?.firstName || ""} ${contact?.lastName || ""}`.trim(),
        contactTitle: contact?.title,
        contactEmail: contact?.email,
      };
    });

    if (!state) return { result: "skipped", reason: "Enrollment not active" };

    // Build/load intelligence brief
    const brief = await step.run("get-brief", async () => {
      return await buildIntelligenceBrief(companyId, tenantId, contactId);
    });

    // Get strategy recommendation
    const strategy = await step.run("get-strategy", async () => {
      try {
        const candidates = await selectStrategy(companyId, tenantId, contactId);
        return candidates[0] || null;
      } catch (e) {
        if (e instanceof StrategyError) return null;
        throw e;
      }
    });

    // LLM decision: given the event + state + brief + strategy, what's the next action?
    const decision = await step.run("decide", async () => {
      const model = anthropic("claude-sonnet-4-6");
      const strategyPrompt = strategy ? (PLAYBOOK_PROMPTS[strategy.strategyId as keyof typeof PLAYBOOK_PROMPTS] || "") : "";

      const { object } = await tracedGenerateObject({
        model,
        schema: decisionSchema,
        prompt: `You are the campaign decision engine. A behavioral event just occurred. Decide the NEXT action.

EVENT: ${triggerEvent}
${metadata ? `EVENT METADATA: ${JSON.stringify(metadata)}` : ""}

CURRENT STATE:
- Emails sent so far: ${state.emailsSent}
- Last email sent: ${state.lastEmailSentAt || "never"}
- Opens: ${state.opens}
- Clicks: ${state.clicks}
- Days since last touch: ${state.lastEmailSentAt ? Math.floor((Date.now() - new Date(state.lastEmailSentAt).getTime()) / 86400000) : "N/A"}

PROSPECT: ${state.contactName} (${state.contactTitle || "unknown role"})
${brief ? `INTELLIGENCE BRIEF:
- Pain points: ${brief.painPoints.join(", ") || "unknown"}
- Best angle: ${brief.bestAngle || "unknown"}
- Competitor: ${brief.competitorDetected || "none"}
- Public content depth: ${brief.publicContentDepth}` : "No brief available"}

STRATEGY: ${strategy ? `${strategy.strategyId} (score: ${strategy.score}, reason: ${strategy.reason})` : "none selected"}
${strategyPrompt}

DECISION RULES:
- If prospect opened 3+ times without reply → they're interested but hesitant. Try a different angle or softer CTA.
- If prospect clicked a link → they want more info. Send something specific about what they clicked.
- If timer_elapsed and no engagement at all → consider stopping or switching channel.
- If website_visited → high intent. Accelerate and reference the visit.
- Max 5 emails per prospect. If already sent 5, stop unless there's strong engagement.
- Minimum 2 days between emails unless there's a reply or visit.
- If strategy is "long_game", space emails 3-4 weeks apart.

${state.emailsSent >= 5 ? "WARNING: Already sent 5 emails. Only continue if there's strong engagement signal (click, visit, or multi-open)." : ""}

Generate the email content if action is "send_email". Keep it under 80 words.`,
        _trace: { agentId: "decision-engine", tenantId, inputPreview: `${triggerEvent} for ${state.contactName}` },
      });

      return object;
    });

    // Execute the decision through the gate
    if (decision.action === "send_email" && decision.emailBody) {
      const gateResult = await step.run("gate-check", async () => {
        return await gateAction({
          actionType: "coldEmailSend",
          tenantId,
          prospectDomain: brief?.companyId ? undefined : undefined,
        });
      });

      if (gateResult.status === "blocked") {
        return { result: "blocked", reason: gateResult.reason, decision: decision.action };
      }

      const emailStatus = gateResult.status === "execute" ? "queued"
        : gateResult.status === "delayed" ? "draft"
        : "draft";

      await step.run("create-email", async () => {
        await db.insert(outboundEmails).values({
          tenantId,
          enrollmentId,
          contactId,
          stepNumber: state.emailsSent + 1,
          fromAddress: "pending@rotation",
          toAddress: state.contactEmail || "",
          subject: decision.emailSubject || `Re: follow-up`,
          bodyHtml: `<div>${decision.emailBody!.replace(/\n/g, "<br>")}</div>`,
          bodyText: decision.emailBody!,
          status: emailStatus,
          queuedAt: emailStatus === "queued" ? new Date() : null,
        });
      });

      return { result: emailStatus === "queued" ? "email_queued" : "email_drafted", decision: decision.action, reasoning: decision.reasoning };
    }

    if (decision.action === "wait") {
      // Schedule next decision trigger after the wait period
      const waitMs = (decision.waitDays || 3) * 24 * 60 * 60 * 1000;
      await step.sleep("wait-period", waitMs);
      // After sleep, re-trigger the decision engine
      await inngest.send({
        name: "campaign-engine/event-occurred",
        data: { enrollmentId, tenantId, contactId, companyId, triggerEvent: "timer_elapsed" },
      });
      return { result: "waiting", waitDays: decision.waitDays, reasoning: decision.reasoning };
    }

    if (decision.action === "stop") {
      await step.run("stop-enrollment", async () => {
        await db
          .update(sequenceEnrollments)
          .set({ status: "completed" })
          .where(eq(sequenceEnrollments.id, enrollmentId));
      });
      await releaseEnrollmentById(enrollmentId); // Spec 14 — free the anti-collision lock on terminal.
      return { result: "stopped", reasoning: decision.reasoning };
    }

    if (decision.action === "escalate_to_human") {
      const { notifications } = await import("@/db/schema");
      await step.run("notify-human", async () => {
        await db.insert(notifications).values({
          tenantId,
          userId: null as any,
          type: "sequence_reply",
          title: `Decision needed: ${state.contactName}`,
          body: decision.reasoning,
          entityType: "contact",
          entityId: contactId,
        });
      });
      return { result: "escalated", reasoning: decision.reasoning };
    }

    return { result: "no_action", decision: decision.action, reasoning: decision.reasoning };
  }
);

/**
 * Bridge: emit decision engine events from existing tracking webhooks.
 * Converts open/click/visit events into campaign-engine events.
 */
export const bridgeTrackingEvents = inngest.createFunction(
  {
    id: "campaign-engine/bridge-tracking",
    name: "Bridge Tracking to Decision Engine",
    retries: 0,
    triggers: [
      { event: "email/opened" },
      { event: "email/clicked" },
      { event: "inbound/visit-identified" },
    ],
  },
  async ({ event }) => {
    const { enrollmentId, tenantId, contactId, companyId } = event.data as any;
    if (!enrollmentId || !tenantId) return;

    await inngest.send({
      name: "campaign-engine/event-occurred",
      data: {
        enrollmentId,
        tenantId,
        contactId: contactId || "",
        companyId: companyId || "",
        triggerEvent: event.name.replace("email/", "email_").replace("inbound/", ""),
        metadata: event.data,
      },
    });
  }
);
