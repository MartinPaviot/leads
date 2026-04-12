import type { SkillDefinition } from "@/skills/types";
import { leadershipChangeOutreachInputSchema, leadershipChangeOutreachOutputSchema } from "./schema";
import { leadershipChangeOutreachHandler } from "./handler";

export const leadershipChangeOutreachSkill: SkillDefinition = {
  slug: "leadership-change-outreach",
  name: "Leadership Change Outreach",
  category: "outreach",
  description:
    "Detect new VP+ and C-suite hires at tracked companies by comparing Apollo People Search against existing contacts. Auto-generates personalized outreach emails for new leaders in their first 90 days.",
  costEstimate: "Free (Apollo People Search) + ~$0.03 LLM per email",
  inputSchema: leadershipChangeOutreachInputSchema,
  outputSchema: leadershipChangeOutreachOutputSchema,
  handler: leadershipChangeOutreachHandler,
};
