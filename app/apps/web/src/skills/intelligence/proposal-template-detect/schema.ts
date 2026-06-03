import { z } from "zod";
import { componentMapSchema } from "@/lib/proposals/component-map";

export const proposalTemplateDetectInputSchema = z.object({
  templateId: z.string().describe("Proposal template id to detect components for"),
});

export type ProposalTemplateDetectInput = z.infer<
  typeof proposalTemplateDetectInputSchema
>;

export const proposalTemplateDetectOutputSchema = z.object({
  templateId: z.string(),
  componentMap: componentMapSchema,
  detectionMeta: z.object({
    truncated: z.boolean(),
    model: z.string().nullable(),
    componentCount: z.number(),
  }),
});

export type ProposalTemplateDetectOutput = z.infer<
  typeof proposalTemplateDetectOutputSchema
>;
