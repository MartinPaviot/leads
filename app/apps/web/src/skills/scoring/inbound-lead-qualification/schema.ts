import { z } from "zod";

export const inboundLeadQualificationInputSchema = z.object({
  contactId: z.string().describe("Elevay contact ID (newly created inbound lead)"),
  source: z.enum(["form", "demo_request", "trial", "content_download", "webinar", "chatbot", "referral", "unknown"]).default("unknown"),
  // Scoring is the stored ICP-profile fit (Settings → ICP) — callers can
  // no longer supply ad-hoc targetRoles/industries.
});

export type InboundLeadQualificationInput = z.infer<typeof inboundLeadQualificationInputSchema>;

export const inboundLeadQualificationOutputSchema = z.object({
  contactId: z.string(),
  contactName: z.string().nullable(),
  companyName: z.string().nullable(),
  source: z.string(),
  score: z.number(),
  grade: z.string(),
  qualified: z.boolean(),
  priority: z.enum(["hot", "warm", "nurture", "disqualified"]),
  reasons: z.array(z.string()),
  recommendedAction: z.string(),
  isDuplicate: z.boolean(),
  existingContactId: z.string().nullable(),
  knowledgeContext: z.string().optional(),
});

export type InboundLeadQualificationOutput = z.infer<typeof inboundLeadQualificationOutputSchema>;
