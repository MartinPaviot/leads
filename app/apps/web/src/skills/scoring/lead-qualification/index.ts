import type { SkillDefinition } from "@/skills/types";
import { leadQualificationInputSchema, leadQualificationOutputSchema } from "./schema";
import { leadQualificationHandler } from "./handler";

export const leadQualificationSkill: SkillDefinition = {
  slug: "lead-qualification",
  name: "Lead Qualification",
  category: "scoring",
  description:
    "Batch-qualify contacts against the ICP profiles: each lead's score is the stored ICP fit (company criteria + persona match), refreshed before reading. Returns scored and graded leads with qualification status.",
  costEstimate: "DB queries; small LLM cost on first run when ICP personas are configured (title resolution, cached)",
  inputSchema: leadQualificationInputSchema,
  outputSchema: leadQualificationOutputSchema,
  handler: leadQualificationHandler,
};
