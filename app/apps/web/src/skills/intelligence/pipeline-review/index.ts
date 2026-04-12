import type { SkillDefinition } from "@/skills/types";
import { pipelineReviewInputSchema, pipelineReviewOutputSchema } from "./schema";
import { pipelineReviewHandler } from "./handler";

export const pipelineReviewSkill: SkillDefinition = {
  slug: "pipeline-review",
  name: "Pipeline Review",
  category: "intelligence",
  description:
    "Analyze deal pipeline health: stage breakdown, stuck deals, win rate, average deal value, velocity metrics. Identifies at-risk deals that need attention.",
  costEstimate: "Free (DB queries only)",
  inputSchema: pipelineReviewInputSchema,
  outputSchema: pipelineReviewOutputSchema,
  handler: pipelineReviewHandler,
};
