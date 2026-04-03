import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import {
  enrichOrganization,
  employeeCountToRange,
  revenueToRange,
  isApolloAvailable,
} from "@/lib/apollo-client";
import { getTenantSettings, parseSizeRange } from "@/lib/tenant-settings";

/**
 * TAM building strategy:
 * 1. LLM generates candidate companies (name + domain) based on structured ICP filters
 * 2. Apollo org enrich validates each candidate with real data (works on free plan)
 * 3. Post-enrich filter: discard companies that don't actually match the ICP
 *
 * This approach works on Apollo's free plan (enrich is available, search is not).
 * The LLM proposes, Apollo verifies — no hallucinated company data in the DB.
 */

const candidateSchema = z.object({
  companies: z.array(
    z.object({
      name: z.string().describe("Exact company name"),
      domain: z.string().describe("Company website domain (e.g. 'stripe.com'). Must be a real, active domain."),
      reason: z.string().describe("One sentence: why this company matches the ICP"),
    })
  ),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = checkRateLimit("enrich", authCtx.userId);
  if (rlResponse) return rlResponse;

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ error: "No LLM API key configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { industries, companySizes, targetRoles, geographies, productDescription } = body;

    if (!industries?.length && !companySizes?.length) {
      return Response.json({ error: "At least industries or company sizes required" }, { status: 400 });
    }

    // Load tenant settings
    const settings = await getTenantSettings(authCtx.tenantId);
    const ownDomain = settings.companyDomain
      ? settings.companyDomain.toLowerCase().replace(/^www\./, "")
      : null;

    // Get existing companies to avoid duplicates
    const existing = await db
      .select({ name: companies.name, domain: companies.domain })
      .from(companies)
      .where(eq(companies.tenantId, authCtx.tenantId))
      .limit(500);
    const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
    const existingDomains = new Set(existing.map((c) => c.domain?.toLowerCase()).filter(Boolean));

    // Step 1: LLM generates candidate companies from structured ICP
    const icpDescription = [
      industries?.length && `Industries: ${industries.join(", ")}`,
      companySizes?.length && `Company sizes (employee count): ${companySizes.join(", ")}`,
      geographies?.length && `Geographies: ${geographies.join(", ")}`,
      targetRoles && `Buyer roles: ${targetRoles}`,
      productDescription && `What we sell: ${productDescription}`,
    ].filter(Boolean).join("\n");

    const excludeList = existing.length > 0
      ? `\n\nDo NOT include these companies (already in our CRM): ${existing.slice(0, 50).map((c) => c.name).join(", ")}`
      : "";

    const { object } = await generateObject({
      model,
      schema: candidateSchema,
      prompt: `Generate a list of 30 real companies that match this Ideal Customer Profile.

${icpDescription}
${excludeList}

CRITICAL RULES:
- Only return REAL companies that actually exist. No made-up names.
- The domain must be real and active (e.g. "stripe.com", not "stripe.io" if that's not their domain).
- Focus on companies that would genuinely be a good fit as customers based on the ICP.
- Prioritize companies that are well-known in their industry but not necessarily household names.
- Include a mix: some obvious fits and some less obvious but high-potential matches.
- Do NOT include the seller's own company.`,
    });
    const candidates = object as any;

    // Step 2: Enrich each candidate with Apollo (validates they're real + adds data)
    let created = 0;
    let skipped = 0;
    let enrichFailed = 0;
    const sizeRange = parseSizeRange(settings);

    for (const candidate of candidates.companies) {
      const domain = candidate.domain.toLowerCase().replace(/^www\./, "").replace(/\/$/, "");

      // Skip own company
      if (ownDomain && domain === ownDomain) { skipped++; continue; }
      // Skip duplicates
      if (existingNames.has(candidate.name.toLowerCase()) || existingDomains.has(domain)) { skipped++; continue; }

      if (isApolloAvailable()) {
        try {
          const org = await enrichOrganization(domain);
          if (!org) { enrichFailed++; continue; }

          // Post-enrich ICP filter: verify the enriched data actually matches
          const employeeCount = org.estimated_num_employees;
          if (sizeRange && employeeCount) {
            const [min, max] = sizeRange;
            // Allow 2x tolerance
            if (employeeCount < min * 0.5 || employeeCount > max * 2) {
              skipped++;
              continue;
            }
          }

          const size = employeeCountToRange(employeeCount);
          const revenue = revenueToRange(org.annual_revenue);

          await db.insert(companies).values({
            name: org.name || candidate.name,
            domain,
            industry: org.industry || null,
            size,
            revenue,
            description: org.description || null,
            tenantId: authCtx.tenantId,
            properties: {
              source: "tam",
              enrichment_source: "apollo",
              apollo_id: org.id,
              linkedin_url: org.linkedin_url,
              technologies: org.technology_names,
              total_funding: org.total_funding,
              founded_year: org.founded_year,
              city: org.city,
              state: org.state,
              country: org.country,
              keywords: org.keywords,
              llm_reason: candidate.reason,
              icpFilters: { industries, companySizes, geographies, targetRoles },
              enriched_at: new Date().toISOString(),
            },
          });

          existingNames.add((org.name || candidate.name).toLowerCase());
          existingDomains.add(domain);
          created++;
        } catch {
          enrichFailed++;
        }
      } else {
        // No Apollo — store LLM candidate without enrichment (marked as unverified)
        try {
          await db.insert(companies).values({
            name: candidate.name,
            domain,
            industry: industries?.[0] || null,
            description: candidate.reason,
            tenantId: authCtx.tenantId,
            properties: {
              source: "tam",
              enrichment_source: "llm_only",
              llm_reason: candidate.reason,
              icpFilters: { industries, companySizes, geographies, targetRoles },
              needs_enrichment: true,
            },
          });
          existingNames.add(candidate.name.toLowerCase());
          existingDomains.add(domain);
          created++;
        } catch {
          skipped++;
        }
      }
    }

    return Response.json({
      success: true,
      source: isApolloAvailable() ? "llm+apollo" : "llm_only",
      companiesCreated: created,
      companiesSkipped: skipped,
      enrichFailed,
      candidatesGenerated: candidates.companies.length,
    });
  } catch (error) {
    console.error("TAM generation failed:", error);
    return Response.json({ error: "TAM generation failed" }, { status: 500 });
  }
}

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(eq(companies.tenantId, authCtx.tenantId));

  const tamResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(and(eq(companies.tenantId, authCtx.tenantId), sql`properties->>'source' = 'tam'`));

  const apolloResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(and(eq(companies.tenantId, authCtx.tenantId), sql`properties->>'enrichment_source' = 'apollo'`));

  return Response.json({
    totalCompanies: Number(result[0]?.count || 0),
    tamCompanies: Number(tamResult[0]?.count || 0),
    apolloEnriched: Number(apolloResult[0]?.count || 0),
  });
}
