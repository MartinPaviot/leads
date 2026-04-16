import { z } from "zod";

export const draftProposalInputSchema = z.object({
  dealId: z.string().describe("Deal ID to draft a proposal for"),
  includeTimeline: z.boolean().optional().describe("Include implementation timeline (default true)"),
  includePricing: z.boolean().optional().describe("Include pricing section (default true)"),
});

export type DraftProposalInput = z.infer<typeof draftProposalInputSchema>;

export const draftProposalOutputSchema = z.object({
  dealId: z.string(),
  dealName: z.string(),
  companyName: z.string().nullable(),
  proposal: z.object({
    executiveSummary: z.string(),
    problemStatement: z.string(),
    proposedSolution: z.object({
      overview: z.string(),
      keyCapabilities: z.array(z.string()),
      differentiators: z.array(z.string()),
    }),
    implementationPlan: z.object({
      phases: z.array(
        z.object({
          name: z.string(),
          duration: z.string(),
          activities: z.array(z.string()),
        }),
      ),
      totalDuration: z.string(),
    }),
    pricing: z.object({
      summary: z.string(),
      tiers: z.array(
        z.object({
          name: z.string(),
          price: z.string(),
          includes: z.array(z.string()),
        }),
      ),
    }).optional(),
    nextSteps: z.array(z.string()),
    closingStatement: z.string(),
  }),
});

export type DraftProposalOutput = z.infer<typeof draftProposalOutputSchema>;
