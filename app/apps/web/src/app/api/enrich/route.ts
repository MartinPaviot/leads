import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { z } from "zod";
import { embedEntity, companyToText } from "@/lib/embeddings";
import {
  enrichOrganization,
  employeeCountToRange,
  revenueToRange,
  isApolloAvailable,
} from "@/lib/apollo-client";

const llmFallbackSchema = z.object({
  industry: z.string().describe("Primary industry (e.g. Fintech, SaaS, AI/ML, Healthcare)"),
  description: z.string().describe("1-2 sentence company description"),
  size: z.string().describe("Employee count range (e.g. 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+)"),
  revenue: z.string().describe("Estimated annual revenue range (e.g. <$1M, $1M-$10M, $10M-$50M, $50M-$100M, $100M+)"),
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
    const { companyIds } = body;

    if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
      return Response.json({ error: "companyIds array required" }, { status: 400 });
    }

    let enriched = 0;
    let failed = 0;

    for (const id of companyIds.slice(0, 20)) {
      try {
        const [company] = await db
          .select()
          .from(companies)
          .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId)))
          .limit(1);

        if (!company) {
          failed++;
          continue;
        }

        // Skip if already enriched from Apollo
        const props = (company.properties || {}) as Record<string, unknown>;
        if (props.enrichment_source === "apollo" && company.industry && company.description) {
          enriched++;
          continue;
        }

        // Try Apollo first
        if (isApolloAvailable() && company.domain) {
          try {
            const org = await enrichOrganization(company.domain);

            if (org) {
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
                .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId)));

              // Re-embed with enriched data
              const text = companyToText({
                name: company.name,
                domain: company.domain,
                industry: org.industry,
                revenue: revenueToRange(org.annual_revenue),
                size: employeeCountToRange(org.estimated_num_employees),
                description: org.description,
              });
              if (text && process.env.OPENAI_API_KEY) {
                await embedEntity(authCtx.tenantId, "company", id, text).catch(console.warn);
              }

              enriched++;
              continue;
            }
          } catch (err) {
            console.warn(`Apollo enrichment failed for ${company.domain}:`, err);
            // Fall through to LLM fallback
          }
        }

        // No LLM fallback — mark as unavailable instead of hallucinating
        await db
          .update(companies)
          .set({
            properties: {
              ...props,
              enrichment_source: "unavailable",
              enrichment_attempted_at: new Date().toISOString(),
              enrichment_error: !isApolloAvailable()
                ? "Apollo API key not configured"
                : !company.domain
                  ? "No domain available"
                  : "Apollo returned no data",
            },
            updatedAt: new Date(),
          })
          .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId)));

        failed++;
      } catch (err) {
        console.warn(`Failed to enrich company ${id}:`, err);
        failed++;
      }
    }

    return Response.json({ success: true, enriched, failed });
  } catch (error) {
    console.error("Enrichment failed:", error);
    return Response.json({ error: "Enrichment failed" }, { status: 500 });
  }
}
