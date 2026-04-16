import type { SkillDefinition } from "@/skills/types";
import { handleObjectionInputSchema, handleObjectionOutputSchema } from "./schema";
import { handleObjectionHandler } from "./handler";

export const handleObjectionSkill: SkillDefinition = {
  slug: "handle-objection",
  name: "Objection Handler",
  category: "intelligence",
  description:
    "Generate a strategic response to a specific prospect objection: empathetic acknowledgment, perspective reframe, supporting evidence, talking points, suggested verbatim response, and a follow-up question. Uses deal context and conversation history.",
  costEstimate: "~$0.03-0.05 per objection (LLM generation cost)",
  inputSchema: handleObjectionInputSchema,
  outputSchema: handleObjectionOutputSchema,
  handler: handleObjectionHandler,
};
