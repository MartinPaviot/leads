import { z } from "zod";

export const sequencePerformanceInputSchema = z.object({
  sequenceId: z.string().optional().describe("Specific sequence ID to analyze, or omit for all sequences"),
  periodDays: z.number().min(7).max(365).default(30),
});

export type SequencePerformanceInput = z.infer<typeof sequencePerformanceInputSchema>;

const stepMetricsSchema = z.object({
  stepNumber: z.number(),
  sent: z.number(),
  delivered: z.number(),
  opened: z.number(),
  clicked: z.number(),
  replied: z.number(),
  bounced: z.number(),
  openRate: z.number(),
  replyRate: z.number(),
  bounceRate: z.number(),
});

export const sequencePerformanceOutputSchema = z.object({
  period: z.string(),
  sequences: z.array(z.object({
    sequenceId: z.string(),
    name: z.string(),
    status: z.string(),
    totalEnrolled: z.number(),
    totalCompleted: z.number(),
    totalReplied: z.number(),
    totalBounced: z.number(),
    overallReplyRate: z.number(),
    overallBounceRate: z.number(),
    stepMetrics: z.array(stepMetricsSchema),
  })),
  summary: z.object({
    totalSequences: z.number(),
    totalEmailsSent: z.number(),
    avgReplyRate: z.number(),
    avgBounceRate: z.number(),
    bestPerformingSequence: z.string().nullable(),
  }),
});

export type SequencePerformanceOutput = z.infer<typeof sequencePerformanceOutputSchema>;
