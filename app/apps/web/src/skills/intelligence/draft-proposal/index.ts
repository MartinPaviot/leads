import type { SkillDefinition } from "@/skills/types";
import { draftProposalInputSchema, draftProposalOutputSchema } from "./schema";
import { draftProposalHandler } from "./handler";

export const draftProposalSkill: SkillDefinition = {
  slug: "draft-proposal",
  name: "Proposal Drafting",
  category: "intelligence",
  description:
    "Generate a structured commercial proposal for a deal: executive summary, problem statement, proposed solution with differentiators, implementation timeline, optional pricing tiers, next steps, and closing statement. References prior conversations.",
  costEstimate: "~$0.05-0.10 per proposal (LLM generation cost)",
  inputSchema: draftProposalInputSchema,
  outputSchema: draftProposalOutputSchema,
  handler: draftProposalHandler,
};
