import { auth } from "@/auth";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { embedEntity, companyToText } from "@/lib/embeddings";
import {
  searchOrganizations,
  enrichOrganization,
  employeeCountToRange,
  revenueToRange,
  isApolloAvailable,
} from "@/lib/apollo-client";

// Schema for ICP → Apollo filters translation
const icpFiltersSchema = z.object({
  keywords: z.array(z.string()).describe("Industry/keyword tags to search (e.g. ['SaaS', 'AI', 'fintech'])"),
  employee_ranges: z.array(z.string()).describe("Employee count ranges (e.g. ['11,50', '51,200', '201,500'])"),
  locations: z.array(z.string()).describe("Locations to target (e.g. ['United States', 'Europe'])"),
});

const llmFallbackSchema = z.object({
  companies: z.array(
    z.object({
      name: z.string(),
      domain: z.string().nullable(),
      industry: z.string(),
      size: z.string(),
      revenue: z.string(),
      description: z.string(),
      whyItFits: z.string(),
    })
  ),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { icp } = body;

    if (!icp || typeof icp !== "string" || icp.trim().length === 0) {
      return Response.json({ error: "ICP description required" }, { status: 400 });
    }

    // Get existing company names to avoid duplicates
    const existing = await db
      .select({ name: companies.name, domain: companies.domain })
      .from(companies)
      .limit(500);
    const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
    const existingDomains = new Set(existing.map((c) => c.domain?.toLowerCase()).filter(Boolean));

    let created = 0;
    let skipped = 0;

    // Try Apollo first
    if (isApolloAvailable()) {
      // Use Claude to translate ICP text into Apollo search filters
      const model = process.env.ANTHROPIC_API_KEY
        ? anthropic("claude-sonnet-4-20250514")
        : process.env.OPENAI_API_KEY
          ? openai("gpt-4o-mini")
          : null;

      let keywords: string[] = [];
      let employeeRanges: string[] = [];
      let locations: string[] = [];

      if (model) {
        try {
          const { object: filters } = await generateObject({
            model,
            schema: icpFiltersSchema,
            prompt: `Translate this Ideal Customer Profile into search filters:

"${icp.trim()}"

Provide:
- keywords: industry/technology keywords to search for (3-5 terms)
- employee_ranges: comma-separated ranges like "11,50" or "51,200"
- locations: geographic locations if mentioned

If no size is mentioned, default to ["11,50", "51,200", "201,500"].
If no location is mentioned, return an empty array.`,
          });
          keywords = filters.keywords;
          employeeRanges = filters.employee_ranges;
          locations = filters.locations;
        } catch {
          keywords = icp.split(/\s+/).slice(0, 3);
          employeeRanges = ["11,50", "51,200", "201,500"];
        }
      }

      try {
        const searchResult = await searchOrganizations({
          q_organization_keyword_tags: keywords,
          organization_num_employees_ranges: employeeRanges.length > 0 ? employeeRanges : undefined,
          organization_locations: locations.length > 0 ? locations : undefined,
          per_page: 50,
        });

        for (const org of searchResult.organizations) {
          const name = org.name;
          const domain = org.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "") || null;

          // Skip duplicates
          if (existingNames.has(name.toLowerCase()) || (domain && existingDomains.has(domain.toLowerCase()))) {
            skipped++;
            continue;
          }

          // Enrich each result for full data
          let enrichedOrg = org;
          if (domain) {
            try {
              const full = await enrichOrganization(domain);
              if (full) enrichedOrg = { ...org, ...full };
            } catch {
              // Use search result data as-is
            }
          }

          const size = employeeCountToRange(enrichedOrg.estimated_num_employees);
          const revenue = revenueToRange(enrichedOrg.annual_revenue);

          try {
            await db
              .insert(companies)
              .values({
                name,
                domain,
                industry: enrichedOrg.industry || null,
                size,
                revenue,
                description: enrichedOrg.description || null,
                tenantId: "default",
                properties: {
                  source: "tam",
                  enrichment_source: "apollo",
                  apollo_id: enrichedOrg.id,
                  linkedin_url: enrichedOrg.linkedin_url,
                  technologies: enrichedOrg.technology_names,
                  total_funding: enrichedOrg.total_funding,
                  founded_year: enrichedOrg.founded_year,
                  city: enrichedOrg.city,
                  state: enrichedOrg.state,
                  country: enrichedOrg.country,
                  keywords: enrichedOrg.keywords,
                  icpUsed: icp.trim(),
                  enriched_at: new Date().toISOString(),
                },
              });

            existingNames.add(name.toLowerCase());
            if (domain) existingDomains.add(domain.toLowerCase());
            created++;
          } catch {
            skipped++;
          }
        }

        return Response.json({
          success: true,
          source: "apollo",
          companiesCreated: created,
          companiesSkipped: skipped,
        });
      } catch (err) {
        console.warn("Apollo TAM search failed, falling back to LLM:", err);
      }
    }

    // LLM fallback — generates company names that may exist but aren't verified
    const model = process.env.ANTHROPIC_API_KEY
      ? anthropic("claude-sonnet-4-20250514")
      : process.env.OPENAI_API_KEY
        ? openai("gpt-4o-mini")
        : null;

    if (!model) {
      return Response.json({ error: "No LLM or Apollo API configured" }, { status: 500 });
    }

    const { object } = await generateObject({
      model,
      schema: llmFallbackSchema,
      prompt: `You are a B2B sales intelligence system. Generate a list of 30 REAL companies that match this Ideal Customer Profile (ICP):

"${icp.trim()}"

Requirements:
- Generate REAL companies that actually exist, not fictional ones
- Include a mix of well-known and lesser-known companies
- Each company should genuinely match the ICP criteria
- Provide accurate firmographic data based on what you know
- Do NOT include these companies: ${Array.from(existingNames).slice(0, 50).join(", ")}`,
    });

    for (const company of object.companies) {
      if (existingNames.has(company.name.toLowerCase())) {
        skipped++;
        continue;
      }
      try {
        await db.insert(companies).values({
          name: company.name,
          domain: company.domain,
          industry: company.industry,
          size: company.size,
          revenue: company.revenue,
          description: company.description,
          tenantId: "default",
          properties: {
            source: "tam",
            enrichment_source: "llm_fallback",
            whyItFits: company.whyItFits,
            icpUsed: icp.trim(),
          },
        });
        existingNames.add(company.name.toLowerCase());
        created++;
      } catch {
        skipped++;
      }
    }

    return Response.json({
      success: true,
      source: "llm_fallback",
      companiesCreated: created,
      companiesSkipped: skipped,
    });
  } catch (error) {
    console.error("TAM generation failed:", error);
    return Response.json({ error: "TAM generation failed" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies);

  const tamResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(sql`properties->>'source' = 'tam'`);

  const apolloResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(sql`properties->>'enrichment_source' = 'apollo'`);

  return Response.json({
    totalCompanies: Number(result[0]?.count || 0),
    tamCompanies: Number(tamResult[0]?.count || 0),
    apolloEnriched: Number(apolloResult[0]?.count || 0),
  });
}
