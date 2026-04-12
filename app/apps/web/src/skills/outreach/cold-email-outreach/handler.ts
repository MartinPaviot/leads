import { buildProspectContext } from "@/lib/prospect-context";
import { generateSequence } from "@/lib/sequence-generator";
import type { SkillRunOptions } from "@/skills/types";
import type { ColdEmailOutreachInput, ColdEmailOutreachOutput } from "./schema";

export async function coldEmailOutreachHandler(
  input: ColdEmailOutreachInput,
  options: SkillRunOptions,
): Promise<ColdEmailOutreachOutput> {
  // Build prospect context from Elevay DB
  const ctx = await buildProspectContext(input.contactId, options.tenantId);
  if (!ctx) {
    throw new Error(`Could not build prospect context for contact ${input.contactId}`);
  }

  // Generate sequence using existing AI generator
  const sequence = await generateSequence(ctx, {
    stepCount: input.stepCount,
    meetingSlots: input.meetingSlots,
    tenantId: options.tenantId,
    evaluate: input.evaluate,
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
