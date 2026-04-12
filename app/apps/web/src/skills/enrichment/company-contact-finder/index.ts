import type { SkillDefinition } from "@/skills/types";
import { companyContactFinderInputSchema, companyContactFinderOutputSchema } from "./schema";
import { companyContactFinderHandler } from "./handler";

export const companyContactFinderSkill: SkillDefinition = {
  slug: "company-contact-finder",
  name: "Company Contact Finder",
  category: "enrichment",
  description:
    "Find decision-makers at a specific company using Apollo People Search. Filters by seniority and title to surface VP+, Director, and C-suite contacts.",
  costEstimate: "Free (Apollo People Search)",
  inputSchema: companyContactFinderInputSchema,
  outputSchema: companyContactFinderOutputSchema,
  handler: companyContactFinderHandler,
};
