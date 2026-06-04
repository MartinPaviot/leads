import { buildProposalFill } from "@/lib/proposals/fill";
import type { SkillRunOptions } from "@/skills/types";
import type { ProposalFillInput, ProposalFillOutput } from "./schema";

/**
 * Draft a proposal by filling a mapped template from a deal's info base.
 * Thin wrapper over buildProposalFill; abstains (FillUnavailable propagates)
 * rather than persisting a half-draft.
 */
export async function proposalFillHandler(
  input: ProposalFillInput,
  options: SkillRunOptions,
): Promise<ProposalFillOutput> {
  return buildProposalFill(input.templateId, input.dealId, {
    tenantId: options.tenantId,
  });
}
