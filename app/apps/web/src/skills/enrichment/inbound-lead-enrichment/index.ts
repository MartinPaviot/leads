import type { SkillDefinition } from "@/skills/types";
import { inboundLeadEnrichmentInputSchema, inboundLeadEnrichmentOutputSchema } from "./schema";
import { inboundLeadEnrichmentHandler } from "./handler";

export const inboundLeadEnrichmentSkill: SkillDefinition = {
  slug: "inbound-lead-enrichment",
  name: "Inbound Lead Enrichment",
  category: "enrichment",
  description:
    "Enriches an existing Elevay contact with Apollo data: fills missing title, LinkedIn, phone, seniority, departments. Optionally enriches the associated company with industry, size, revenue, tech stack, funding.",
  costEstimate: "1 Apollo credit per person enrichment, free for company enrichment",
  inputSchema: inboundLeadEnrichmentInputSchema,
  outputSchema: inboundLeadEnrichmentOutputSchema,
  handler: inboundLeadEnrichmentHandler,
};
