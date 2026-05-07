import { buildProspectContext } from "@/lib/context/prospect-context";
import { generateSequence } from "@/lib/agents/sequence-generator";
import { getSkillKnowledge } from "@/skills/skill-knowledge";
import type { SkillRunOptions } from "@/skills/types";
import type { ColdEmailOutreachInput, ColdEmailOutreachOutput } from "./schema";

export async function coldEmailOutreachHandler(
  input: ColdEmailOutreachInput,
  options: SkillRunOptions,
): Promise<ColdEmailOutreachOutput> {
  // Build prospect context and retrieve knowledge in parallel
  const [ctx, knowledgeBlock] = await Promise.all([
    buildProspectContext(input.contactId, options.tenantId),
    getSkillKnowledge("cold email outreach value proposition product positioning", options.tenantId),
  ]);
  if (!ctx) {
    throw new Error(`Could not build prospect context for contact ${input.contactId}`);
  }

  // Generate sequence using existing AI generator
  const sequence = await generateSequence(ctx, {
    stepCount: input.stepCount,
    meetingSlots: input.meetingSlots,
    tenantId: options.tenantId,
    evaluate: input.evaluate,
    knowledgeContext: knowledgeBlock,
  });

  return {
    contactId: input.contactId,
    sequenceName: sequence.sequenceName,
    sequenceReasoning: sequence.sequenceReasoning,
    steps: sequence.steps,
    prospectName: ctx.contact.fullName,
    companyName: ctx.company?.name ?? null,
  };
}
