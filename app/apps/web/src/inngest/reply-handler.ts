/**
 * Intelligent Reply Handler
 *
 * Triggered after processReply classifies a reply. Generates contextual
 * draft responses using full prospect intelligence, knowledge base for
 * objections, and meeting slots for positive replies.
 */

import { inngest } from "./client";
import { db } from "@/db";
import {
  sequenceEnrollments,
  contacts,
  outboundEmails,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { EMAIL_RULES, ANTI_HALLUCINATION_RULES } from "@/lib/prompts/shared-rules";
import { buildProspectContext, formatContextForPrompt } from "@/lib/prospect-context";
import { getAvailableSlots, formatSlotsForEmail } from "@/lib/meeting-booking";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

const replyEmailSchema = z.object({
  subject: z.string().describe("Reply subject (usually Re: original subject)"),
  body: z.string().describe("Reply body — professional, contextual, concise"),
});

interface ReplyClassifiedEvent {
  data: {
    enrollmentId: string;
    classification: string;
    reason: string;
    objectionDetail?: string;
    nextAction: string;
    urgency: string;
    replyContent: string;
  };
}

export const handleReplyIntelligently = inngest.createFunction(
  {
    id: "handle-reply-intelligently",
    name: "Intelligent Reply Handler",
    retries: 2,
    onFailure: async ({ error, event }) => {
      console.error(
        `[DEAD LETTER] handle-reply-intelligently failed for enrollment ${(event as any).data?.enrollmentId}:`,
        error.message
      );
    },
    triggers: [{ event: "reply/classified" }],
  },
  async ({ event, step }: { event: ReplyClassifiedEvent; step: any }) => {
    const {
      enrollmentId,
      classification,
      reason,
      objectionDetail,
      nextAction,
      urgency,
      replyContent,
    } = event.data;

    const model = getLLMModel();
    if (!model) return { enrollmentId, result: "skipped", reason: "No LLM" };

    // Load enrollment + contact
    const enrollment = await step.run("load-enrollment", async () => {
      const [e] = await db
        .select()
        .from(sequenceEnrollments)
        .where(eq(sequenceEnrollments.id, enrollmentId))
        .limit(1);
      return e;
    });

    if (!enrollment) return { enrollmentId, result: "skipped", reason: "Enrollment not found" };

    // Get contact's tenant
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, enrollment.contactId))
      .limit(1);

    if (!contact) return { enrollmentId, result: "skipped", reason: "Contact not found" };
    const tenantId = contact.tenantId;

    // Build full prospect context
    const ctx = await step.run("build-context", async () => {
      return await buildProspectContext(enrollment.contactId, tenantId);
    });

    if (!ctx) return { enrollmentId, result: "skipped", reason: "No context" };

    // Get the original email thread
    const lastEmail = await step.run("get-last-email", async () => {
      const [email] = await db
        .select({ subject: outboundEmails.subject, bodyText: outboundEmails.bodyText })
        .from(outboundEmails)
        .where(eq(outboundEmails.enrollmentId, enrollmentId))
        .orderBy(outboundEmails.stepNumber)
        .limit(1);
      return email;
    });

    const contextBlock = formatContextForPrompt(ctx);

    // Route based on classification
    if (classification === "interested" || classification === "meeting_request") {
      // ── Positive reply: propose meeting ──
      const meetingSlots = await step.run("get-slots", async () => {
        // Use the first user ID we can find (tenant owner) — simplified
        const { users } = await import("@/db/schema");
        const [user] = await db.select({ id: users.id }).from(users).limit(1);
        if (!user) return "";
        const slots = await getAvailableSlots(user.id);
        return formatSlotsForEmail(slots, 3);
      });

      const reply = await step.run("generate-positive-reply", async () => {
        const { object } = await tracedGenerateObject({
          model,
          schema: replyEmailSchema,
          prompt: `You are replying to a POSITIVE response from a prospect. They are interested or want a meeting.

${contextBlock}

THEIR REPLY:
"${replyContent}"

CLASSIFICATION: ${classification} — ${reason}
RECOMMENDED ACTION: ${nextAction}
URGENCY: ${urgency}

OUR LAST EMAIL:
Subject: ${lastEmail?.subject || "unknown"}
Body: ${lastEmail?.bodyText || "unknown"}

${meetingSlots ? `AVAILABLE MEETING TIMES:\n${meetingSlots}` : ""}

${EMAIL_RULES}
${ANTI_HALLUCINATION_RULES}

ADDITIONAL RULES:
- Be warm but not gushing — match their energy level
- Answer any specific question they asked
- ${meetingSlots ? "Propose the available times naturally — don't force it" : "Suggest scheduling a call without specific times"}
- Keep it under 100 words
- Subject: "Re: ${lastEmail?.subject || "our conversation"}"
- Do NOT restate the product pitch — they already know
- Match the tone: "${ctx.aiTone}"`,
          _trace: { agentId: "follow-up-email", tenantId, inputPreview: `Positive reply from ${ctx.contact.fullName}` },
        });
        return object as { subject: string; body: string };
      });

      // Auto-queue the positive reply for sending (not just draft).
      // The email-send-worker picks it up on its next 2-min cron cycle.
      // WS-1 — route the "ok to auto-send?" decision through the
      // guardrail helper so reply-handler, autonomous-pipeline, and
      // email-send-worker all agree on what counts as autonomous.
      const settings = await step.run("load-settings", async () => {
        const { getTenantSettings } = await import("@/lib/tenant-settings");
        return getTenantSettings(tenantId);
      });

      const { readApprovalMode, enforceAgentApprovalMode } = await import(
        "@/lib/guardrails/approval-mode"
      );
      const approvalDecision = enforceAgentApprovalMode({
        mode: readApprovalMode(settings),
        action: "email-reply",
        // A positive-classification reply is structurally low risk
        // (the prospect asked to continue); treat as high-confidence
        // so auto-high-confidence tenants keep their pre-WS-1 flow.
        // Confidence fed to the helper is per-action; the threshold
        // table owns the cutoff.
        confidence: 0.9,
      });
      const autoSend = approvalDecision.allowed;

      await step.run("create-positive-reply", async () => {
        await db.insert(outboundEmails).values({
          tenantId,
          enrollmentId,
          contactId: enrollment.contactId,
          stepNumber: (enrollment.currentStep || 1) + 100,
          fromAddress: "pending@rotation",
          toAddress: contact.email!,
          subject: reply.subject,
          bodyHtml: `<div>${reply.body.replace(/\n/g, "<br>")}</div>`,
          bodyText: reply.body,
          status: autoSend ? "queued" : "draft",
          queuedAt: autoSend ? new Date() : null,
        });
      });

      return { enrollmentId, result: autoSend ? "auto_queued" : "draft_created", classification, urgency };
    }

    if (classification.startsWith("objection_")) {
      // ── Objection: use knowledge base to craft response ──
      const objectionType = classification.replace("objection_", "");

      // Find relevant knowledge
      const relevantKnowledge = ctx.knowledge
        .filter((k: { topic: string; content: string }) => {
          const topic = k.topic.toLowerCase();
          return (
            topic.includes("objection") ||
            topic.includes("competitor") ||
            topic.includes("pricing") ||
            topic.includes("positioning")
          );
        })
        .map((k: { topic: string; content: string }) => `${k.topic}: ${k.content}`)
        .join("\n");

      const reply = await step.run("generate-objection-reply", async () => {
        const { object } = await tracedGenerateObject({
          model,
          schema: replyEmailSchema,
          prompt: `You are replying to an OBJECTION from a prospect. Handle it with empathy and intelligence.

${contextBlock}

THEIR REPLY:
"${replyContent}"

OBJECTION TYPE: ${objectionType}
SPECIFIC CONCERN: ${objectionDetail || "not specified"}
RECOMMENDED ACTION: ${nextAction}

OUR LAST EMAIL:
Subject: ${lastEmail?.subject || "unknown"}

OUR KNOWLEDGE BASE ON HANDLING THIS:
${relevantKnowledge || "No specific knowledge available — use general best practices."}

OBJECTION HANDLING FRAMEWORK:
1. Acknowledge their concern genuinely (not dismissively)
2. Reframe: ${objectionType === "price" ? "shift to ROI/cost-of-inaction" : objectionType === "timing" ? "plant a seed for the right time, offer lightweight next step" : objectionType === "competitor" ? "differentiate on the specific dimension that matters to them" : "offer to include the right stakeholder"}
3. Provide ONE specific proof point (case study, metric, or quote)
4. End with a low-pressure next step

${EMAIL_RULES}
${ANTI_HALLUCINATION_RULES}

ADDITIONAL RULES:
- Never argue or get defensive
- Never trash the competition by name
- Keep it under 120 words
- Subject: "Re: ${lastEmail?.subject || "our conversation"}"
- Tone: "${ctx.aiTone}" — empathetic but confident`,
          _trace: { agentId: "follow-up-email", tenantId, inputPreview: `Objection (${objectionType}) from ${ctx.contact.fullName}` },
        });
        return object as { subject: string; body: string };
      });

      await step.run("create-objection-draft", async () => {
        await db.insert(outboundEmails).values({
          tenantId,
          enrollmentId,
          contactId: enrollment.contactId,
          stepNumber: (enrollment.currentStep || 1) + 100,
          fromAddress: "pending@rotation",
          toAddress: contact.email!,
          subject: reply.subject,
          bodyHtml: `<div>${reply.body.replace(/\n/g, "<br>")}</div>`,
          bodyText: reply.body,
          status: "draft",
        });
      });

      return { enrollmentId, result: "draft_created", classification, objectionType };
    }

    return { enrollmentId, result: "no_action", classification };
  }
);
