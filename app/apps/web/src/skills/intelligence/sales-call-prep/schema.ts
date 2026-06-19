import { z } from "zod";
import { MOMENTS } from "@/lib/motion/moment";

export const salesCallPrepInputSchema = z.object({
  contactId: z.string().describe("Elevay contact ID for the call participant"),
  dealId: z.string().optional().describe("Associated deal ID, if any"),
  /** Legacy call type. The computed `moment` is the source of truth now; kept for back-compat. */
  callType: z
    .enum(["discovery", "demo", "follow_up", "negotiation", "close"])
    .default("discovery"),
  /** The sales moment, computed upstream by lib/motion/moment.ts. Optional — derived from the deal if absent. */
  moment: z.enum(MOMENTS).optional(),
  /** A natural-language correction from the user ("this is a demo"); normalized and persisted as the deal's override. */
  momentHint: z.string().optional(),
});

export type SalesCallPrepInput = z.infer<typeof salesCallPrepInputSchema>;

export const salesCallPrepOutputSchema = z.object({
  contactId: z.string(),
  contactName: z.string().nullable(),
  companyName: z.string().nullable(),
  /** Legacy echo. */
  callType: z.string(),
  /** The moment the prep was specialized for. */
  moment: z.string(),
  prep: z.object({
    executiveSummary: z.string(),
    personInsights: z.array(z.string()),
    companyInsights: z.array(z.string()),
    competitiveLandscape: z.string(),
    callStrategy: z.string(),
    openingHook: z.string(),
    discoveryQuestions: z.array(z.string()),
    valuePropositions: z.array(z.string()),
    objectionHandlers: z.array(
      z.object({
        objection: z.string(),
        response: z.string(),
      }),
    ),
    closingMove: z.string(),
    /** Set when the moment cannot be prepped (e.g. a demo with no discovery captured). */
    blocked: z.string().optional(),
  }),
});

export type SalesCallPrepOutput = z.infer<typeof salesCallPrepOutputSchema>;
