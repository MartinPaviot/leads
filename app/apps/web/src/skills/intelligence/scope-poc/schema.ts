import { z } from "zod";

export const scopePocInputSchema = z.object({
  dealId: z.string().describe("Deal ID to scope a PoC for"),
  focusAreas: z
    .array(z.string())
    .optional()
    .describe("Specific areas to focus the PoC on (e.g. 'integration', 'performance')"),
});

export type ScopePocInput = z.infer<typeof scopePocInputSchema>;

export const scopePocOutputSchema = z.object({
  dealId: z.string(),
  dealName: z.string(),
  companyName: z.string().nullable(),
  poc: z.object({
    objective: z.string(),
    successCriteria: z.array(
      z.object({
        criterion: z.string(),
        measurable: z.string(),
        target: z.string(),
      }),
    ),
    scope: z.object({
      inScope: z.array(z.string()),
      outOfScope: z.array(z.string()),
    }),
    timeline: z.object({
      totalDays: z.number(),
      phases: z.array(
        z.object({
          name: z.string(),
          durationDays: z.number(),
          deliverables: z.array(z.string()),
        }),
      ),
    }),
    resourcesRequired: z.array(
      z.object({
        role: z.string(),
        commitment: z.string(),
        from: z.enum(["us", "them"]),
      }),
    ),
    risks: z.array(
      z.object({
        risk: z.string(),
        mitigation: z.string(),
      }),
    ),
    goNoGoFramework: z.string(),
  }),
});

export type ScopePocOutput = z.infer<typeof scopePocOutputSchema>;
