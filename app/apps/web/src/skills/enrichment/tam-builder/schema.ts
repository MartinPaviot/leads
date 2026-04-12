import { z } from "zod";

export const tamBuilderInputSchema = z.object({
  mode: z.enum(["build", "refresh", "status"]).default("build"),
  companyFilters: z.object({
    q_organization_keyword_tags: z.array(z.string()).optional(),
    organization_num_employees_ranges: z.array(z.string()).optional(),
    organization_locations: z.array(z.string()).optional(),
    organization_not_locations: z.array(z.string()).optional(),
    currently_using_any_of_technology_uids: z.array(z.string()).optional(),
  }),
  scoring: z.object({
    targetIndustries: z.array(z.string()).default([]),
    targetEmployeeRanges: z.array(z.tuple([z.number(), z.number()])).default([]),
    targetFundingStages: z.array(z.string()).default([]),
    targetGeos: z.array(z.string()).default([]),
    tier1MinScore: z.number().min(0).max(100).default(75),
    tier2MinScore: z.number().min(0).max(100).default(50),
  }).default({}),
  watchlist: z.object({
    enabled: z.boolean().default(true),
    personTitles: z.array(z.string()).default([]),
    personSeniorities: z.array(z.string()).default(["vp", "director", "c_suite"]),
    personasPerCompany: z.number().default(3),
    tiersToWatch: z.array(z.number()).default([1, 2]),
  }).default({}),
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
