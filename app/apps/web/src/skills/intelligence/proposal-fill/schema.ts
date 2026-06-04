import { z } from "zod";

export const proposalFillInputSchema = z.object({
  templateId: z.string().describe("Mapped proposal template id"),
  dealId: z.string().describe("Deal id to draft the proposal for"),
});

export type ProposalFillInput = z.infer<typeof proposalFillInputSchema>;

export const proposalFillOutputSchema = z.object({
  proposalId: z.string(),
  templateId: z.string(),
  dealId: z.string(),
  components: z.array(
    z.object({
      componentId: z.string(),
      kind: z.string(),
      label: z.string(),
      content: z.string(),
      order: z.number(),
    }),
  ),
  unmappedSections: z.array(z.string()),
});

export type ProposalFillOutput = z.infer<typeof proposalFillOutputSchema>;
