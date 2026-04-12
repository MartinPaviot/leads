import type { SkillDefinition } from "@/skills/types";
import { apolloLeadFinderInputSchema, apolloLeadFinderOutputSchema } from "./schema";
import { apolloLeadFinderHandler } from "./handler";

export const apolloLeadFinderSkill: SkillDefinition = {
  slug: "apollo-lead-finder",
  name: "Apollo Lead Finder",
  category: "enrichment",
  description:
    "Two-phase Apollo prospecting: free People Search for discovery, then optional paid enrichment for verified emails/phones. Search by domain, title, seniority.",
  costEstimate: "Free for search, 1 Apollo credit per enriched contact",
  inputSchema: apolloLeadFinderInputSchema,
  outputSchema: apolloLeadFinderOutputSchema,
  handler: apolloLeadFinderHandler,
};
