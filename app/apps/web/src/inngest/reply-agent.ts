/**
 * Extended Reply Agent — Campaign Engine 1000x
 *
 * Handles reply types that the basic reply-handler doesn't cover:
 * - "not_now" → schedule re-engagement
 * - "wrong_person" → research and redirect
 * - "info_request" → send relevant assets
 * - "competitor_mention" → displacement angle
 * - "question" → answer with product knowledge
 *
 * Integrates with the execution gate for autonomy control.
 */

import { inngest } from "./client";
import { releaseEnrollmentById } from "@/lib/anti-collision/enroll-guard";
import { db } from "@/db";
import {
  sequenceEnrollments,
  contacts,
  companies,
  outboundEmails,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { z } from "zod";
import { buildProspectContext, formatContextForPrompt } from "@/lib/context/prospect-context";
import { gateAction } from "@/lib/campaign-engine/execution-gate";
import { updateTrustScore } from "@/lib/campaign-engine/trust-score";
import { buildIntelligenceBrief } from "@/lib/campaign-engine/build-intelligence-brief";

const replySchema = z.object({
  subject: z.string(),
  body: z.string(),
  action: z.enum(["send_reply", "schedule_followup", "redirect_to_contact", "escalate_to_human", "close_sequence"]),
  followupDays: z.number().optional(),
  redirectName: z.string().optional(),
  redirectTitle: z.string().optional(),
  reasoning: z.string(),
});

interface ReplyAgentEvent {
  data: {
    enrollmentId: string;
    tenantId: string;
    contactId: string;
    classification: string;
    replyContent: string;
    originalSubject: string;
  };
}

export const replyAgent = inngest.createFunction(
  {
    id: "campaign-engine/reply-agent",
    name: "Campaign Engine Reply Agent",
    retries: 2,
    onFailure: async ({ error, event }) => {
      console.error(`[DEAD LETTER] reply-agent failed for ${(event as any).data?.enrollmentId}:`, error.message);
    },
    triggers: [{ event: "campaign-engine/reply-received" }],
  },
  async ({ event, step }: { event: ReplyAgentEvent; step: any }) => {
    const { enrollmentId, tenantId, contactId, classification, replyContent, originalSubject } = event.data;

    // Load context
    const ctx = await step.run("build-context", async () => {
      return await buildProspectContext(contactId, tenantId);
    });

    if (!ctx) return { result: "skipped", reason: "No context" };

    // Load intelligence brief for deeper context
    const brief = await step.run("load-brief", async () => {
      if (!ctx.company?.id) return null;
      return await buildIntelligenceBrief(ctx.company.id, tenantId, contactId);
    });

    // Get tenant knowledge for the reply
    const contextBlock = formatContextForPrompt(ctx);
    const briefContext = brief ? `
INTELLIGENCE BRIEF:
- Pain points: ${brief.painPoints.join(", ") || "none identified"}
- Best angle: ${brief.bestAngle || "none"}
- Competitor: ${brief.competitorDetected || "none detected"}
- Tech stack: ${brief.techStack.map((t: { tool: string }) => t.tool).join(", ") || "unknown"}` : "";

    // Generate intelligent reply based on classification
    const reply = await step.run("generate-reply", async () => {
      const model = anthropic("claude-sonnet-4-6");

      const { object } = await tracedGenerateObject({
        model,
        schema: replySchema,
        prompt: buildReplyPrompt(classification, replyContent, contextBlock, briefContext, originalSubject, ctx.aiTone),
        _trace: { agentId: "reply-agent", tenantId, inputPreview: `${classification} reply from ${ctx.contact.fullName}` },
      });
      return object;
    });

    // Apply execution gate
    const gateResult = await step.run("check-gate", async () => {
      const actionType = classification.includes("objection") || classification === "competitor_mention"
        ? "replyObjection" as const
        : "replyPositive" as const;

      return await gateAction({
        actionType,
        tenantId,
        replyContent,
        prospectDomain: ctx.company?.domain || undefined,
      });
    });

    // Execute based on gate result and agent decision
    if (reply.action === "escalate_to_human") {
      await step.run("escalate", async () => {
        // Create a notification for the founder
        const { notifications } = await import("@/db/schema");
        await db.insert(notifications).values({
          tenantId,
          userId: null as any, // broadcast to all users
          type: "sequence_reply",
          title: `Reply needs attention: ${ctx.contact.fullName}`,
          body: reply.reasoning,
          entityType: "contact",
          entityId: contactId,
        });
      });
      return { result: "escalated", reasoning: reply.reasoning };
    }

    if (reply.action === "close_sequence") {
      await step.run("close-sequence", async () => {
        await db
          .update(sequenceEnrollments)
          .set({ status: "completed" })
          .where(eq(sequenceEnrollments.id, enrollmentId));
      });
      await releaseEnrollmentById(enrollmentId); // Spec 14 — free the anti-collision lock on terminal.
      await updateTrustScore(tenantId, "email_negative_reply").catch(() => {});
      return { result: "closed", reasoning: reply.reasoning };
    }

    if (reply.action === "schedule_followup") {
      await step.run("schedule-followup", async () => {
        const followupDate = new Date();
        followupDate.setDate(followupDate.getDate() + (reply.followupDays || 90));

        await db
          .update(sequenceEnrollments)
          .set({ status: "paused", nextStepAt: followupDate })
          .where(eq(sequenceEnrollments.id, enrollmentId));
      });
      // Still send the acknowledgment reply
    }

    if (reply.action === "redirect_to_contact" && reply.redirectName) {
      // Search for the redirected contact in the company
      await step.run("handle-redirect", async () => {
        if (!ctx.company?.id) return;

        // Try to find the person they mentioned
        const existingContacts = await db
          .select()
          .from(contacts)
          .where(and(
            eq(contacts.companyId, ctx.company.id),
            eq(contacts.tenantId, tenantId),
          ));

        const match = existingContacts.find(c =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes((reply.redirectName || "").toLowerCase())
        );

        if (!match) {
          // Create a placeholder contact if we have enough info
          await db.insert(contacts).values({
            tenantId,
            companyId: ctx.company.id,
            firstName: reply.redirectName?.split(" ")[0] || null,
            lastName: reply.redirectName?.split(" ").slice(1).join(" ") || null,
            title: reply.redirectTitle || null,
            email: null,
          });
        }
      });
    }

    // Send the reply (if gate allows)
    if (gateResult.status === "execute" || gateResult.status === "delayed") {
      const status = gateResult.status === "delayed" ? "draft" : "queued";

      await step.run("create-reply-email", async () => {
        await db.insert(outboundEmails).values({
          tenantId,
          enrollmentId,
          contactId,
          stepNumber: 200, // high number = reply, not sequence step
          fromAddress: "pending@rotation",
          toAddress: ctx.contact.email || "",
          subject: reply.subject,
          bodyHtml: `<div>${reply.body.replace(/\n/g, "<br>")}</div>`,
          bodyText: reply.body,
          status,
          queuedAt: status === "queued" ? new Date() : null,
        });
      });

      return { result: status === "queued" ? "auto_sent" : "draft_created", action: reply.action, reasoning: reply.reasoning };
    }

    // Gate blocked or needs approval — create draft
    await step.run("create-draft", async () => {
      await db.insert(outboundEmails).values({
        tenantId,
        enrollmentId,
        contactId,
        stepNumber: 200,
        fromAddress: "pending@rotation",
        toAddress: ctx.contact.email || "",
        subject: reply.subject,
        bodyHtml: `<div>${reply.body.replace(/\n/g, "<br>")}</div>`,
        bodyText: reply.body,
        status: "draft",
      });
    });

    return { result: "pending_approval", action: reply.action, gateReason: gateResult.reason };
  }
);

function buildReplyPrompt(
  classification: string,
  replyContent: string,
  contextBlock: string,
  briefContext: string,
  originalSubject: string,
  tone: string
): string {
  const classificationInstructions: Record<string, string> = {
    not_now: `The prospect said "not now" or "bad timing." Your job:
1. Acknowledge gracefully (no pushback)
2. Ask when would be better (or infer from their message)
3. Set action to "schedule_followup" with followupDays (usually 60-90)
4. Reply should plant a seed, not sell ("I'll check back in Q3")`,

    wrong_person: `The prospect redirected you to someone else. Your job:
1. Thank them warmly
2. Ask for the referral's email if not provided
3. Set action to "redirect_to_contact" with redirectName/redirectTitle
4. Set subject to "Re: ${originalSubject}"
5. Reply is SHORT (2-3 sentences max)`,

    info_request: `The prospect wants more information. Your job:
1. Provide concise, relevant info from the context/brief
2. Answer their specific question if possible
3. Offer a call for deeper dive
4. Keep under 100 words
5. Action: "send_reply"`,

    competitor_mention: `The prospect mentions using or evaluating a competitor. Your job:
1. Never trash the competitor
2. Acknowledge their choice respectfully
3. Highlight ONE differentiator relevant to THEIR situation (from the brief)
4. Offer a specific comparison ("happy to show you how we differ on [X]")
5. Action: "send_reply"`,

    question: `The prospect asked a specific question. Your job:
1. Answer it directly from product knowledge
2. Be concise and specific
3. If you can't answer confidently, say "Let me check and get back to you" and escalate
4. Action: "send_reply" (or "escalate_to_human" if unsure)`,

    unsubscribe: `The prospect wants to stop receiving emails. Your job:
1. Acknowledge immediately
2. Apologize briefly for the inconvenience
3. Set action to "close_sequence"
4. Reply is 1-2 sentences max`,

    negative: `The prospect is clearly not interested. Your job:
1. Thank them for their time
2. Don't argue or pitch
3. Set action to "close_sequence"
4. Reply is 2 sentences max, graceful exit`,
  };

  const instruction = classificationInstructions[classification] || classificationInstructions["question"];

  return `You are an AI sales agent replying to a prospect's email. You act as the founder's voice.

${contextBlock}
${briefContext}

THEIR REPLY:
"${replyContent}"

CLASSIFICATION: ${classification}

YOUR TASK:
${instruction}

RULES:
- Subject: "Re: ${originalSubject}"
- Tone: "${tone}" — match their energy level
- NEVER fabricate case studies, metrics, or customer names
- NEVER mention you're an AI
- Keep replies under 100 words unless they asked a complex question
- If unsure about anything factual, escalate_to_human
- Be human: imperfect punctuation is fine, no corporate speak`;
}
