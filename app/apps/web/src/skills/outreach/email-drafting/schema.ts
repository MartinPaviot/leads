import { z } from "zod";

export const emailDraftingInputSchema = z.object({
  contactId: z.string().describe("Elevay contact ID to draft email for"),
  purpose: z.enum(["cold_intro", "follow_up", "meeting_request", "value_prop", "breakup"]).default("cold_intro"),
  additionalContext: z.string().optional().describe("Any additional context or angle for the email"),
  maxWords: z.number().min(50).max(300).default(150),
});

export type EmailDraftingInput = z.infer<typeof emailDraftingInputSchema>;

export const emailDraftingOutputSchema = z.object({
  contactId: z.string(),
  subject: z.string(),
  body: z.string(),
  wordCount: z.number(),
  purpose: z.string(),
  prospectName: z.string().nullable(),
  companyName: z.string().nullable(),
  signalUsed: z.string().nullable(),
});

export type EmailDraftingOutput = z.infer<typeof emailDraftingOutputSchema>;
