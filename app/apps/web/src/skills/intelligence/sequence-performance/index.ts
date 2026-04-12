import type { SkillDefinition } from "@/skills/types";
import { sequencePerformanceInputSchema, sequencePerformanceOutputSchema } from "./schema";
import { sequencePerformanceHandler } from "./handler";

export const sequencePerformanceSkill: SkillDefinition = {
  slug: "sequence-performance",
  name: "Sequence Performance",
  category: "intelligence",
  description:
    "Analyze email sequence/campaign performance: open rates, reply rates, bounce rates by step. Identifies best-performing sequences and problematic steps.",
  costEstimate: "Free (DB queries only)",
  inputSchema: sequencePerformanceInputSchema,
  outputSchema: sequencePerformanceOutputSchema,
  handler: sequencePerformanceHandler,
};
