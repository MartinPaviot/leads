import { inngest } from "./client";
import { db } from "@/db";
import { companies, contacts, sequenceSteps, sequenceEnrollments, activities, outboundEmails, emailOptouts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { embedEntity, companyToText, contactToText } from "@/lib/embeddings";
import {
  enrichOrganization,
  enrichPerson,
  employeeCountToRange,
  revenueToRange,
  isApolloAvailable,
} from "@/lib/apollo-client";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-20250514");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

// Enrich a company after creation — uses Apollo API only, no LLM fallback
export const enrichCompany = inngest.createFunction(
  {
    id: "enrich-company",
    name: "Enrich Company Data",
    retries: 2,
    onFailure: async ({ error, event }) => {
      console.error(`[DEAD LETTER] enrich-company failed for ${(event as any).data?.companyId}:`, error.message);
    },
    triggers: [{ event: "company/created" }],
  },
  async ({ event, step }: { event: { data: { companyId: string; tenantId: string } }; step: any }) => {
    const { companyId } = event.data as {
      companyId: string;
      tenantId: string;
    };

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

    const props = (company.properties || {}) as Record<string, unknown>;
    if (props.enrichment_source === "apollo" && company.industry && company.description) {
      return { companyId, enriched: false, reason: "Already enriched from Apollo" };
    }

    if (!isApolloAvailable()) {
      return { companyId, enriched: false, reason: "Apollo API key not configured" };
    }

    if (!company.domain) {
      return { companyId, enriched: false, reason: "No domain — cannot enrich without domain" };
    }

    const org = await step.run("enrich-from-apollo", async () => {
      try {
        return await enrichOrganization(company.domain!);
      } catch (err) {
        console.warn(`Apollo enrichment failed for ${company.domain}:`, err);
        return null;
      }
    });

    if (!org) {
      await step.run("mark-unenriched", async () => {
        await db
          .update(companies)
          .set({
            properties: {
              ...props,
              enrichment_source: "unavailable",
              enrichment_attempted_at: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(eq(companies.id, companyId));
      });
      return { companyId, enriched: false, reason: "Apollo returned no data" };
    }

    await step.run("update-company", async () => {
      await db
        .update(companies)
        .set({
          industry: org.industry || company.industry,
          description: org.description || company.description,
          size: employeeCountToRange(org.estimated_num_employees),
          revenue: revenueToRange(org.annual_revenue),
          properties: {
            ...props,
            enrichment_source: "apollo",
            apollo_id: org.id,
            linkedin_url: org.linkedin_url,
            website_url: org.website_url,
            founded_year: org.founded_year,
            technologies: org.technology_names,
            total_funding: org.total_funding,
            total_funding_printed: org.total_funding_printed,
            latest_funding_stage: org.latest_funding_stage,
            employee_count: org.estimated_num_employees,
            annual_revenue: org.annual_revenue,
            annual_revenue_printed: org.annual_revenue_printed,
            city: org.city,
            state: org.state,
            country: org.country,
            keywords: org.keywords,
            enriched_at: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));
    });

    await step.run("re-embed", async () => {
      const text = companyToText({
        name: company.name,
        domain: company.domain,
        industry: org.industry,
        revenue: revenueToRange(org.annual_revenue),
        size: employeeCountToRange(org.estimated_num_employees),
        description: org.description,
      });
      if (text && process.env.OPENAI_API_KEY) {
        await embedEntity(event.data.tenantId || company.tenantId, "company", companyId, text);
      }
    });

    return { companyId, enriched: true, source: "apollo" };
  }
);

// Enrich a contact after creation — uses Apollo API only, no LLM fallback
export const enrichContact = inngest.createFunction(
  {
    id: "enrich-contact",
    name: "Enrich Contact Data",
    retries: 2,
    onFailure: async ({ error, event }) => {
      console.error(`[DEAD LETTER] enrich-contact failed for ${(event as any).data?.contactId}:`, error.message);
    },
    triggers: [{ event: "contact/created" }],
  },
  async ({ event, step }: { event: { data: { contactId: string; tenantId: string } }; step: any }) => {
    const { contactId } = event.data;

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

    const props = (contact.properties || {}) as Record<string, unknown>;
    if (props.enrichment_source === "apollo" && contact.title) {
      return { contactId, enriched: false, reason: "Already enriched from Apollo" };
    }

    if (!isApolloAvailable()) {
      return { contactId, enriched: false, reason: "Apollo API key not configured" };
    }

    const person = await step.run("enrich-from-apollo", async () => {
      try {
        const domain = contact.email?.split("@")[1];
        return await enrichPerson({
          email: contact.email || undefined,
          first_name: contact.firstName || undefined,
          last_name: contact.lastName || undefined,
          domain: domain || undefined,
        });
      } catch (err) {
        console.warn(`Apollo contact enrichment failed for ${contact.email}:`, err);
        return null;
      }
    });

    if (!person) {
      await step.run("mark-unenriched", async () => {
        await db
          .update(contacts)
          .set({
            properties: {
              ...props,
              enrichment_source: "unavailable",
              enrichment_attempted_at: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, contactId));
      });
      return { contactId, enriched: false, reason: "Apollo returned no data" };
    }

    await step.run("update-contact", async () => {
      let companyId = contact.companyId;
      if (!companyId && person.organization?.name) {
        const [existing] = await db
          .select()
          .from(companies)
          .where(eq(companies.name, person.organization.name))
          .limit(1);
        if (existing) companyId = existing.id;
      }

      const phone = person.phone_numbers?.[0]?.raw_number || contact.phone;

      await db
        .update(contacts)
        .set({
          title: person.title || contact.title,
          linkedinUrl: person.linkedin_url || contact.linkedinUrl,
          phone: phone,
          companyId: companyId || contact.companyId,
          properties: {
            ...props,
            enrichment_source: "apollo",
            apollo_id: person.id,
            seniority: person.seniority,
            departments: person.departments,
            email_status: person.email_status,
            headline: person.headline,
            city: person.city,
            state: person.state,
            country: person.country,
            organization_name: person.organization?.name,
            enriched_at: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, contactId));
    });

    await step.run("re-embed", async () => {
      const text = contactToText({
        firstName: contact.firstName,
        lastName: contact.lastName,
        title: person.title,
        email: contact.email,
        phone: person.phone_numbers?.[0]?.raw_number,
        companyName: person.organization?.name,
      });
      if (text && process.env.OPENAI_API_KEY) {
        await embedEntity(event.data.tenantId || contact.tenantId, "contact", contactId, text);
      }
    });

    return { contactId, enriched: true, source: "apollo" };
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
    retries: 3,
    onFailure: async ({ error, event }) => {
      console.error(`[DEAD LETTER] send-sequence-step failed for enrollment ${(event as any).data?.enrollmentId}:`, error.message);
    },
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
    retries: 3,
    onFailure: async ({ error, event }) => {
      console.error(`[DEAD LETTER] process-reply failed for enrollment ${(event as any).data?.enrollmentId}:`, error.message);
    },
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

      // If unsubscribe, update enrollment AND add to global opt-out list
      if (classification === "unsubscribe") {
        await step.run("mark-unsubscribed", async () => {
          await db
            .update(sequenceEnrollments)
            .set({ status: "unsubscribed" })
            .where(eq(sequenceEnrollments.id, enrollmentId));
        });

        // Add to global opt-out list so ALL future sequences are blocked
        await step.run("add-to-optout", async () => {
          const [enrollment] = await db
            .select()
            .from(sequenceEnrollments)
            .where(eq(sequenceEnrollments.id, enrollmentId))
            .limit(1);
          if (!enrollment) return;

          const [contact] = await db
            .select()
            .from(contacts)
            .where(eq(contacts.id, enrollment.contactId))
            .limit(1);
          if (!contact?.email) return;

          await db
            .insert(emailOptouts)
            .values({
              tenantId: contact.tenantId || "default",
              emailAddress: contact.email.toLowerCase(),
              reason: "unsubscribe",
            })
            .onConflictDoNothing();
        });
      }
    }

    return { enrollmentId, classification };
  }
);
