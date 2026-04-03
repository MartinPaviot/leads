import { inngest } from "./client";
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  enrichOrganization,
  enrichPerson,
  searchPeople,
  employeeCountToRange,
  revenueToRange,
  isApolloAvailable,
} from "@/lib/apollo-client";
import { getTenantSettings, parseSizeRange } from "@/lib/tenant-settings";
import { embedEntity, companyToText, contactToText } from "@/lib/embeddings";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

const candidateSchema = z.object({
  companies: z.array(
    z.object({
      name: z.string().describe("Exact company name"),
      domain: z.string().describe("Company website domain (e.g. 'stripe.com')"),
      reason: z.string().describe("Why this company matches the ICP"),
    })
  ),
});

/**
 * Triggered when onboarding is completed.
 * Auto-builds TAM from ICP settings, enriches companies, and finds key contacts.
 */
export const onOnboardingCompleted = inngest.createFunction(
  {
    id: "onboarding-completed",
    name: "Auto-Build TAM After Onboarding",
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
    const { tenantId, appUserId } = event.data;

    // Step 1: Load tenant settings to get ICP
    const settings = await step.run("load-settings", async () => {
      return getTenantSettings(tenantId);
    });

    const industries = settings.targetIndustries || [];
    const companySizes = settings.targetCompanySizes || [];
    const geographies = settings.targetGeographies || [];
    const targetRoles = settings.targetRoles || "";
    const productDescription = settings.productDescription || "";

    if (!industries.length && !companySizes.length) {
      return { tenantId, result: "skipped", reason: "No ICP defined" };
    }

    // Step 2: Generate candidate companies with LLM
    const model = getLLMModel();
    if (!model) {
      return { tenantId, result: "skipped", reason: "No LLM API key" };
    }

    const candidates = await step.run("generate-candidates", async () => {
      const ownDomain = settings.companyDomain
        ? settings.companyDomain.toLowerCase().replace(/^www\./, "")
        : null;

      const existing = await db
        .select({ name: companies.name, domain: companies.domain })
        .from(companies)
        .where(eq(companies.tenantId, tenantId))
        .limit(500);
      const existingNames = new Set(
        existing.map((c) => c.name.toLowerCase())
      );
      const existingDomains = new Set(
        existing.map((c) => c.domain?.toLowerCase()).filter(Boolean)
      );

      const icpDescription = [
        industries.length && `Industries: ${industries.join(", ")}`,
        companySizes.length &&
          `Company sizes (employee count): ${companySizes.join(", ")}`,
        geographies.length && `Geographies: ${geographies.join(", ")}`,
        targetRoles && `Buyer roles: ${targetRoles}`,
        productDescription && `What we sell: ${productDescription}`,
      ]
        .filter(Boolean)
        .join("\n");

      const excludeList =
        existing.length > 0
          ? `\n\nDo NOT include these (already in CRM): ${existing
              .slice(0, 50)
              .map((c) => c.name)
              .join(", ")}`
          : "";

      const { object } = await generateObject({
        model: model!,
        schema: candidateSchema,
        prompt: `Generate a list of 30 real companies that match this Ideal Customer Profile.

${icpDescription}
${excludeList}

CRITICAL RULES:
- Only return REAL companies that actually exist. No made-up names.
- The domain must be real and active.
- Focus on companies that would genuinely be a good fit as customers.
- Include a mix: some obvious fits and some less obvious but high-potential matches.`,
      });

      // Filter out duplicates and own company
      return object.companies.filter((c) => {
        const domain = c.domain
          .toLowerCase()
          .replace(/^www\./, "")
          .replace(/\/$/, "");
        if (ownDomain && domain === ownDomain) return false;
        if (existingNames.has(c.name.toLowerCase())) return false;
        if (existingDomains.has(domain)) return false;
        return true;
      });
    });

    // Step 3: Enrich and insert companies
    const results = await step.run("enrich-and-insert", async () => {
      let created = 0;
      let enrichFailed = 0;
      const sizeRange = parseSizeRange(settings);
      const createdCompanyIds: string[] = [];

      for (const candidate of candidates) {
        const domain = candidate.domain
          .toLowerCase()
          .replace(/^www\./, "")
          .replace(/\/$/, "");

        if (isApolloAvailable()) {
          try {
            const org = await enrichOrganization(domain);
            if (!org) {
              enrichFailed++;
              continue;
            }

            // Post-enrich ICP filter
            const employeeCount = org.estimated_num_employees;
            if (sizeRange && employeeCount) {
              const [min, max] = sizeRange;
              if (employeeCount < min * 0.5 || employeeCount > max * 2) {
                continue;
              }
            }

            const [inserted] = await db
              .insert(companies)
              .values({
                name: org.name || candidate.name,
                domain,
                industry: org.industry || null,
                size: employeeCountToRange(employeeCount),
                revenue: revenueToRange(org.annual_revenue),
                description: org.description || null,
                tenantId,
                properties: {
                  source: "tam",
                  enrichment_source: "apollo",
                  apollo_id: org.id,
                  linkedin_url: org.linkedin_url,
                  technologies: org.technology_names,
                  total_funding: org.total_funding,
                  total_funding_printed: org.total_funding_printed,
                  founded_year: org.founded_year,
                  city: org.city,
                  state: org.state,
                  country: org.country,
                  keywords: org.keywords,
                  llm_reason: candidate.reason,
                  enriched_at: new Date().toISOString(),
                  auto_onboarding: true,
                },
              })
              .returning({ id: companies.id });

            createdCompanyIds.push(inserted.id);
            created++;
          } catch {
            enrichFailed++;
          }
        } else {
          // No Apollo — store LLM candidate as unverified
          try {
            const [inserted] = await db
              .insert(companies)
              .values({
                name: candidate.name,
                domain,
                industry: industries[0] || null,
                description: candidate.reason,
                tenantId,
                properties: {
                  source: "tam",
                  enrichment_source: "llm_only",
                  llm_reason: candidate.reason,
                  needs_enrichment: true,
                  auto_onboarding: true,
                },
              })
              .returning({ id: companies.id });

            createdCompanyIds.push(inserted.id);
            created++;
          } catch {
            // duplicate or constraint violation
          }
        }
      }

      return { created, enrichFailed, companyIds: createdCompanyIds };
    });

    // Step 4: Find key contacts at top companies (if Apollo available)
    let contactsCreated = 0;
    if (isApolloAvailable() && targetRoles && results.companyIds.length > 0) {
      contactsCreated = await step.run("find-contacts", async () => {
        let count = 0;
        // Get top 10 companies for contact search
        const topCompanyIds = results.companyIds.slice(0, 10);

        for (const companyId of topCompanyIds) {
          try {
            const [company] = await db
              .select()
              .from(companies)
              .where(eq(companies.id, companyId))
              .limit(1);
            if (!company?.domain) continue;

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

              // Check for duplicate
              const [existing] = await db
                .select({ id: contacts.id })
                .from(contacts)
                .where(
                  eq(contacts.email, person.email)
                )
                .limit(1);
              if (existing) continue;

              await db.insert(contacts).values({
                tenantId,
                companyId,
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

    // Step 5: Embed new companies for RAG (if OPENAI_API_KEY available)
    if (process.env.OPENAI_API_KEY && results.companyIds.length > 0) {
      await step.run("embed-companies", async () => {
        for (const companyId of results.companyIds.slice(0, 20)) {
          try {
            const [company] = await db
              .select()
              .from(companies)
              .where(eq(companies.id, companyId))
              .limit(1);
            if (!company) continue;

            const text = companyToText({
              name: company.name,
              domain: company.domain,
              industry: company.industry,
              revenue: company.revenue,
              size: company.size,
              description: company.description,
            });
            if (text) {
              await embedEntity(tenantId, "company", companyId, text);
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
      companiesCreated: results.created,
      enrichFailed: results.enrichFailed,
      contactsCreated,
    };
  }
);
