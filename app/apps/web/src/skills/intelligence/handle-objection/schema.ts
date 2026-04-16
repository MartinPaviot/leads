import { z } from "zod";

export const handleObjectionInputSchema = z.object({
  dealId: z.string().describe("Deal ID for context"),
  objection: z.string().describe("The specific objection text raised by the prospect"),
  objectionCategory: z
    .enum(["pricing", "timing", "competition", "technical", "authority", "need", "other"])
    .optional()
    .describe("Category of the objection (auto-detected if not provided)"),
});

export type HandleObjectionInput = z.infer<typeof handleObjectionInputSchema>;

export const handleObjectionOutputSchema = z.object({
  dealId: z.string(),
  objection: z.string(),
  category: z.string(),
  response: z.object({
    acknowledgment: z.string(),
    reframe: z.string(),
    evidence: z.array(
      z.object({
        type: z.enum(["case_study", "data_point", "testimonial", "comparison"]),
        content: z.string(),
      }),
    ),
    talkingPoints: z.array(z.string()),
    suggestedResponse: z.string(),
    followUpQuestion: z.string(),
  }),
});

export type HandleObjectionOutput = z.infer<typeof handleObjectionOutputSchema>;
