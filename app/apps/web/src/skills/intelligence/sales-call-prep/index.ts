import type { SkillDefinition } from "@/skills/types";
import { salesCallPrepInputSchema, salesCallPrepOutputSchema } from "./schema";
import { salesCallPrepHandler } from "./handler";

export const salesCallPrepSkill: SkillDefinition = {
  slug: "sales-call-prep",
  name: "Sales Call Prep",
  category: "intelligence",
  description:
    "Deep pre-call preparation: person insights, company intel, competitive landscape, call strategy, personalized opening hook, discovery questions, value props mapped to needs, objection handlers, and closing move.",
  costEstimate: "~$0.05-0.10 per prep (LLM generation cost)",
  inputSchema: salesCallPrepInputSchema,
  outputSchema: salesCallPrepOutputSchema,
  handler: salesCallPrepHandler,
};
