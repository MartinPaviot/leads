import type { SkillDefinition } from "@/skills/types";
import { scopePocInputSchema, scopePocOutputSchema } from "./schema";
import { scopePocHandler } from "./handler";

export const scopePocSkill: SkillDefinition = {
  slug: "scope-poc",
  name: "PoC Scoping",
  category: "intelligence",
  description:
    "Generate a structured Proof of Concept plan for a deal: objective, success criteria, scope, timeline with phases, resource requirements, risks with mitigations, and go/no-go evaluation framework.",
  costEstimate: "~$0.05-0.10 per PoC scope (LLM generation cost)",
  inputSchema: scopePocInputSchema,
  outputSchema: scopePocOutputSchema,
  handler: scopePocHandler,
};
