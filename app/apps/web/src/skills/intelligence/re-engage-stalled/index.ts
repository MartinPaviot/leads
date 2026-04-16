import type { SkillDefinition } from "@/skills/types";
import { reEngageStalledInputSchema, reEngageStalledOutputSchema } from "./schema";
import { reEngageStalledHandler } from "./handler";

export const reEngageStalledSkill: SkillDefinition = {
  slug: "re-engage-stalled",
  name: "Stalled Deal Re-engagement",
  category: "intelligence",
  description:
    "Diagnose why a deal stalled and generate a re-engagement strategy: root cause analysis, approach selection (value reminder, new angle, executive sponsor, breakup, or trigger event), a ready-to-send email draft referencing past conversations, alternative angles, and an escalation plan.",
  costEstimate: "~$0.05-0.10 per re-engagement (LLM generation cost)",
  inputSchema: reEngageStalledInputSchema,
  outputSchema: reEngageStalledOutputSchema,
  handler: reEngageStalledHandler,
};
