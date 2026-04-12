import type { SkillDefinition } from "@/skills/types";
import { jobPostingIntentInputSchema, jobPostingIntentOutputSchema } from "./schema";
import { jobPostingIntentHandler } from "./handler";

export const jobPostingIntentSkill: SkillDefinition = {
  slug: "job-posting-intent",
  name: "Job Posting Intent",
  category: "signals",
  description:
    "Detect buying intent from company growth signals. Tracks employee count changes via Apollo enrichment, identifies hiring managers, and suggests outreach angles based on growth patterns.",
  costEstimate: "Free (Apollo org enrich) + optional ~$0.02 LLM per company",
  inputSchema: jobPostingIntentInputSchema,
  outputSchema: jobPostingIntentOutputSchema,
  handler: jobPostingIntentHandler,
};
