import { z } from "zod";

export const tamBuilderInputSchema = z.object({
  mode: z.enum(["build", "refresh", "status"]).default("build"),
  companyFilters: z.object({
    q_organization_keyword_tags: z.array(z.string()).optional(),
    organization_num_employees_ranges: z.array(z.string()).optional(),
    organization_locations: z.array(z.string()).optional(),
    organization_not_locations: z.array(z.string()).optional(),
    currently_using_any_of_technology_uids: z.array(z.string()).optional(),
    // Funding/firmographic narrowing (spec 36 — supported by apollo-client
    // OrgSearchParams; spread straight into searchOrganizations). The Elevay ICP
    // gates on raised-date (<2y) + a seed/Series-A funding-amount band.
    latest_funding_date_range: z.object({ min: z.string().optional(), max: z.string().optional() }).optional(),
    total_funding_range: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
    revenue_range: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  }),
  // Zod v4 requires `.default()` to receive a value that satisfies the
  // schema strictly, so we pass full defaults via a thunk to keep the
  // optional-with-defaults behaviour.
  scoring: z.object({
    targetIndustries: z.array(z.string()).default([]),
    targetEmployeeRanges: z.array(z.tuple([z.number(), z.number()])).default([]),
    targetFundingStages: z.array(z.string()).default([]),
    targetGeos: z.array(z.string()).default([]),
    tier1MinScore: z.number().min(0).max(100).default(75),
    tier2MinScore: z.number().min(0).max(100).default(50),
  }).default(() => ({
    targetIndustries: [],
    targetEmployeeRanges: [] as [number, number][],
    targetFundingStages: [],
    targetGeos: [],
    tier1MinScore: 75,
    tier2MinScore: 50,
  })),
  watchlist: z.object({
    enabled: z.boolean().default(true),
    personTitles: z.array(z.string()).default([]),
    personSeniorities: z.array(z.string()).default(["vp", "director", "c_suite"]),
    personasPerCompany: z.number().default(3),
    tiersToWatch: z.array(z.number()).default([1, 2]),
  }).default(() => ({
    enabled: true,
    personTitles: [],
    personSeniorities: ["vp", "director", "c_suite"],
    personasPerCompany: 3,
    tiersToWatch: [1, 2],
  })),
  maxPages: z.number().min(1).max(100).default(10),
});

export type TamBuilderInput = z.infer<typeof tamBuilderInputSchema>;

const scoredCompanySchema = z.object({
  apolloId: z.string(),
  name: z.string(),
  domain: z.string().nullable(),
  industry: z.string().nullable(),
  employeeCount: z.number().nullable(),
  annualRevenue: z.number().nullable(),
  fundingStage: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  score: z.number(),
  tier: z.number(),
});

const watchlistPersonSchema = z.object({
  apolloId: z.string(),
  name: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  title: z.string().nullable(),
  seniority: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  companyName: z.string(),
  companyDomain: z.string().nullable(),
});

export const tamBuilderOutputSchema = z.object({
  mode: z.enum(["build", "refresh", "status"]),
  totalCompaniesFound: z.number(),
  companiesByTier: z.object({
    tier1: z.number(),
    tier2: z.number(),
    tier3: z.number(),
  }),
  companies: z.array(scoredCompanySchema),
  watchlist: z.array(watchlistPersonSchema),
  pagesSearched: z.number(),
});

export type TamBuilderOutput = z.infer<typeof tamBuilderOutputSchema>;
