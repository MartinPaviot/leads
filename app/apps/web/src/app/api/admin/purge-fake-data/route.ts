import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq, sql, and, isNotNull } from "drizzle-orm";
import {
  enrichOrganization,
  employeeCountToRange,
  revenueToRange,
  isApolloAvailable,
} from "@/lib/integrations/apollo-client";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false; // Default to dry run
  const tenantId = authCtx.tenantId;

  try {
    // Step 1: Find companies that were enriched by LLM (not Apollo)
    const fakeCompanies = await db
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.tenantId, tenantId),
          sql`(properties->>'enrichment_source' IS NULL OR properties->>'enrichment_source' != 'apollo')`
        )
      );

    if (dryRun) {
      return Response.json({
        dryRun: true,
        companiesFound: fakeCompanies.length,
        withDomains: fakeCompanies.filter((c) => c.domain).length,
        withoutDomains: fakeCompanies.filter((c) => !c.domain).length,
        message: "Send { dryRun: false } to execute the purge",
      });
    }

    // Step 2: Null out LLM-invented data
    let purged = 0;
    for (const company of fakeCompanies) {
      await db
        .update(companies)
        .set({
          industry: null,
          description: null,
          size: null,
          revenue: null,
          score: null,
          scoreReasons: [],
          properties: {
            source: (company.properties as Record<string, unknown>)?.source || null,
            purged_at: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(companies.id, company.id));
      purged++;
    }

    // Step 3: Re-enrich companies that have domains via Apollo
    let reEnriched = 0;
    let failedEnrich = 0;

    if (isApolloAvailable()) {
      const companiesWithDomains = fakeCompanies.filter((c) => c.domain);

      for (const company of companiesWithDomains) {
        try {
          const org = await enrichOrganization(company.domain!);
          if (org) {
            await db
              .update(companies)
              .set({
                industry: org.industry,
                description: org.description,
                size: employeeCountToRange(org.estimated_num_employees),
                revenue: revenueToRange(org.annual_revenue),
                properties: {
                  source: (company.properties as Record<string, unknown>)?.source || null,
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
              .where(eq(companies.id, company.id));

            reEnriched++;
          } else {
            failedEnrich++;
          }
        } catch (err) {
          console.warn(`Failed to re-enrich ${company.name}:`, err);
          failedEnrich++;
        }

        // Rate limit: 45 req/min on free plan, be conservative
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    return Response.json({
      success: true,
      purged,
      reEnriched,
      failedEnrich,
      companiesWithoutDomains: fakeCompanies.filter((c) => !c.domain).length,
    });
  } catch (error) {
    console.error("Purge failed:", error);
    return Response.json({ error: "Purge failed" }, { status: 500 });
  }
}
