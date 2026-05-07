import { inngest } from "./client";
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  searchPeople,
  isApolloAvailable,
} from "@/lib/integrations/apollo-client";
import { getTenantSettings, deriveTargetRoles } from "@/lib/config/tenant-settings";
import { embedEntity, companyToText } from "@/lib/ai/embeddings";

/**
 * Triggered when onboarding is completed.
 * TAM companies are already created by /api/tam (called synchronously by the wizard).
 * This function handles the follow-up: find contacts at top companies + embed for RAG.
 */
export const onOnboardingCompleted = inngest.createFunction(
  {
    id: "onboarding-completed",
    name: "Post-Onboarding: Contacts + Embeddings",
    retries: 2,
    onFailure: async ({ error, event }) => {
      console.error(
        `[DEAD LETTER] onboarding-completed failed for tenant ${(event as any).data?.tenantId}:`,
        error.message
      );
    },
    triggers: [{ event: "onboarding/completed" }],
  },
  async ({
    event,
    step,
  }: {
    event: {
      data: { tenantId: string; appUserId: string };
    };
    step: any;
  }) => {
    const { tenantId } = event.data;

    // Step 1: Load settings for target roles
    const settings = await step.run("load-settings", async () => {
      return getTenantSettings(tenantId);
    });

    // BUG-WS0-008: derive targetRoles at read time
    const targetRoles = deriveTargetRoles(settings);

    if (!isApolloAvailable()) {
      return { tenantId, result: "skipped", reason: "No Apollo API key" };
    }

    // Step 2: Get TAM companies that were just created by /api/tam
    const tamCompanyIds = await step.run("get-tam-companies", async () => {
      const tamCompanies = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.tenantId, tenantId));
      return tamCompanies.map((c) => c.id);
    });

    if (tamCompanyIds.length === 0) {
      return { tenantId, result: "skipped", reason: "No TAM companies found" };
    }

    // Step 3: Find key contacts at top 20 companies
    let contactsCreated = 0;
    if (targetRoles) {
      contactsCreated = await step.run("find-contacts", async () => {
        let count = 0;
        // Use top 20 companies (already enriched and scored by /api/tam)
        const topCompanies = await db
          .select()
          .from(companies)
          .where(eq(companies.tenantId, tenantId))
          .orderBy(sql`score DESC NULLS LAST`)
          .limit(20);

        for (const company of topCompanies) {
          if (!company.domain) continue;

          try {
            const roleTitles = targetRoles
              .split(/[,;]/)
              .map((r: string) => r.trim())
              .filter(Boolean);

            const searchResult = await searchPeople({
              q_organization_domains: company.domain,
              person_titles: roleTitles,
              per_page: 3,
            });

            for (const person of searchResult.people) {
              if (!person.email) continue;

              const [existing] = await db
                .select({ id: contacts.id })
                .from(contacts)
                .where(eq(contacts.email, person.email))
                .limit(1);
              if (existing) continue;

              await db.insert(contacts).values({
                tenantId,
                companyId: company.id,
                firstName: person.first_name || null,
                lastName: person.last_name || null,
                email: person.email,
                title: person.title || null,
                phone: person.phone_numbers?.[0]?.raw_number || null,
                properties: {
                  enrichment_source: "apollo",
                  seniority: person.seniority,
                  departments: person.departments,
                  linkedin_url: person.linkedin_url,
                  city: person.city,
                  country: person.country,
                  auto_onboarding: true,
                },
              });
              count++;
            }
          } catch {
            // Skip this company's contacts on error
          }
        }
        return count;
      });
    }

    // Step 4: Embed companies for RAG
    if (process.env.OPENAI_API_KEY) {
      await step.run("embed-companies", async () => {
        const companiesToEmbed = await db
          .select()
          .from(companies)
          .where(eq(companies.tenantId, tenantId))
          .limit(50);

        for (const company of companiesToEmbed) {
          try {
            const text = companyToText({
              name: company.name,
              domain: company.domain,
              industry: company.industry,
              revenue: company.revenue,
              size: company.size,
              description: company.description,
            });
            if (text) {
              await embedEntity(tenantId, "company", company.id, text);
            }
          } catch {
            // Non-critical
          }
        }
      });
    }

    return {
      tenantId,
      result: "success",
      contactsCreated,
    };
  }
);
