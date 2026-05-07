import { z } from "zod";

export const leadQualificationInputSchema = z.object({
  contactIds: z.array(z.string()).min(1).max(100).describe("Elevay contact IDs to qualify"),
  icpSettings: z.object({
    targetRoles: z.string().optional().describe("Comma-separated target role keywords"),
    targetIndustries: z.array(z.string()).optional(),
  }).optional(),
  minScoreThreshold: z.number().min(0).max(100).default(40).describe("Minimum score to be considered qualified"),
});

export type LeadQualificationInput = z.infer<typeof leadQualificationInputSchema>;

const qualifiedLeadSchema = z.object({
  contactId: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  title: z.string().nullable(),
  companyName: z.string().nullable(),
  score: z.number(),
  grade: z.string(),
  qualified: z.boolean(),
  reasons: z.array(z.string()),
  breakdown: z.object({
    seniority: z.number(),
    engagement: z.number(),
    sentiment: z.number(),
    icpFit: z.number(),
  }),
});

export const leadQualificationOutputSchema = z.object({
  totalProcessed: z.number(),
  totalQualified: z.number(),
  totalDisqualified: z.number(),
  avgScore: z.number(),
  leads: z.array(qualifiedLeadSchema),
  knowledgeContext: z.string().optional(),
});

export type LeadQualificationOutput = z.infer<typeof leadQualificationOutputSchema>;
