import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";
import { embedEntity, contactToText } from "@/lib/ai/embeddings";
import { isApolloAvailable } from "@/lib/integrations/apollo-client";
import { enrichContact } from "@/lib/providers/contact-enrichment/waterfall";

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

  const rlResponse = await checkRateLimit("enrich", authCtx.userId);
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
          .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
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

        // Enrich via the CH/FR-aware contact waterfall (Apollo → Kaspr →
        // Lusha, geo-routed by prospect country). Degrades to Apollo-only
        // when the other keys are absent, so behaviour is unchanged until
        // KASPR_API_KEY / LUSHA_API_KEY are provisioned.
        try {
          const domain = contact.email?.split("@")[1];
          const wf = await enrichContact(
            {
              firstName: contact.firstName || undefined,
              lastName: contact.lastName || undefined,
              email: contact.email || undefined,
              linkedinUrl: contact.linkedinUrl || undefined,
              companyDomain: domain || undefined,
              knownPhoneE164: contact.phone || undefined,
            },
            { tenantId: authCtx.tenantId },
          );

          if (wf.enriched) {
            // Best reachable number first; phoneType drives the call-queue
            // accessibility weight (mobile = 1.0 in lib/voice/queue.ts).
            const phone =
              wf.data.mobilePhone ?? wf.data.directPhone ?? wf.data.phones[0]?.number ?? contact.phone;
            const phoneType = wf.data.mobilePhone
              ? "mobile"
              : wf.data.directPhone
                ? "direct"
                : (wf.data.phones[0]?.type ?? null);
            const providers = wf.attempts.filter((a) => a.ok).map((a) => a.provider);

            // Best-effort company association from Apollo's org payload.
            const apolloRaw = (wf.data.raw?.apollo ?? null) as { organization?: { name?: string } } | null;
            const orgName = apolloRaw?.organization?.name ?? null;
            let companyId = contact.companyId;
            if (!companyId && orgName) {
              const [existingCompany] = await db
                .select()
                .from(companies)
                .where(and(eq(companies.name, orgName), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
                .limit(1);
              if (existingCompany) companyId = existingCompany.id;
            }

            await db
              .update(contacts)
              .set({
                title: wf.data.title || contact.title,
                linkedinUrl: wf.data.linkedinUrl || contact.linkedinUrl,
                phone,
                email: contact.email || wf.data.email,
                companyId: companyId || contact.companyId,
                properties: {
                  ...props,
                  enrichment_source: providers.length ? providers.join("+") : "apollo",
                  email_status: wf.data.emailStatus,
                  phoneType,
                  phones: wf.data.phones,
                  seniority: wf.data.seniority,
                  organization_name: orgName,
                  enrichment_cost_cents: wf.totalCostCents,
                  enriched_at: new Date().toISOString(),
                },
                lastEnrichedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)));

            const text = contactToText({
              firstName: contact.firstName,
              lastName: contact.lastName,
              title: wf.data.title,
              email: contact.email || wf.data.email,
              phone,
              companyName: orgName,
            });
            if (text && process.env.OPENAI_API_KEY) {
              await embedEntity(authCtx.tenantId, "contact", id, text).catch(console.warn);
            }

            enriched++;
            continue;
          }
        } catch (err) {
          console.warn(`Contact enrichment waterfall failed for ${contact.email}:`, err);
          // Fall through to "unavailable" marking.
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
            lastEnrichedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)));

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
