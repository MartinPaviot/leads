import { z } from "zod";

export const jobPostingIntentInputSchema = z.object({
  companyIds: z.array(z.string()).min(1).max(100)
    .describe("Elevay company IDs to check for hiring signals"),
  targetKeywords: z.array(z.string()).default([])
    .describe("Job title keywords that indicate buying intent for your product (e.g., 'sales ops', 'revops', 'CRM admin')"),
});

export type JobPostingIntentInput = z.infer<typeof jobPostingIntentInputSchema>;

const hiringSignalSchema = z.object({
  companyId: z.string(),
  companyName: z.string(),
  companyDomain: z.string().nullable(),
  hiringManagerTitle: z.string().nullable(),
  hiringManagerName: z.string().nullable(),
  hiringManagerEmail: z.string().nullable(),
  signalStrength: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
  suggestedOutreachAngle: z.string(),
});

export const jobPostingIntentOutputSchema = z.object({
  totalCompaniesChecked: z.number(),
  signalsFound: z.number(),
  signals: z.array(hiringSignalSchema),
});

export type JobPostingIntentOutput = z.infer<typeof jobPostingIntentOutputSchema>;
