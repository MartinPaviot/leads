import type { SkillDefinition } from "@/skills/types";
import { coldEmailOutreachInputSchema, coldEmailOutreachOutputSchema } from "./schema";
import { coldEmailOutreachHandler } from "./handler";

export const coldEmailOutreachSkill: SkillDefinition = {
  slug: "cold-email-outreach",
  name: "Cold Email Outreach",
  category: "outreach",
  description:
    "Generate a personalized 3-7 step cold email outreach sequence for a contact. Uses prospect context (signals, company data, previous interactions) and methodology framework for high-quality personalization.",
  costEstimate: "~$0.05-0.15 per sequence (LLM generation cost)",
  inputSchema: coldEmailOutreachInputSchema,
  outputSchema: coldEmailOutreachOutputSchema,
  handler: coldEmailOutreachHandler,
};
