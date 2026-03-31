import { inngest } from "./client";
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
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

// Send sequence step email
export const sendSequenceStep = inngest.createFunction(
  {
    id: "send-sequence-step",
    name: "Send Sequence Step",
    triggers: [{ event: "sequence/step-due" }],
  },
  async ({ event, step }: { event: { data: { sequenceId: string; contactId: string; stepNumber: number } }; step: any }) => {
    const { sequenceId, contactId, stepNumber } = event.data as {
      sequenceId: string;
      contactId: string;
      stepNumber: number;
    };

    const email = await step.run("generate-email", async () => {
      // TODO: Use LLM to generate personalized email (F4.2)
      return { subject: "placeholder", body: "placeholder" };
    });

    await step.run("send-email", async () => {
      // TODO: Send via email infrastructure (F4.4)
      return { sent: true };
    });

    return { sequenceId, contactId, stepNumber, sent: true };
  }
);
