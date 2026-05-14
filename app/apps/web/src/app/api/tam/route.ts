import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { apiError } from "@/lib/infra/api-errors";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, sql, isNull } from "drizzle-orm";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";
import {
  searchOrganizations,
  enrichOrganization,
  employeeCountToRange,
  revenueToRange,
  isApolloAvailable,
  type OrgSearchParams,
  type OrgSearchOrganization,
} from "@/lib/integrations/apollo-client";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { getTenantKnowledge, formatKnowledgeBlock } from "@/lib/knowledge/get-tenant-knowledge";
import { sizesToApolloRanges } from "@/lib/config/icp-constants";

/**
 * TAM building strategy (v2 — search-first):
 * 1. LLM analyzes user's business context and ICP to generate structured Apollo search criteria
 * 2. Apollo organization search returns real, verified companies matching those criteria
 * 3. Multiple search "angles" (direct fit, adjacent industries, emerging markets) for coverage
 *
 * The LLM is used for what it's good at: understanding business context and translating it
 * into the right Apollo filter categories. Apollo is used for what it's good at: returning
 * real companies from its database of 73M+ organizations.
 */

const searchStrategySchema = z.object({
  strategies: z.array(
    z.object({
      label: z.string().describe("Short label for this search angle, e.g. 'Direct ICP fit' or 'Adjacent SaaS tools'"),
      reasoning: z.string().describe("One sentence: why this search angle is relevant to the user's business"),
      filters: z.object({
        organization_num_employees_ranges: z
          .array(z.string())
          .describe("Apollo employee ranges, e.g. ['51,200', '201,500']. Use format 'min,max'."),
        organization_locations: z
          .array(z.string())
          .optional()
          .describe("HQ locations — cities, US states, or countries. e.g. ['United States', 'United Kingdom']"),
        q_organization_keyword_tags: z
          .array(z.string())
          .optional()
          .describe("Keywords describing company focus areas. e.g. ['saas', 'developer tools', 'cloud infrastructure']"),
        currently_using_any_of_technology_uids: z
          .array(z.string())
          .optional()
          .describe("Technologies the company uses, e.g. ['kubernetes', 'react', 'salesforce']. Only include if highly relevant."),
        revenue_range: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Revenue range in USD, e.g. { min: 1000000, max: 50000000 }"),
      }),
    })
  ).describe("Array of 2-4 search strategies"),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  const rlResponse = await checkRateLimit("enrich", authCtx.userId);
  if (rlResponse) return rlResponse;

  if (!isApolloAvailable()) {
    return apiError("PROVIDER_UNAVAILABLE", "Apollo API key not configured");
  }

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return apiError("PROVIDER_UNAVAILABLE", "No LLM API key configured");
  }

  try {
    const body = await req.json();
    const { industries, companySizes, targetRoles, geographies, productDescription } = body;

    if (!industries?.length && !companySizes?.length && !productDescription) {
      return apiError("VALIDATION_ERROR", "At least industries, company sizes, or product description required");
    }

    // Load tenant settings for context
    const settings = await getTenantSettings(authCtx.tenantId);
    const ownDomain = settings.companyDomain
      ? settings.companyDomain.toLowerCase().replace(/^www\./, "")
      : null;

    // Get existing domains to avoid duplicates
    const existing = await db
      .select({ domain: companies.domain })
      .from(companies)
      .where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
      .limit(2000);
    const existingDomains = new Set(
      existing.map((c) => c.domain?.toLowerCase()).filter(Boolean)
    );

    // Build context for the LLM
    const knowledgeEntries = await getTenantKnowledge(authCtx.tenantId);
    const knowledgeBlock = formatKnowledgeBlock(knowledgeEntries);
    const businessContext = [
      settings.onboardingCompanyName && `Company: ${settings.onboardingCompanyName}`,
      productDescription && `Product: ${productDescription}`,
      settings.salesMotion && `Sales motion: ${settings.salesMotion}`,
      settings.primaryChallenge && `Primary challenge: ${settings.primaryChallenge}`,
      industries?.length && `Target industries: ${industries.join(", ")}`,
      companySizes?.length && `Target company sizes: ${companySizes.join(", ")}`,
      geographies?.length && `Target geographies: ${geographies.join(", ")}`,
      targetRoles && `Buyer personas: ${targetRoles}`,
      knowledgeBlock && `Knowledge base:\n${knowledgeBlock}`,
    ]
      .filter(Boolean)
      .join("\n");

    // Convert UI sizes to Apollo format for the LLM to understand
    const apolloSizeExamples = companySizes?.length
      ? sizesToApolloRanges(companySizes).join(", ")
      : "";

    // Step 1: LLM generates structured Apollo search strategies
    const { object: strategyResult } = await tracedGenerateObject({
      model,
      schema: searchStrategySchema,
      prompt: `You are a sales intelligence expert. Analyze this business and generate 3-5 Apollo.io search strategies to build their Total Addressable Market (TAM).

BUSINESS CONTEXT:
${businessContext}

YOUR TASK:
Generate structured search filter sets for Apollo's organization search API. Each strategy should be a different "angle" to find potential customers:

1. **Direct fit** — Companies that exactly match the stated ICP (industries, sizes, locations)
2. **Adjacent segments** — Related industries or company types that would also benefit from this product
3. **Emerging opportunities** — Smaller/newer companies, different geographies, or companies using complementary technologies

APOLLO FILTER RULES:
- Employee ranges must be in "min,max" format: "1,10", "11,20", "21,50", "51,100", "101,200", "201,500", "501,1000", "1001,2000", "2001,5000", "5001,10000", "10001,"
${apolloSizeExamples ? `- The user selected these sizes: ${apolloSizeExamples} — use these for the direct fit strategy, expand for others` : ""}
- Locations are free text: country names, US state names, or city names
- Keywords should be specific to the business domain, not generic
- Technologies should only be included when they're a strong signal of fit (e.g. if selling a Kubernetes monitoring tool, filter for "kubernetes")
- Revenue range is in USD (integers)

Generate strategies that maximize COVERAGE while maintaining RELEVANCE. Each strategy should return meaningful, distinct results.`,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
      _trace: { agentId: "build-tam", tenantId: authCtx.tenantId, inputPreview: "Generate TAM search strategies from business context" },
    });

    // Step 2: Execute each search strategy against Apollo
    let created = 0;
    let skipped = 0;
    let searchErrors: string[] = [];
    const strategyResults: { label: string; found: number; added: number }[] = [];

    for (const strategy of strategyResult.strategies) {
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

        // Fetch up to 3 pages (300 companies) per strategy
        let strategyAdded = 0;
        let strategyFound = 0;

        for (let page = 1; page <= 3; page++) {
          params.page = page;
          const result = await searchOrganizations(params);
          strategyFound += result.organizations.length;

          if (result.organizations.length === 0) break;

          for (const org of result.organizations) {
            const domain = extractDomain(org);
            if (!domain) { skipped++; continue; }
            if (ownDomain && domain === ownDomain) { skipped++; continue; }
            if (existingDomains.has(domain)) { skipped++; continue; }

            try {
              // Always enrich for full profile — scoring needs real data
              const enriched = await enrichOrganization(domain).catch(() => null);

              const sizeLabel = enriched
                ? employeeCountToRange(enriched.estimated_num_employees)
                : inferSizeFromRanges(strategy.filters.organization_num_employees_ranges);

              await db.insert(companies).values({
                name: enriched?.name || org.name,
                domain,
                industry: enriched?.industry || null,
                size: sizeLabel,
                revenue: enriched ? revenueToRange(enriched.annual_revenue) : null,
                description: enriched?.description || null,
                tenantId: authCtx.tenantId,
                properties: {
                  source: "tam",
                  enrichment_source: enriched ? "apollo" : "apollo_search",
                  needs_enrichment: !enriched,
                  apollo_id: enriched?.id || org.id,
                  linkedin_url: enriched?.linkedin_url || org.linkedin_url,
                  logo_url: org.logo_url,
                  technologies: enriched?.technology_names || [],
                  employee_count: enriched?.estimated_num_employees || null,
                  annual_revenue: enriched?.annual_revenue || null,
                  annual_revenue_printed: enriched?.annual_revenue_printed || null,
                  total_funding: enriched?.total_funding,
                  total_funding_printed: enriched?.total_funding_printed,
                  latest_funding_stage: enriched?.latest_funding_stage,
                  founded_year: enriched?.founded_year || org.founded_year,
                  city: enriched?.city,
                  state: enriched?.state,
                  country: enriched?.country,
                  keywords: enriched?.keywords || [],
                  search_strategy: strategy.label,
                  search_reasoning: strategy.reasoning,
                  enriched_at: enriched ? new Date().toISOString() : null,
                },
              });

              existingDomains.add(domain);
              created++;
              strategyAdded++;
            } catch {
              skipped++; // duplicate or constraint violation
            }
          }

          // Don't paginate further if we got fewer than a full page
          if (result.organizations.length < 100) break;
        }

        strategyResults.push({
          label: strategy.label,
          found: strategyFound,
          added: strategyAdded,
        });
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error(`TAM search strategy "${strategy.label}" failed:`, msg);
        searchErrors.push(`${strategy.label}: ${msg.substring(0, 200)}`);
      }
    }

    return Response.json({
      success: true,
      source: "llm_criteria+apollo_search",
      companiesCreated: created,
      companiesSkipped: skipped,
      strategies: strategyResults,
      ...(searchErrors.length > 0 && { errors: searchErrors }),
    });
  } catch (error: any) {
    const msg = error?.message || "";
    // Surface Apollo plan errors clearly
    if (msg.includes("API_INACCESSIBLE") || msg.includes("free plan")) {
      return apiError("BUDGET_EXCEEDED",
        "Apollo organization search requires a paid plan. Please upgrade at https://app.apollo.io/",
      );
    }
    console.error("TAM generation failed:", error?.message, error?.stack?.slice(0, 500));
    return apiError("INTERNAL_ERROR", error?.message || "TAM generation failed");
  }
}

/** Infer a display-friendly size label from the Apollo search filter ranges. */
function inferSizeFromRanges(ranges: string[]): string | null {
  if (!ranges?.length) return null;
  // Parse all ranges and find the overall min-max
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
  // Broader range — show the span
  return `${min}-${max}`;
}

/** Extract a clean domain from an Apollo org result. */
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

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)));

  const tamResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(and(eq(companies.tenantId, authCtx.tenantId), sql`properties->>'source' = 'tam'`, isNull(companies.deletedAt)));

  const apolloResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(and(eq(companies.tenantId, authCtx.tenantId), sql`properties->>'enrichment_source' = 'apollo'`, isNull(companies.deletedAt)));

  return Response.json({
    totalCompanies: Number(result[0]?.count || 0),
    tamCompanies: Number(tamResult[0]?.count || 0),
    apolloEnriched: Number(apolloResult[0]?.count || 0),
  });
}
