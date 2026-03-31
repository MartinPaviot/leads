import { auth } from "@/auth";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { embedEntity, contactToText } from "@/lib/embeddings";

const contactEnrichmentSchema = z.object({
  title: z.string().describe("Job title (e.g. CTO, VP Engineering, Founder)"),
  seniority: z.string().describe("Seniority level: C-Suite, VP, Director, Manager, IC, Unknown"),
  department: z.string().describe("Department: Engineering, Sales, Marketing, Product, Operations, Finance, HR, Other"),
  linkedinUrl: z.string().nullable().describe("LinkedIn profile URL if identifiable, null otherwise"),
  phone: z.string().nullable().describe("Phone number if known, null otherwise"),
  companyName: z.string().nullable().describe("Company name if identifiable from email domain or name"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-20250514")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ error: "No LLM API key configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { contactIds } = body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return Response.json({ error: "contactIds array required" }, { status: 400 });
    }

    let enriched = 0;
    let failed = 0;

    for (const id of contactIds.slice(0, 20)) {
      try {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, id))
          .limit(1);

        if (!contact) {
          failed++;
          continue;
        }

        // Skip if already enriched (has title and either linkedinUrl or seniority in properties)
        const props = contact.properties as Record<string, unknown> | null;
        if (contact.title && (contact.linkedinUrl || props?.seniority)) {
          enriched++;
          continue;
        }

        const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

        const { object } = await generateObject({
          model,
          schema: contactEnrichmentSchema,
          prompt: `Research this professional contact and provide their details.

Name: ${name || "Unknown"}
Email: ${contact.email || "unknown"}

Provide accurate professional data. If you can infer the company from the email domain, do so.
If you're not sure about exact details, give your best estimate. Set nullable fields to null if unknown.`,
        });

        // Try to associate with existing company if companyName identified
        let companyId = contact.companyId;
        if (!companyId && object.companyName) {
          const [existingCompany] = await db
            .select()
            .from(companies)
            .where(eq(companies.name, object.companyName))
            .limit(1);
          if (existingCompany) {
            companyId = existingCompany.id;
          }
        }

        await db
          .update(contacts)
          .set({
            title: object.title || contact.title,
            linkedinUrl: object.linkedinUrl || contact.linkedinUrl,
            phone: object.phone || contact.phone,
            companyId: companyId || contact.companyId,
            properties: {
              ...(props || {}),
              seniority: object.seniority,
              department: object.department,
              enrichedCompanyName: object.companyName,
            },
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, id));

        // Re-embed with enriched data
        const text = contactToText({
          firstName: contact.firstName,
          lastName: contact.lastName,
          title: object.title,
          email: contact.email,
          phone: object.phone,
          companyName: object.companyName,
        });
        if (text && process.env.OPENAI_API_KEY) {
          await embedEntity("default", "contact", id, text).catch(console.warn);
        }

        enriched++;
      } catch (err) {
        console.warn(`Failed to enrich contact ${id}:`, err);
        failed++;
      }
    }

    return Response.json({ success: true, enriched, failed });
  } catch (error) {
    console.error("Contact enrichment failed:", error);
    return Response.json({ error: "Contact enrichment failed" }, { status: 500 });
  }
}
