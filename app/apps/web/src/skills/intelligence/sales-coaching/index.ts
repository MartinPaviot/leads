import type { SkillDefinition } from "@/skills/types";
import { salesCoachingInputSchema, salesCoachingOutputSchema } from "./schema";
import { salesCoachingHandler } from "./handler";

export const salesCoachingSkill: SkillDefinition = {
  slug: "sales-coaching",
  name: "Sales Coaching",
  category: "intelligence",
  description:
    "AI sales coach for a specific deal: health score, risk assessment, strengths/weaknesses analysis, next steps, stage advancement advice, and objection preparation. Uses deal velocity + activity history + LLM reasoning.",
  costEstimate: "~$0.05-0.10 per analysis (LLM generation cost)",
  inputSchema: salesCoachingInputSchema,
  outputSchema: salesCoachingOutputSchema,
  handler: salesCoachingHandler,
};
