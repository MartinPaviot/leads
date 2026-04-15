import { db } from "@/db";
import {
  activities,
  companies,
  contacts,
  sequences,
  sequenceSteps,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { z } from "zod";
import { buildProspectContext } from "@/lib/prospect-context";
import { generateSequence } from "@/lib/sequence-generator";
import { makeTool, type ToolContext } from "./context";

function pickModel() {
  return process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
}

export function buildActionTools(ctx: ToolContext) {
  const { tenantId } = ctx;

  return {
    draftEmail: makeTool({
      description:
        "Draft a personalized email to a contact. Returns the email content for the user to review and send via the email composer. Use when the user asks to 'email', 'draft', 'write to', 'follow up with', or 'reach out to' someone.",
      inputSchema: z.object({
        contactId: z.string().describe("Contact ID to email"),
        purpose: z
          .string()
          .describe("Purpose of the email: follow-up, introduction, revival, meeting-request, custom"),
        customInstructions: z
          .string()
          .optional()
          .describe("Any specific instructions from the user about what to include"),
      }),
      execute: async (input) => {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, input.contactId), eq(contacts.tenantId, tenantId)))
          .limit(1);
        if (!contact) return { error: "Contact not found" };

        const recentInteractions = await db
          .select()
          .from(activities)
          .where(
            and(
              eq(activities.tenantId, tenantId),
              eq(activities.entityType, "contact"),
              eq(activities.entityId, input.contactId)
            )
          )
          .orderBy(desc(activities.occurredAt))
          .limit(5);

        const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
        let company = null;
        if (contact.companyId) {
          const [c] = await db
            .select()
            .from(companies)
            .where(eq(companies.id, contact.companyId))
            .limit(1);
          company = c;
        }

        const { getWritingSamples, buildWritingStylePrompt } = await import(
          "@/lib/writing-profile"
        );
        const samples = await getWritingSamples(tenantId);
        const stylePrompt = buildWritingStylePrompt(samples);

        return {
          emailDraft: {
            to: contact.email,
            contactName,
            company: company?.name,
            purpose: input.purpose,
            recentInteractions: recentInteractions.map((a) => ({
              type: a.activityType,
              summary: a.summary,
              date: a.occurredAt,
            })),
          },
          instruction: `Use this context to generate a personalized email. Include specifics from recent interactions. Keep it concise and actionable.${
            stylePrompt ? `\n\n${stylePrompt}` : ""
          }\n\nReturn the draft in your response.`,
        };
      },
    }),

    generateFollowUpEmail: makeTool({
      description:
        "Generate a follow-up email draft based on meeting notes or last interaction context. Extracts action items and references specific discussion points. Use when the user asks to 'draft a follow-up to X after our meeting', 'write a follow-up based on these notes', etc. Returns subject + body + actionItems for review in the email composer.",
      inputSchema: z.object({
        contactId: z.string().describe("Contact ID to follow up with"),
        context: z
          .string()
          .describe(
            "Meeting notes or last-interaction summary that the follow-up should reference"
          ),
      }),
      execute: async (input) => {
        const model = pickModel();
        if (!model) return { error: "No LLM API key configured" };

        const [contact] = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, input.contactId), eq(contacts.tenantId, tenantId)))
          .limit(1);
        if (!contact) return { error: "Contact not found" };

        let company = null;
        if (contact.companyId) {
          const [c] = await db
            .select()
            .from(companies)
            .where(and(eq(companies.id, contact.companyId), eq(companies.tenantId, tenantId)))
            .limit(1);
          company = c || null;
        }

        const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
        const prompt = `Write a follow-up email based on the meeting notes or last interaction summary below.
Extract specific action items from the context and reference them in the email.

RECIPIENT:
- Name: ${contactName || "Unknown"}
- Title: ${contact.title || "Unknown"}
- Email: ${contact.email || "Unknown"}
${company ? `- Company: ${company.name}` : ""}

MEETING NOTES / LAST INTERACTION:
${input.context}

RULES:
- Extract all action items mentioned or implied in the context
- Reference specific discussion points from the meeting
- Keep the tone professional but warm
- Include a clear summary of agreed next steps
- Keep the email concise (under 250 words)
- End with a specific call-to-action tied to the next steps`;

        const followUpSchema = z.object({
          subject: z.string(),
          body: z.string(),
          actionItems: z.array(z.string()),
        });

        const { object } = await tracedGenerateObject({
          model,
          schema: followUpSchema,
          prompt,
          _trace: { agentId: "follow-up-email", tenantId },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = object as any;

        return {
          emailDraft: {
            to: contact.email,
            contactName,
            company: company?.name,
            subject: result.subject,
            body: result.body,
            actionItems: result.actionItems,
          },
          instruction:
            "Preview the draft in the email composer. User can edit before sending.",
        };
      },
    }),

    suggestEmailReply: makeTool({
      description:
        "Suggest 3 reply options (brief / detailed / decline) to an incoming email. Use when the user asks 'how should I reply to this?', 'suggest a response', 'draft replies to this email'. Returns three distinct drafts with different tones for the user to pick from.",
      inputSchema: z.object({
        emailContent: z.string().describe("The incoming email body to reply to"),
        senderName: z.string().optional().describe("Name of the sender (for personalization)"),
        senderEmail: z.string().optional().describe("Email of the sender"),
      }),
      execute: async (input) => {
        const model = pickModel();
        if (!model) return { error: "No LLM API key configured" };

        const prompt = `Generate 3 reply options for this incoming email. Each reply should have a different tone and serve a different purpose.

FROM: ${input.senderName || "Unknown"} <${input.senderEmail || "unknown"}>

EMAIL CONTENT:
${input.emailContent}

Generate exactly 3 replies:
1. "brief" — A short, friendly reply that moves things forward (2-3 sentences max). Must include a concrete next step.
2. "detailed" — A thorough response addressing every question or topic raised. Shows you read carefully.
3. "decline" — A gracious decline or deferral. Suggests an alternative path or timeline. Zero guilt, door stays open.

RULES:
- Reference specific points from the original email — never give a generic reply
- Use ${input.senderName || "the sender"}'s name naturally (once, not repeatedly)
- Match formality to the incoming email's tone
- No "I hope this finds you well" or "Thanks for reaching out" openers
- Every reply must have a clear call-to-action or next step
- Keep the brief reply under 40 words, the detailed reply under 150 words`;

        const suggestReplySchema = z.object({
          replies: z.array(
            z.object({
              tone: z.string(),
              subject: z.string(),
              body: z.string(),
            })
          ),
        });

        const { object } = await tracedGenerateObject({
          model,
          schema: suggestReplySchema,
          prompt,
          _trace: { agentId: "suggest-reply", tenantId },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = object as any;

        return { replies: result.replies };
      },
    }),

    proposeCampaign: makeTool({
      description: `Propose an outbound email campaign targeting specific accounts. Use when user asks to "launch a campaign", "reach out to", "start outreach", or "email my top accounts". Creates a draft sequence and returns a proposal for user approval.`,
      inputSchema: z.object({
        targetDescription: z
          .string()
          .describe(
            "Description of who to target, e.g. 'fintech companies with score B or above'"
          ),
        campaignGoal: z.string().describe("What the campaign aims to achieve, e.g. 'book demo meetings'"),
        stepCount: z.number().optional().describe("Number of email steps (default 3)"),
      }),
      execute: async (input) => {
        const steps = input.stepCount || 3;

        const allAccounts = await db
          .select({
            id: companies.id,
            name: companies.name,
            domain: companies.domain,
            industry: companies.industry,
            score: companies.score,
          })
          .from(companies)
          .where(eq(companies.tenantId, tenantId))
          .orderBy(desc(companies.score))
          .limit(100);

        const targetDesc = input.targetDescription.toLowerCase();
        let matched = allAccounts;

        const industryKeywords = allAccounts
          .map((a) => a.industry)
          .filter(Boolean)
          .map((i) => i!.toLowerCase());
        const industryMatch = industryKeywords.find((i) => targetDesc.includes(i));
        if (industryMatch) {
          matched = matched.filter((a) => a.industry?.toLowerCase() === industryMatch);
        }

        if (targetDesc.includes("score a") || targetDesc.includes("grade a")) {
          matched = matched.filter((a) => (a.score || 0) >= 80);
        } else if (
          targetDesc.includes("score b") ||
          targetDesc.includes("grade b") ||
          targetDesc.includes("b or above") ||
          targetDesc.includes("b+")
        ) {
          matched = matched.filter((a) => (a.score || 0) >= 60);
        }

        matched = matched.slice(0, 20);

        if (matched.length === 0) {
          return {
            type: "campaign_proposal",
            status: "no_matches",
            message: `No accounts match "${input.targetDescription}". Try broadening your criteria or check your TAM.`,
            targetCount: 0,
          };
        }

        const [seq] = await db
          .insert(sequences)
          .values({
            tenantId,
            name: `Campaign: ${input.campaignGoal}`,
            description: `Auto-generated campaign targeting: ${input.targetDescription}`,
            status: "draft",
          })
          .returning();

        let generatedSteps = false;
        const topCompany = matched[0];
        if (topCompany) {
          const [bestContact] = await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(and(eq(contacts.companyId, topCompany.id), eq(contacts.tenantId, tenantId)))
            .orderBy(desc(contacts.score))
            .limit(1);

          if (bestContact) {
            try {
              const prospectCtx = await buildProspectContext(bestContact.id, tenantId);
              if (prospectCtx) {
                const generated = await generateSequence(prospectCtx, {
                  stepCount: steps,
                  tenantId,
                });
                for (const step of generated.steps) {
                  await db.insert(sequenceSteps).values({
                    sequenceId: seq.id,
                    stepNumber: step.stepNumber,
                    delayDays: step.delayDays,
                    subjectTemplate: step.subject,
                    bodyTemplate: step.body,
                  });
                }
                generatedSteps = true;
              }
            } catch (err) {
              console.warn("Failed to generate AI steps, using placeholders:", err);
            }
          }
        }

        if (!generatedSteps) {
          for (let i = 1; i <= steps; i++) {
            const delay = i === 1 ? 0 : i === 2 ? 3 : 5;
            await db.insert(sequenceSteps).values({
              sequenceId: seq.id,
              stepNumber: i,
              delayDays: delay,
              subjectTemplate: `Step ${i} — ${input.campaignGoal}`,
              bodyTemplate: `[Visit /sequences/${seq.id} to generate personalized content]`,
            });
          }
        }

        return {
          type: "campaign_proposal",
          status: "proposed",
          sequenceId: seq.id,
          sequenceName: seq.name,
          targetCount: matched.length,
          targets: matched.slice(0, 5).map((a) => ({
            name: a.name,
            industry: a.industry,
            score: a.score,
          })),
          stepCount: steps,
          goal: input.campaignGoal,
          message: `Campaign proposed: ${matched.length} accounts, ${steps} email steps. The user can review and launch from the Campaigns page at /sequences/${seq.id}.`,
          isProposal: true,
          proposalAction: "campaign",
        };
      },
    }),
  };
}
