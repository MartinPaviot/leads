import { z } from "zod";

export const reEngageStalledInputSchema = z.object({
  dealId: z.string().describe("Stalled deal ID to re-engage"),
});

export type ReEngageStalledInput = z.infer<typeof reEngageStalledInputSchema>;

export const reEngageStalledOutputSchema = z.object({
  dealId: z.string(),
  dealName: z.string(),
  companyName: z.string().nullable(),
  daysSinceLastActivity: z.number(),
  strategy: z.object({
    diagnosis: z.string(),
    approach: z.enum(["value_reminder", "new_angle", "executive_sponsor", "breakup", "trigger_event"]),
    reasoning: z.string(),
    emailDraft: z.object({
      subject: z.string(),
      body: z.string(),
    }),
    alternativeAngles: z.array(z.string()),
    escalationPlan: z.string().optional(),
  }),
});

export type ReEngageStalledOutput = z.infer<typeof reEngageStalledOutputSchema>;
