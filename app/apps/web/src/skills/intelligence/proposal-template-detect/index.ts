import type { SkillDefinition } from "@/skills/types";
import {
  proposalTemplateDetectInputSchema,
  proposalTemplateDetectOutputSchema,
} from "./schema";
import { proposalTemplateDetectHandler } from "./handler";

export const proposalTemplateDetectSkill: SkillDefinition = {
  slug: "proposal-template-detect",
  name: "Proposal Template Detection",
  category: "intelligence",
  description:
    "Analyze an uploaded proposal template (Word .docx) and propose its component structure — the prose sections to generate per prospect and the variable fields to fill — so the template can be auto-drafted from the deal's information base. Returns a component map for the user to confirm.",
  costEstimate: "~$0.01-0.03 per template (LLM analysis)",
  inputSchema: proposalTemplateDetectInputSchema,
  outputSchema: proposalTemplateDetectOutputSchema,
  handler: proposalTemplateDetectHandler,
};
