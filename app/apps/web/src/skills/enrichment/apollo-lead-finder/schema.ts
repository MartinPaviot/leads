import { z } from "zod";

export const apolloLeadFinderInputSchema = z.object({
  domains: z.array(z.string()).min(1).describe("Company domains to search for contacts"),
  personTitles: z.array(z.string()).optional().describe("Job titles to filter by"),
  personSeniorities: z.array(z.string()).optional().describe("Seniority levels: c_suite, vp, director, manager, senior"),
  maxResultsPerDomain: z.number().min(1).max(100).default(25),
  enrichEmails: z.boolean().default(false).describe("If true, enriches contacts to get verified emails (1 credit each)"),
});

export type ApolloLeadFinderInput = z.infer<typeof apolloLeadFinderInputSchema>;

const leadSchema = z.object({
  apolloId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  emailStatus: z.string().nullable(),
  title: z.string().nullable(),
  seniority: z.string().nullable(),
  departments: z.array(z.string()),
  linkedinUrl: z.string().nullable(),
  phoneNumbers: z.array(z.object({ rawNumber: z.string(), type: z.string() })),
  companyName: z.string().nullable(),
  companyDomain: z.string(),
});

export const apolloLeadFinderOutputSchema = z.object({
  totalFound: z.number(),
  leads: z.array(leadSchema),
  domainsSearched: z.number(),
  creditsUsed: z.number(),
});

export type ApolloLeadFinderOutput = z.infer<typeof apolloLeadFinderOutputSchema>;
