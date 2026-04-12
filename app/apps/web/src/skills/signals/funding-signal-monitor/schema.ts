import { z } from "zod";

export const fundingSignalMonitorInputSchema = z.object({
  companyIds: z.array(z.string()).min(1).max(200)
    .describe("Elevay company IDs to check for funding signals"),
  targetFundingStages: z.array(z.string()).default(["Seed", "Series A", "Series B", "Series C"])
    .describe("Funding stages to flag as signals"),
  minFundingAmount: z.number().default(500000)
    .describe("Minimum funding amount ($) to flag"),
});

export type FundingSignalMonitorInput = z.infer<typeof fundingSignalMonitorInputSchema>;

const fundingSignalSchema = z.object({
  companyId: z.string(),
  companyName: z.string(),
  companyDomain: z.string().nullable(),
  fundingStage: z.string().nullable(),
  totalFunding: z.number().nullable(),
  totalFundingPrinted: z.string().nullable(),
  isNewFunding: z.boolean(),
  signalStrength: z.enum(["high", "medium", "low"]),
  recommendation: z.string(),
});

export const fundingSignalMonitorOutputSchema = z.object({
  totalChecked: z.number(),
  fundedCompanies: z.number(),
  newFundingDetected: z.number(),
  signals: z.array(fundingSignalSchema),
});

export type FundingSignalMonitorOutput = z.infer<typeof fundingSignalMonitorOutputSchema>;
