/**
 * AI ICP inference — prompt + response schema (Phase 2, _specs/multi-icp).
 *
 * Given the tenant's product description + best-customer examples and
 * the field catalog, ask Claude to propose N candidate ICPs with
 * criteria ALREADY mapped onto real catalog fieldKeys + legal
 * operators — so the candidates round-trip through validateIcpInput
 * without a translation layer. The endpoint returns candidates
 * un-persisted; the founder reviews/edits in the rule-builder, then
 * POSTs the ones they keep.
 *
 * Pure: builds the prompt string + declares the schema. The endpoint
 * does the LLM call + validation.
 */

import { z } from "zod";
import type { ResolvedCatalogRow } from "./catalog-db";

export const MAX_INFERRED_ICPS = 4;

// The model returns criteria keyed by fieldKey + operator + value. We
// keep value as a permissive union (the validator does the strict
// shape check against the operator afterwards).
export const inferenceResponseSchema = z.object({
  icps: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        priority: z.number().int().min(0),
        criteria: z.array(
          z.object({
            fieldKey: z.string(),
            operator: z.string(),
            value: z.unknown(),
            weight: z.number().min(0).max(10),
            isRequired: z.boolean(),
          }),
        ),
      }),
    )
    .max(MAX_INFERRED_ICPS),
});

export type InferenceResponse = z.infer<typeof inferenceResponseSchema>;

export type InferenceContext = {
  productDescription?: string | null;
  salesMotion?: string | null;
  bestCustomers?: string[]; // names or domains
  catalog: ResolvedCatalogRow[];
};

function catalogReference(catalog: ResolvedCatalogRow[]): string {
  // Compact field reference the model must map onto. One line per
  // field: key, label, value type, allowed operators.
  return catalog
    .map(
      (f) =>
        `- ${f.fieldKey} (${f.label}; ${f.valueType}; operators: ${f.operators.join("/")})`,
    )
    .join("\n");
}

export function buildInferencePrompt(ctx: InferenceContext): string {
  const business = [
    ctx.productDescription && `Product: ${ctx.productDescription}`,
    ctx.salesMotion && `Sales motion: ${ctx.salesMotion}`,
    ctx.bestCustomers?.length &&
      `Best current customers (mine the pattern): ${ctx.bestCustomers.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are a GTM strategist defining Ideal Customer Profiles (ICPs).

Propose 1-${MAX_INFERRED_ICPS} DISTINCT ICPs for this business. Each ICP is a set of criteria over the available fields below — segments that score and source differently (e.g. "SaaS scale-up" vs "regulated fintech"), not one blended profile.

BUSINESS
${business || "(no description provided — infer from the field vocabulary)"}

AVAILABLE FIELDS (map every criterion onto one of these keys + a listed operator):
${catalogReference(ctx.catalog)}

RULES
- Use ONLY the fieldKeys + operators listed above. Do not invent fields.
- value shape by operator: in → array of strings; between → { min, max } (numbers; max optional for open-ended); eq/contains → string; gt/gte/lt/lte → number; exists → boolean.
- Mark a criterion isRequired:true only for hard filters (geography, must-have firmographics). Everything else is soft with a weight 1-5 reflecting importance.
- Give the strongest "proof of spend / intent" criteria (technologies, funding, hiring) higher weight.
- priority: 0 = the segment to attack first, then 1, 2...
- Keep each ICP's criteria tight (3-7 criteria). Quality over breadth.

Return the ICPs now.`;
}
