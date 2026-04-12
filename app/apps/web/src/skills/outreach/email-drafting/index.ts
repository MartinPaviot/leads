import type { SkillDefinition } from "@/skills/types";
import { emailDraftingInputSchema, emailDraftingOutputSchema } from "./schema";
import { emailDraftingHandler } from "./handler";

export const emailDraftingSkill: SkillDefinition = {
  slug: "email-drafting",
  name: "Email Drafting",
  category: "outreach",
  description:
    "Draft a single cold email using prospect context and proven frameworks. Supports cold intro, follow-up, meeting request, value prop, and breakup emails. Enforces strict quality rules: max 150 words, no filler, human tone.",
  costEstimate: "~$0.02-0.05 per email (LLM generation cost)",
  inputSchema: emailDraftingInputSchema,
  outputSchema: emailDraftingOutputSchema,
  handler: emailDraftingHandler,
};
