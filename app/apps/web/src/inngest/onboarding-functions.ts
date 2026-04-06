import { inngest } from "./client";
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  searchOrganizations,
  searchPeople,
  isApolloAvailable,
  type OrgSearchParams,
  type OrgSearchOrganization,
} from "@/lib/apollo-client";
import { getTenantSettings } from "@/lib/tenant-settings";
import { sizesToApolloRanges } from "@/lib/icp-constants";
import { embedEntity, companyToText } from "@/lib/embeddings";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

const searchStrategySchema = z.object({
  strategies: z.array(
    z.object({
      label: z.string().describe("Short label for this search angle"),
      reasoning: z.string().describe("Why this angle matters for the user's business"),
      filters: z.object({
        organization_num_employees_ranges: z
          .array(z.string())
          .describe("Apollo employee ranges in 'min,max' format"),
        organization_locations: z
          .array(z.string())
          .optional()
          .describe("HQ locations — cities, US states, or countries"),
        q_organization_keyword_tags: z
          .array(z.string())
          .optional()
          .describe("Keywords describing company focus areas"),
        currently_using_any_of_technology_uids: z
          .array(z.string())
          .optional()
          .describe("Technologies the target companies use"),
        revenue_range: z
          .object({ min: z.number().optional(), max: z.number().optional() })
          .optional()
          .describe("Revenue range in USD"),
      }),
    })
  ).describe("Array of 2-3 search strategies"),
});

function inferSizeFromRanges(ranges: string[]): string | null {
  if (!ranges?.length) return null;
  const nums = ranges.flatMap((r) => r.split(",").map(Number).filter((n) => !isNaN(n) && n > 0));
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max <= 10) return "1-10";
  if (max <= 20) return "11-20";
  if (max <= 50) return "21-50";
  if (max <= 100) return "51-100";
  if (max <= 200) return "101-200";
  if (max <= 500) return "201-500";
  return `${min}-${max}`;
}

function extractDomain(org: OrgSearchOrganization): string | null {
  const raw = org.primary_domain || org.website_url;
  if (!raw) return null;
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim() || null;
}

/**
 * Triggered when onboarding is completed.
 * Auto-builds TAM using LLM-generated Apollo search criteria, then finds key contacts.
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
    const { tenantId } = event.data;

    // Step 1: Load tenant settings to get ICP + business context
    const settings = await step.run("load-settings", async () => {
      return getTenantSettings(tenantId);
    });

    const industries = settings.targetIndustries || [];
    const companySizes = settings.targetCompanySizes || [];
    const geographies = settings.targetGeographies || [];
    const targetRoles = settings.targetRoles || "";
    const productDescription = settings.productDescription || "";

    if (!industries.length && !companySizes.length && !productDescription) {
      return { tenantId, result: "skipped", reason: "No ICP or product description defined" };
    }

    const model = getLLMModel();
    if (!model) {
      return { tenantId, result: "skipped", reason: "No LLM API key" };
    }

    if (!isApolloAvailable()) {
      return { tenantId, result: "skipped", reason: "No Apollo API key" };
    }

    // Step 2: LLM generates structured Apollo search criteria
    const strategies = await step.run("generate-search-strategies", async () => {
      const ownDomain = settings.companyDomain
        ? settings.companyDomain.toLowerCase().replace(/^www\./, "")
        : null;

      const businessContext = [
        settings.onboardingCompanyName && `Company: ${settings.onboardingCompanyName}`,
        productDescription && `Product: ${productDescription}`,
        settings.salesMotion && `Sales motion: ${settings.salesMotion}`,
        settings.primaryChallenge && `Primary challenge: ${settings.primaryChallenge}`,
        industries.length && `Target industries: ${industries.join(", ")}`,
        companySizes.length && `Target company sizes: ${companySizes.join(", ")}`,
        geographies.length && `Target geographies: ${geographies.join(", ")}`,
        targetRoles && `Buyer personas: ${targetRoles}`,
        settings.knowledge?.length &&
          `Knowledge base:\n${settings.knowledge.map((k: any) => `- ${k.topic}: ${k.content}`).join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n");

      const apolloSizeExamples = companySizes.length
        ? sizesToApolloRanges(companySizes).join(", ")
        : "";

      const { object } = await generateObject({
        model: model!,
        schema: searchStrategySchema,
        prompt: `You are a sales intelligence expert. Analyze this business and generate 2-3 Apollo.io search strategies to build their initial TAM (Total Addressable Market).

BUSINESS CONTEXT:
${businessContext}

Generate structured search filter sets for Apollo's organization search API:
1. **Direct fit** — Exact ICP match
2. **Adjacent segment** — Related industries/company types that would also buy this product

APOLLO FILTER RULES:
- Employee ranges: "1,10", "11,20", "21,50", "51,100", "101,200", "201,500", "501,1000", "1001,2000", "2001,5000", "5001,10000", "10001,"
${apolloSizeExamples ? `- User selected sizes: ${apolloSizeExamples}` : ""}
- Locations: country names, US states, or cities
- Keywords: specific to the business domain
- Technologies: only when they're a strong signal of fit
- Revenue: integers in USD`,
      });

      return { strategies: (object as any).strategies, ownDomain };
    });

    // Step 3: Execute searches and insert companies
    const results = await step.run("search-and-insert", async () => {
      let created = 0;
      let searchFailed = 0;
      const createdCompanyIds: string[] = [];

      const existing = await db
        .select({ domain: companies.domain })
        .from(companies)
        .where(eq(companies.tenantId, tenantId))
        .limit(2000);
      const existingDomains = new Set(
        existing.map((c) => c.domain?.toLowerCase()).filter(Boolean)
      );

      for (const strategy of strategies.strategies) {
        try {
          const params: OrgSearchParams = {
            organization_num_employees_ranges:
              strategy.filters.organization_num_employees_ranges,
            organization_locations: strategy.filters.organization_locations,
            q_organization_keyword_tags:
              strategy.filters.q_organization_keyword_tags,
            currently_using_any_of_technology_uids:
              strategy.filters.currently_using_any_of_technology_uids,
            revenue_range: strategy.filters.revenue_range,
            per_page: 100,
            page: 1,
          };

          // Fetch up to 2 pages (200 companies) per strategy for onboarding
          for (let page = 1; page <= 2; page++) {
            params.page = page;
            const result = await searchOrganizations(params);
            if (result.organizations.length === 0) break;

            for (const org of result.organizations) {
              const domain = extractDomain(org);
              if (!domain) continue;
              if (strategies.ownDomain && domain === strategies.ownDomain) continue;
              if (existingDomains.has(domain)) continue;

              try {
                // Search-only: no enrich to save credits. Mark for lazy enrichment.
                const sizeLabel = inferSizeFromRanges(
                  strategy.filters.organization_num_employees_ranges
                );

                const [inserted] = await db
                  .insert(companies)
                  .values({
                    name: org.name,
                    domain,
                    industry: null,
                    size: sizeLabel,
                    revenue: null,
                    description: null,
                    tenantId,
                    properties: {
                      source: "tam",
                      enrichment_source: "apollo_search",
                      needs_enrichment: true,
                      apollo_id: org.id,
                      linkedin_url: org.linkedin_url,
                      logo_url: org.logo_url,
                      founded_year: org.founded_year,
                      search_strategy: strategy.label,
                      search_reasoning: strategy.reasoning,
                      auto_onboarding: true,
                    },
                  })
                  .returning({ id: companies.id });

                createdCompanyIds.push(inserted.id);
                existingDomains.add(domain);
                created++;
              } catch {
                // duplicate or constraint violation
              }
            }

            if (result.organizations.length < 100) break;
          }
        } catch (err: any) {
          console.error(`TAM search strategy "${strategy.label}" failed:`, err?.message);
          searchFailed++;
        }
      }

      return { created, searchFailed, companyIds: createdCompanyIds };
    });

    // Step 4: Find key contacts at top companies
    let contactsCreated = 0;
    if (isApolloAvailable() && targetRoles && results.companyIds.length > 0) {
      contactsCreated = await step.run("find-contacts", async () => {
        let count = 0;
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

              const [existing] = await db
                .select({ id: contacts.id })
                .from(contacts)
                .where(eq(contacts.email, person.email))
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

    // Step 5: Embed new companies for RAG
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
      searchFailed: results.searchFailed,
      contactsCreated,
    };
  }
);
