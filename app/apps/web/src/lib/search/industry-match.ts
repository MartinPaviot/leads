import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

/**
 * Map a free-text search to the industry labels that ACTUALLY exist in the
 * tenant's data, using an LLM that reasons over the real distinct labels each
 * time — so "medical" reaches "hospital & health care" + "medical devices",
 * "cars" reaches "automotive", "banks" reaches "banking / financial services",
 * etc.
 *
 * Deliberately NOT a hardcoded synonym map: that only ever covers the handful
 * of terms someone thought to list and breaks on the next query. Here the model
 * is given the genuine taxonomy and picks the matching labels, so it generalises
 * to any query and any dataset.
 *
 * Returns a subset of `industries` (verbatim), or [] when the query reads as a
 * company name rather than a sector, or when no model/key is available.
 */
export async function matchIndustries(
  query: string,
  industries: string[],
  tenantId: string,
): Promise<string[]> {
  const distinct = [...new Set(industries.filter(Boolean))];
  if (distinct.length === 0 || !query.trim()) return [];

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model) return [];

  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: z.object({
        industries: z
          .array(z.string())
          .describe("Exact industry labels, copied verbatim from the provided list, whose sector matches the query"),
      }),
      prompt: `A user is searching a CRM of companies for: "${query}".

These are the EXACT industry labels present in the data:
${distinct.map((i) => `- ${i}`).join("\n")}

Return the subset of these labels (verbatim, copied exactly from the list) whose SECTOR matches the user's intent, including closely related sectors. Reasoning examples: "medical"/"health" -> hospital, health-care, medical-device, wellness labels; "tech"/"software" -> IT, software, SaaS labels; "cars" -> automotive labels; "law" -> legal labels; "banks"/"finance" -> banking and financial-services labels; "schools"/"universities" -> education labels.

If the query is a specific company NAME (not a sector), return an empty array. Only output labels that appear verbatim in the list above.`,
      _trace: { agentId: "industry-match", tenantId, inputPreview: query.slice(0, 120) },
    });
    const allow = new Set(distinct);
    return (object.industries || []).filter((i) => allow.has(i));
  } catch {
    return [];
  }
}
