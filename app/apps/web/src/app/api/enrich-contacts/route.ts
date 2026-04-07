import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { z } from "zod";
import { embedEntity, contactToText } from "@/lib/embeddings";
import { enrichPerson, isApolloAvailable } from "@/lib/apollo-client";

const llmFallbackSchema = z.object({
  title: z.string().describe("Job title (e.g. CTO, VP Engineering, Founder)"),
  seniority: z.string().describe("Seniority level: C-Suite, VP, Director, Manager, IC, Unknown"),
  department: z.string().describe("Department: Engineering, Sales, Marketing, Product, Operations, Finance, HR, Other"),
  linkedinUrl: z.string().nullable().describe("LinkedIn profile URL if identifiable, null otherwise"),
  phone: z.string().nullable().describe("Phone number if known, null otherwise"),
  companyName: z.string().nullable().describe("Company name if identifiable from email domain or name"),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = checkRateLimit("enrich", authCtx.userId);
  if (rlResponse) return rlResponse;

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
          .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId)))
          .limit(1);

        if (!contact) {
          failed++;
          continue;
        }

        const props = (contact.properties || {}) as Record<string, unknown>;

        // Skip if already enriched from Apollo
        if (props.enrichment_source === "apollo" && contact.title) {
          enriched++;
          continue;
        }

        // Try Apollo first
        if (isApolloAvailable()) {
          try {
            const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
            const domain = contact.email?.split("@")[1];

            const person = await enrichPerson({
              email: contact.email || undefined,
              first_name: contact.firstName || undefined,
              last_name: contact.lastName || undefined,
              domain: domain || undefined,
            });

            if (person) {
              // Try to associate with existing company
              let companyId = contact.companyId;
              if (!companyId && person.organization?.name) {
                const [existingCompany] = await db
                  .select()
                  .from(companies)
                  .where(and(eq(companies.name, person.organization.name), eq(companies.tenantId, authCtx.tenantId)))
                  .limit(1);
                if (existingCompany) {
                  companyId = existingCompany.id;
                }
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
                .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId)));

              const text = contactToText({
                firstName: contact.firstName,
                lastName: contact.lastName,
                title: person.title,
                email: contact.email,
                phone: phone,
                companyName: person.organization?.name,
              });
              if (text && process.env.OPENAI_API_KEY) {
                await embedEntity(authCtx.tenantId, "contact", id, text).catch(console.warn);
              }

              enriched++;
              continue;
            }
          } catch (err) {
            console.warn(`Apollo contact enrichment failed for ${contact.email}:`, err);
            // Fall through to LLM fallback
          }
        }

        // No LLM fallback — mark as unavailable instead of hallucinating
        await db
          .update(contacts)
          .set({
            properties: {
              ...props,
              enrichment_source: "unavailable",
              enrichment_attempted_at: new Date().toISOString(),
              enrichment_error: !isApolloAvailable()
                ? "Apollo API key not configured"
                : "Apollo returned no data for this contact",
            },
            updatedAt: new Date(),
          })
          .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId)));

        failed++;
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
