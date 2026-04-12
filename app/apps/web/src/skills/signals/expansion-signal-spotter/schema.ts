import { z } from "zod";

export const expansionSignalSpotterInputSchema = z.object({
  lookbackDays: z.number().min(7).max(180).default(30),
});

export type ExpansionSignalSpotterInput = z.infer<typeof expansionSignalSpotterInputSchema>;

const expansionSignalSchema = z.object({
  companyId: z.string(),
  companyName: z.string(),
  signalType: z.enum(["usage_increase", "new_department", "headcount_growth", "positive_sentiment", "deal_upsell_ready"]),
  title: z.string(),
  description: z.string(),
  strength: z.enum(["high", "medium", "low"]),
  suggestedAction: z.string(),
  currentDealValue: z.number().nullable(),
});

export const expansionSignalSpotterOutputSchema = z.object({
  totalCustomersAnalyzed: z.number(),
  expansionOpportunities: z.number(),
  totalExpansionRevenue: z.number(),
  signals: z.array(expansionSignalSchema),
});

export type ExpansionSignalSpotterOutput = z.infer<typeof expansionSignalSpotterOutputSchema>;
