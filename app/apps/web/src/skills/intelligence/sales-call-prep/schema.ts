import { z } from "zod";

export const salesCallPrepInputSchema = z.object({
  contactId: z.string().describe("Elevay contact ID for the call participant"),
  dealId: z.string().optional().describe("Associated deal ID, if any"),
  callType: z.enum(["discovery", "demo", "follow_up", "negotiation", "close"]).default("discovery"),
});

export type SalesCallPrepInput = z.infer<typeof salesCallPrepInputSchema>;

export const salesCallPrepOutputSchema = z.object({
  contactId: z.string(),
  contactName: z.string().nullable(),
  companyName: z.string().nullable(),
  callType: z.string(),
  prep: z.object({
    executiveSummary: z.string(),
    personInsights: z.array(z.string()),
    companyInsights: z.array(z.string()),
    competitiveLandscape: z.string(),
    callStrategy: z.string(),
    openingHook: z.string(),
    discoveryQuestions: z.array(z.string()),
    valuePropositions: z.array(z.string()),
    objectionHandlers: z.array(z.object({
      objection: z.string(),
      response: z.string(),
    })),
    closingMove: z.string(),
  }),
});

export type SalesCallPrepOutput = z.infer<typeof salesCallPrepOutputSchema>;
