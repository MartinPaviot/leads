import { z } from "zod";

export const companyContactFinderInputSchema = z.object({
  companyDomain: z.string().describe("Company domain to search for decision-makers"),
  targetTitles: z.array(z.string()).optional().describe("Specific job titles to look for"),
  // No zod default: Apollo ANDs titles with seniorities, so a blanket
  // c_suite/vp/director default silently EXCLUDED titled targets
  // (IT Manager → "manager", Owner → "owner"). The handler applies the
  // decision-maker default only when no titles are given.
  targetSeniorities: z.array(z.string()).optional(),
  minResults: z.number().min(1).max(25).default(3),
  maxResults: z.number().min(1).max(50).default(10),
});

export type CompanyContactFinderInput = z.infer<typeof companyContactFinderInputSchema>;

const contactSchema = z.object({
  apolloId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  title: z.string().nullable(),
  seniority: z.string().nullable(),
  departments: z.array(z.string()),
  linkedinUrl: z.string().nullable(),
});

export const companyContactFinderOutputSchema = z.object({
  companyDomain: z.string(),
  totalFound: z.number(),
  contacts: z.array(contactSchema),
});

export type CompanyContactFinderOutput = z.infer<typeof companyContactFinderOutputSchema>;
