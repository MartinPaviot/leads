import { z } from "zod";

export const leadershipChangeOutreachInputSchema = z.object({
  companyIds: z.array(z.string()).min(1).max(100)
    .describe("Elevay company IDs to scan for leadership changes"),
  targetSeniorities: z.array(z.string()).default(["c_suite", "vp", "founder"])
    .describe("Seniority levels to monitor"),
  generateOutreach: z.boolean().default(true)
    .describe("Generate personalized outreach email for detected changes"),
});

export type LeadershipChangeOutreachInput = z.infer<typeof leadershipChangeOutreachInputSchema>;

const leadershipChangeSchema = z.object({
  companyId: z.string(),
  companyName: z.string(),
  companyDomain: z.string().nullable(),
  newLeader: z.object({
    name: z.string().nullable(),
    title: z.string().nullable(),
    email: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    seniority: z.string().nullable(),
  }),
  isNewHire: z.boolean(),
  signalStrength: z.enum(["high", "medium", "low"]),
  outreachSubject: z.string().nullable(),
  outreachBody: z.string().nullable(),
});

export const leadershipChangeOutreachOutputSchema = z.object({
  totalCompaniesScanned: z.number(),
  changesDetected: z.number(),
  changes: z.array(leadershipChangeSchema),
});

export type LeadershipChangeOutreachOutput = z.infer<typeof leadershipChangeOutreachOutputSchema>;
