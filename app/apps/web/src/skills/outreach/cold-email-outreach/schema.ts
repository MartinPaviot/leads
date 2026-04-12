import { z } from "zod";

export const coldEmailOutreachInputSchema = z.object({
  contactId: z.string().describe("Elevay contact ID to generate sequence for"),
  stepCount: z.number().min(3).max(7).default(5),
  meetingSlots: z.string().optional().describe("Available meeting slots to include in CTAs"),
  evaluate: z.boolean().default(false).describe("Run evaluator-optimizer loop for quality (slower)"),
});

export type ColdEmailOutreachInput = z.infer<typeof coldEmailOutreachInputSchema>;

const stepSchema = z.object({
  stepNumber: z.number(),
  subject: z.string(),
  body: z.string(),
  delayDays: z.number(),
  purpose: z.string(),
  signalUsed: z.string().optional(),
  methodologyApplied: z.string().optional(),
});

export const coldEmailOutreachOutputSchema = z.object({
  contactId: z.string(),
  sequenceName: z.string(),
  sequenceReasoning: z.string(),
  steps: z.array(stepSchema),
  prospectName: z.string().nullable(),
  companyName: z.string().nullable(),
});

export type ColdEmailOutreachOutput = z.infer<typeof coldEmailOutreachOutputSchema>;
