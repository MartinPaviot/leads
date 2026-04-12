import { z } from "zod";

export const championTrackerInputSchema = z.object({
  contactIds: z.array(z.string()).min(1).max(200)
    .describe("Elevay contact IDs of known champions/advocates to monitor"),
  detectJobChange: z.boolean().default(true)
    .describe("Re-enrich contacts via Apollo to detect title/company changes"),
});

export type ChampionTrackerInput = z.infer<typeof championTrackerInputSchema>;

const championChangeSchema = z.object({
  contactId: z.string(),
  contactName: z.string().nullable(),
  changeType: z.enum(["job_change", "title_change", "company_change", "no_change"]),
  previousTitle: z.string().nullable(),
  currentTitle: z.string().nullable(),
  previousCompany: z.string().nullable(),
  currentCompany: z.string().nullable(),
  newCompanyDomain: z.string().nullable(),
  signalStrength: z.enum(["high", "medium", "low"]),
  recommendation: z.string(),
});

export const championTrackerOutputSchema = z.object({
  totalTracked: z.number(),
  changesDetected: z.number(),
  changes: z.array(championChangeSchema),
  noChanges: z.number(),
  creditsUsed: z.number(),
});

export type ChampionTrackerOutput = z.infer<typeof championTrackerOutputSchema>;
