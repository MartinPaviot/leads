/**
 * Zod schemas for deal briefing — separated from deal-briefing.ts
 * so tests can import the schema without pulling in LLM/DB deps.
 */

import { z } from "zod";

export const dealBriefSchema = z.object({
  dealId: z.string(),
  dealName: z.string(),
  stage: z.string(),
  value: z.number().nullable(),
  contactName: z.string().nullable(),
  companyName: z.string().nullable(),
  daysInStage: z.number(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  summary: z.string(),
  keyDiscussions: z.array(
    z.object({
      date: z.string(),
      topic: z.string(),
      source: z.enum(["email", "meeting", "call", "note"]),
      verbatimQuote: z.string().optional(),
    }),
  ),
  promisesMade: z.array(
    z.object({
      by: z.enum(["us", "them"]),
      what: z.string(),
      when: z.string().optional(),
      fulfilled: z.boolean().nullable(),
    }),
  ),
  objectionsRaised: z.array(
    z.object({
      objection: z.string(),
      status: z.enum(["open", "addressed", "resolved"]),
      ourResponse: z.string().optional(),
    }),
  ),
  stallReason: z.string().nullable(),
  nextAction: z.object({
    action: z.string(),
    owner: z.enum(["us", "them"]),
    suggestedDate: z.string().optional(),
  }),
  healthScore: z.number(),
});

export type DealBrief = z.infer<typeof dealBriefSchema>;
