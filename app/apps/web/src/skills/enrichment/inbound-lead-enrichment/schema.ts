import { z } from "zod";

export const inboundLeadEnrichmentInputSchema = z.object({
  contactId: z.string().describe("Elevay contact ID to enrich"),
  enrichCompany: z.boolean().default(true).describe("Also enrich the associated company"),
});

export type InboundLeadEnrichmentInput = z.infer<typeof inboundLeadEnrichmentInputSchema>;

export const inboundLeadEnrichmentOutputSchema = z.object({
  contactId: z.string(),
  contactEnriched: z.boolean(),
  companyEnriched: z.boolean(),
  fieldsUpdated: z.array(z.string()),
  apolloPersonId: z.string().nullable(),
  apolloOrgId: z.string().nullable(),
});

export type InboundLeadEnrichmentOutput = z.infer<typeof inboundLeadEnrichmentOutputSchema>;
