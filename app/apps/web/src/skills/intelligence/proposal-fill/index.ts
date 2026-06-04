import type { SkillDefinition } from "@/skills/types";
import { proposalFillInputSchema, proposalFillOutputSchema } from "./schema";
import { proposalFillHandler } from "./handler";

export const proposalFillSkill: SkillDefinition = {
  slug: "proposal-fill",
  name: "Proposal Fill",
  category: "intelligence",
  description:
    "Draft a commercial proposal by filling a mapped template (Word .docx) from a deal's information base: resolve every field value and generate each section's prose grounded in the deal, company, stakeholders, and conversation history. Returns the per-component content; the filled .docx is then downloadable.",
  costEstimate: "~$0.05-0.15 per proposal (LLM section drafting)",
  inputSchema: proposalFillInputSchema,
  outputSchema: proposalFillOutputSchema,
  handler: proposalFillHandler,
};
