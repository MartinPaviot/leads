import { z } from "zod";

export const salesCoachingInputSchema = z.object({
  dealId: z.string().describe("Elevay deal ID to analyze"),
});

export type SalesCoachingInput = z.infer<typeof salesCoachingInputSchema>;

export const salesCoachingOutputSchema = z.object({
  dealId: z.string(),
  dealName: z.string(),
  stage: z.string(),
  value: z.number().nullable(),
  companyName: z.string().nullable(),
  coaching: z.object({
    dealHealthScore: z.number().min(0).max(100),
    risk: z.enum(["on_track", "slowing", "stalled", "at_risk"]),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    nextSteps: z.array(z.string()),
    stageAdviceToAdvance: z.string(),
    objectionsToAnticipate: z.array(z.string()),
  }),
});

export type SalesCoachingOutput = z.infer<typeof salesCoachingOutputSchema>;
