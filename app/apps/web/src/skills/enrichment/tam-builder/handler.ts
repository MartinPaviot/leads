import {
  searchOrganizations,
  searchPeople,
  type OrgSearchOrganization,
} from "@/lib/integrations/apollo-client";
import type { SkillRunOptions } from "@/skills/types";
import type { TamBuilderInput, TamBuilderOutput } from "./schema";

function scoreCompany(
  org: OrgSearchOrganization,
  scoring: TamBuilderInput["scoring"],
): number {
  let score = 0;

  // Industry fit (25 pts)
  if (scoring.targetIndustries.length > 0 && org.industry) {
    const match = scoring.targetIndustries.some(
      (t) => org.industry!.toLowerCase().includes(t.toLowerCase()),
    );
    if (match) score += 25;
  } else if (scoring.targetIndustries.length === 0) {
    score += 12; // neutral
  }

  // Employee count fit (30 pts)
  if (scoring.targetEmployeeRanges.length > 0 && org.estimated_num_employees) {
    const count = org.estimated_num_employees;
    const match = scoring.targetEmployeeRanges.some(
      ([min, max]) => count >= min && count <= max,
    );
    if (match) score += 30;
    else if (scoring.targetEmployeeRanges.some(([min, max]) => count >= min * 0.5 && count <= max * 1.5)) {
      score += 15; // adjacent range
    }
  } else if (scoring.targetEmployeeRanges.length === 0) {
    score += 15;
  }

  // Funding stage fit (20 pts)
  if (scoring.targetFundingStages.length > 0 && org.latest_funding_stage) {
    const match = scoring.targetFundingStages.some(
      (s) => org.latest_funding_stage!.toLowerCase().includes(s.toLowerCase()),
    );
    if (match) score += 20;
  } else if (scoring.targetFundingStages.length === 0) {
    score += 10;
  }

  // Geo fit (15 pts)
  if (scoring.targetGeos.length > 0) {
    const loc = [org.city, org.state, org.country].filter(Boolean).join(" ").toLowerCase();
    const match = scoring.targetGeos.some((g) => loc.includes(g.toLowerCase()));
    if (match) score += 15;
  } else {
    score += 7;
  }

  // Keyword presence (10 pts)
  if (org.keywords && org.keywords.length > 0) {
    score += Math.min(10, org.keywords.length * 2);
  }

  return Math.min(100, score);
}

function assignTier(score: number, tier1Min: number, tier2Min: number): number {
  if (score >= tier1Min) return 1;
  if (score >= tier2Min) return 2;
  return 3;
}

export async function tamBuilderHandler(
  input: TamBuilderInput,
  _options: SkillRunOptions,
): Promise<TamBuilderOutput> {
  const allCompanies: Array<{
    apolloId: string;
    name: string;
    domain: string | null;
    industry: string | null;
    employeeCount: number | null;
    annualRevenue: number | null;
    fundingStage: string | null;
    city: string | null;
    country: string | null;
    score: number;
    tier: number;
  }> = [];

  // Search Apollo page by page
  let pagesSearched = 0;
  for (let page = 1; page <= input.maxPages; page++) {
    const result = await searchOrganizations({
      ...input.companyFilters,
      page,
      per_page: 100,
    });

    pagesSearched = page;

    for (const org of result.organizations) {
      const score = scoreCompany(org, input.scoring);
      const tier = assignTier(score, input.scoring.tier1MinScore, input.scoring.tier2MinScore);
      allCompanies.push({
        apolloId: org.id,
        name: org.name,
        domain: org.primary_domain,
        industry: org.industry,
        employeeCount: org.estimated_num_employees,
        annualRevenue: org.annual_revenue,
        fundingStage: org.latest_funding_stage,
        city: org.city,
        country: org.country,
        score,
        tier,
      });
    }

    // Stop if last page
    if (result.organizations.length < 100) break;
  }

  // Sort by score descending
  allCompanies.sort((a, b) => b.score - a.score);

  // Build watchlist for Tier 1-2 companies
  const watchlist: TamBuilderOutput["watchlist"] = [];
  if (input.watchlist.enabled) {
    const watchCompanies = allCompanies.filter(
      (c) => input.watchlist.tiersToWatch.includes(c.tier) && c.domain,
    );

    for (const company of watchCompanies.slice(0, 50)) {
      const peopleResult = await searchPeople({
        q_organization_domains: company.domain!,
        person_titles: input.watchlist.personTitles.length > 0
          ? input.watchlist.personTitles
          : undefined,
        person_seniorities: input.watchlist.personSeniorities,
        per_page: input.watchlist.personasPerCompany,
      });

      for (const person of peopleResult.people) {
        watchlist.push({
          apolloId: person.id,
          name: person.name,
          firstName: person.first_name,
          lastName: person.last_name,
          email: person.email,
          title: person.title,
          seniority: person.seniority,
          linkedinUrl: person.linkedin_url,
          companyName: company.name,
          companyDomain: company.domain,
        });
      }
    }
  }

  const tier1 = allCompanies.filter((c) => c.tier === 1).length;
  const tier2 = allCompanies.filter((c) => c.tier === 2).length;
  const tier3 = allCompanies.filter((c) => c.tier === 3).length;

  return {
    mode: input.mode,
    totalCompaniesFound: allCompanies.length,
    companiesByTier: { tier1, tier2, tier3 },
    companies: allCompanies,
    watchlist,
    pagesSearched,
  };
}
