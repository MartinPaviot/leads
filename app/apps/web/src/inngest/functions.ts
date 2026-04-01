import { inngest } from "./client";
import { db } from "@/db";
import { companies, contacts, sequenceSteps, sequenceEnrollments, activities, outboundEmails, emailOptouts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { embedEntity, companyToText, contactToText } from "@/lib/embeddings";

const enrichmentSchema = z.object({
  industry: z.string().describe("Primary industry (e.g. Fintech, SaaS, AI/ML, Healthcare)"),
  description: z.string().describe("1-2 sentence company description"),
  size: z.string().describe("Employee count range (e.g. 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+)"),
  revenue: z.string().describe("Estimated annual revenue range (e.g. <$1M, $1M-$10M, $10M-$50M, $50M-$100M, $100M+)"),
});

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-20250514");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

// Enrich a company after creation
export const enrichCompany = inngest.createFunction(
  {
    id: "enrich-company",
    name: "Enrich Company Data",
    retries: 2,
    triggers: [{ event: "company/created" }],
  },
  async ({ event, step }: { event: { data: { companyId: string; tenantId: string } }; step: any }) => {
    const { companyId } = event.data as {
      companyId: string;
      tenantId: string;
    };

    const model = getLLMModel();
    if (!model) {
      return { companyId, enriched: false, reason: "No LLM API key" };
    }

    const company = await step.run("fetch-company", async () => {
      const [c] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      return c || null;
    });

    if (!company) {
      return { companyId, enriched: false, reason: "Company not found" };
    }

    if (company.industry && company.description) {
      return { companyId, enriched: false, reason: "Already enriched" };
    }

    const enrichment = await step.run("enrich-from-llm", async () => {
      const { object } = await generateObject({
        model: model!,
        schema: enrichmentSchema,
        prompt: `Research the company "${company.name}"${company.domain ? ` (domain: ${company.domain})` : ""}.
Provide accurate firmographic data. If you're not sure about exact numbers, give your best estimate based on what you know.
If you don't recognize the company, provide reasonable estimates based on the name and domain.`,
      });
      return object;
    });

    await step.run("update-company", async () => {
      await db
        .update(companies)
        .set({
          industry: enrichment.industry,
          description: enrichment.description,
          size: enrichment.size,
          revenue: enrichment.revenue,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));
    });

    await step.run("re-embed", async () => {
      const text = companyToText({
        name: company.name,
        domain: company.domain,
        industry: enrichment.industry,
        revenue: enrichment.revenue,
        size: enrichment.size,
        description: enrichment.description,
      });
      if (text && process.env.OPENAI_API_KEY) {
        await embedEntity("default", "company", companyId, text);
      }
    });

    return { companyId, enriched: true };
  }
);

const contactEnrichmentSchema = z.object({
  title: z.string().describe("Job title"),
  seniority: z.string().describe("Seniority: C-Suite, VP, Director, Manager, IC, Unknown"),
  department: z.string().describe("Department: Engineering, Sales, Marketing, Product, Operations, Finance, HR, Other"),
  linkedinUrl: z.string().nullable().describe("LinkedIn URL if identifiable, null otherwise"),
  phone: z.string().nullable().describe("Phone if known, null otherwise"),
  companyName: z.string().nullable().describe("Company name if identifiable"),
});

// Enrich a contact after creation
export const enrichContact = inngest.createFunction(
  {
    id: "enrich-contact",
    name: "Enrich Contact Data",
    retries: 2,
    triggers: [{ event: "contact/created" }],
  },
  async ({ event, step }: { event: { data: { contactId: string; tenantId: string } }; step: any }) => {
    const { contactId } = event.data;

    const model = getLLMModel();
    if (!model) {
      return { contactId, enriched: false, reason: "No LLM API key" };
    }

    const contact = await step.run("fetch-contact", async () => {
      const [c] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);
      return c || null;
    });

    if (!contact) {
      return { contactId, enriched: false, reason: "Contact not found" };
    }

    const props = contact.properties as Record<string, unknown> | null;
    if (contact.title && (contact.linkedinUrl || props?.seniority)) {
      return { contactId, enriched: false, reason: "Already enriched" };
    }

    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

    const enrichment = await step.run("enrich-from-llm", async () => {
      const { object } = await generateObject({
        model: model!,
        schema: contactEnrichmentSchema,
        prompt: `Research this professional contact and provide their details.
Name: ${name || "Unknown"}
Email: ${contact.email || "unknown"}
Provide accurate professional data.`,
      });
      return object;
    });

    await step.run("update-contact", async () => {
      let companyId = contact.companyId;
      if (!companyId && enrichment.companyName) {
        const [existing] = await db
          .select()
          .from(companies)
          .where(eq(companies.name, enrichment.companyName))
          .limit(1);
        if (existing) companyId = existing.id;
      }

      await db
        .update(contacts)
        .set({
          title: enrichment.title || contact.title,
          linkedinUrl: enrichment.linkedinUrl || contact.linkedinUrl,
          phone: enrichment.phone || contact.phone,
          companyId: companyId || contact.companyId,
          properties: {
            ...(props || {}),
            seniority: enrichment.seniority,
            department: enrichment.department,
            enrichedCompanyName: enrichment.companyName,
          },
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, contactId));
    });

    await step.run("re-embed", async () => {
      const text = contactToText({
        firstName: contact.firstName,
        lastName: contact.lastName,
        title: enrichment.title,
        email: contact.email,
        phone: enrichment.phone,
        companyName: enrichment.companyName,
      });
      if (text && process.env.OPENAI_API_KEY) {
        await embedEntity("default", "contact", contactId, text);
      }
    });

    return { contactId, enriched: true };
  }
);

const emailSchema = z.object({
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Email body, professional and personalized"),
});

// Send sequence step email
export const sendSequenceStep = inngest.createFunction(
  {
    id: "send-sequence-step",
    name: "Send Sequence Step",
    triggers: [{ event: "sequence/step-due" }],
  },
  async ({ event, step }: { event: { data: { enrollmentId: string } }; step: any }) => {
    const { enrollmentId } = event.data;

    const enrollment = await step.run("fetch-enrollment", async () => {
      const [e] = await db
        .select()
        .from(sequenceEnrollments)
        .where(eq(sequenceEnrollments.id, enrollmentId))
        .limit(1);
      return e || null;
    });

    if (!enrollment || enrollment.status !== "active") {
      return { enrollmentId, sent: false, reason: "Not active" };
    }

    // Fetch the step template
    const stepTemplate = await step.run("fetch-step", async () => {
      const [s] = await db
        .select()
        .from(sequenceSteps)
        .where(
          and(
            eq(sequenceSteps.sequenceId, enrollment.sequenceId),
            eq(sequenceSteps.stepNumber, enrollment.currentStep)
          )
        )
        .limit(1);
      return s || null;
    });

    if (!stepTemplate) {
      // No more steps — mark completed
      await step.run("mark-completed", async () => {
        await db
          .update(sequenceEnrollments)
          .set({ status: "completed" })
          .where(eq(sequenceEnrollments.id, enrollmentId));
      });
      return { enrollmentId, sent: false, reason: "No more steps" };
    }

    // Fetch contact for personalization
    const contact = await step.run("fetch-contact", async () => {
      const [c] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, enrollment.contactId))
        .limit(1);
      return c || null;
    });

    if (!contact || !contact.email) {
      return { enrollmentId, sent: false, reason: "No contact email" };
    }

    // Generate personalized email using template + LLM
    const model = getLLMModel();
    let subject = stepTemplate.subjectTemplate;
    let body = stepTemplate.bodyTemplate;

    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

    // Substitute template variables
    const vars: Record<string, string> = {
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      fullName: contactName,
      title: contact.title || "",
    };

    for (const [key, value] of Object.entries(vars)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      subject = subject.replace(pattern, value);
      body = body.replace(pattern, value);
    }

    // If LLM available, enhance the email
    if (model) {
      const enhanced = await step.run("enhance-email", async () => {
        const { object } = await generateObject({
          model: model!,
          schema: emailSchema,
          prompt: `Personalize this email for ${contactName} (${contact.title || "professional"}).

Subject: ${subject}
Body: ${body}

Make it more specific and engaging. Keep the core message but add personal touches.`,
        });
        return object;
      });
      subject = enhanced.subject;
      body = enhanced.body;
    }

    // Check opt-out before sending
    const optedOut = await step.run("check-optout", async () => {
      const [opt] = await db
        .select()
        .from(emailOptouts)
        .where(
          and(
            eq(emailOptouts.tenantId, "default"),
            eq(emailOptouts.emailAddress, contact.email!)
          )
        )
        .limit(1);
      return !!opt;
    });

    if (optedOut) {
      return { enrollmentId, sent: false, reason: "Opted out" };
    }

    // Create outbound email record (draft or queued depending on autopilot)
    const outboundEmail = await step.run("create-outbound-email", async () => {
      const [email] = await db
        .insert(outboundEmails)
        .values({
          tenantId: "default",
          enrollmentId,
          contactId: enrollment.contactId,
          stepNumber: enrollment.currentStep,
          fromAddress: "pending@rotation", // Will be set by send worker
          toAddress: contact.email!,
          subject,
          bodyHtml: `<div>${body.replace(/\n/g, "<br>")}</div>`,
          bodyText: body,
          status: "queued", // Goes straight to queue — review queue can intercept if needed
          queuedAt: new Date(),
        })
        .returning();
      return email;
    });

    // Log activity
    await step.run("log-send", async () => {
      await db.insert(activities).values({
        tenantId: "default",
        actorType: "system",
        actorId: null,
        entityType: "contact",
        entityId: enrollment.contactId,
        activityType: "sequence_step_sent",
        channel: "email",
        direction: "outbound",
        summary: `Sequence step ${enrollment.currentStep}: ${subject}`,
        rawContent: body,
        metadata: {
          sequenceId: enrollment.sequenceId,
          stepNumber: enrollment.currentStep,
          enrollmentId,
          outboundEmailId: outboundEmail.id,
          to: contact.email,
        },
      });
    });

    // Advance to next step
    await step.run("advance-step", async () => {
      const nextStep = enrollment.currentStep + 1;

      // Check if next step exists
      const [nextStepTemplate] = await db
        .select()
        .from(sequenceSteps)
        .where(
          and(
            eq(sequenceSteps.sequenceId, enrollment.sequenceId),
            eq(sequenceSteps.stepNumber, nextStep)
          )
        )
        .limit(1);

      if (nextStepTemplate) {
        const nextStepAt = new Date();
        nextStepAt.setDate(nextStepAt.getDate() + (nextStepTemplate.delayDays || 2));

        await db
          .update(sequenceEnrollments)
          .set({
            currentStep: nextStep,
            lastStepAt: new Date(),
            nextStepAt,
          })
          .where(eq(sequenceEnrollments.id, enrollmentId));
      } else {
        await db
          .update(sequenceEnrollments)
          .set({
            status: "completed",
            lastStepAt: new Date(),
            nextStepAt: null,
          })
          .where(eq(sequenceEnrollments.id, enrollmentId));
      }
    });

    return { enrollmentId, sent: true, step: enrollment.currentStep };
  }
);

// Process replies and classify them
export const processReply = inngest.createFunction(
  {
    id: "process-reply",
    name: "Process Sequence Reply",
    triggers: [{ event: "email/reply-received" }],
  },
  async ({ event, step }: { event: { data: { enrollmentId: string; replyContent: string } }; step: any }) => {
    const { enrollmentId, replyContent } = event.data;

    // Mark enrollment as replied
    await step.run("mark-replied", async () => {
      await db
        .update(sequenceEnrollments)
        .set({ status: "replied" })
        .where(eq(sequenceEnrollments.id, enrollmentId));
    });

    // Classify the reply if LLM available
    const model = getLLMModel();
    let classification = "unknown";

    if (model) {
      const result = await step.run("classify-reply", async () => {
        const { object } = await generateObject({
          model: model!,
          schema: z.object({
            classification: z.enum(["positive", "negative", "ooo", "unsubscribe", "unknown"]),
            reason: z.string(),
          }),
          prompt: `Classify this email reply:

"${replyContent.slice(0, 500)}"

Classifications:
- positive: interested, wants to learn more, asks questions
- negative: not interested, rejection
- ooo: out of office auto-reply
- unsubscribe: asks to be removed
- unknown: unclear intent`,
        });
        return object;
      });
      classification = result.classification;

      // If unsubscribe, update enrollment
      if (classification === "unsubscribe") {
        await step.run("mark-unsubscribed", async () => {
          await db
            .update(sequenceEnrollments)
            .set({ status: "unsubscribed" })
            .where(eq(sequenceEnrollments.id, enrollmentId));
        });
      }
    }

    return { enrollmentId, classification };
  }
);
