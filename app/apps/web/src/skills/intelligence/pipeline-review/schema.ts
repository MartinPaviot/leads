import { z } from "zod";

export const pipelineReviewInputSchema = z.object({
  periodDays: z.number().min(7).max(365).default(30),
  includeStuckDeals: z.boolean().default(true),
  stuckThresholdDays: z.number().min(7).max(90).default(14),
});

export type PipelineReviewInput = z.infer<typeof pipelineReviewInputSchema>;

const dealSummarySchema = z.object({
  dealId: z.string(),
  name: z.string(),
  stage: z.string(),
  value: z.number().nullable(),
  companyName: z.string().nullable(),
  contactName: z.string().nullable(),
  daysInStage: z.number(),
  isStuck: z.boolean(),
  lastActivityDaysAgo: z.number().nullable(),
});

export const pipelineReviewOutputSchema = z.object({
  period: z.string(),
  totalDeals: z.number(),
  totalValue: z.number(),
  stageBreakdown: z.array(z.object({
    stage: z.string(),
    count: z.number(),
    totalValue: z.number(),
  })),
  stuckDeals: z.array(dealSummarySchema),
  topDeals: z.array(dealSummarySchema),
  metrics: z.object({
    avgDaysInPipeline: z.number(),
    winRate: z.number().nullable(),
    avgDealValue: z.number(),
    dealsCreatedInPeriod: z.number(),
    dealsClosedInPeriod: z.number(),
  }),
});

export type PipelineReviewOutput = z.infer<typeof pipelineReviewOutputSchema>;
