/**
 * AI Account Summary — generates concise company intelligence from enrichment data.
 *
 * Used in two places:
 *   1. Inngest enrichment pipeline (auto-generates after enrichment)
 *   2. Manual regeneration via POST /api/accounts/[id]/generate-summary
 *
 * Uses Haiku for cost efficiency since this runs for every company.
 */

import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateText } from "@/lib/ai/traced-ai";

export interface AccountSummaryInput {
  name: string;
  domain: string | null;
  industry: string | null;
  description: string | null;
  size: string | null;
  revenue: string | null;
  properties: Record<string, unknown> | null;
}

export interface AccountSummaryResult {
  ai_account_summary: string;
  ai_how_they_make_money: string;
}

/**
 * Generate a 2-3 sentence account summary and business model description
 * from enrichment data. Returns null on failure or insufficient data.
 */
export async function generateAccountSummary(
  company: AccountSummaryInput,
  tenantId?: string,
): Promise<AccountSummaryResult | null> {
  // Skip if there's essentially no data to work with
  if (!company.name) return null;
  const hasAnyData = company.domain || company.industry || company.description;
  if (!hasAnyData) return null;

  // Use Haiku for cost efficiency — this runs for every enriched company
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model) return null;

  const props = (company.properties || {}) as Record<string, unknown>;

  // Build the input context, truncating long descriptions to avoid token waste
  const descriptionTruncated = company.description
    ? company.description.slice(0, 1500)
    : null;

  const contextParts: string[] = [
    `Name: ${company.name}`,
  ];
  if (company.domain) contextParts.push(`Domain: ${company.domain}`);
  if (company.industry) contextParts.push(`Industry: ${company.industry}`);
  if (descriptionTruncated) contextParts.push(`Description: ${descriptionTruncated}`);
  if (company.size) contextParts.push(`Size: ${company.size}`);
  if (company.revenue) contextParts.push(`Revenue: ${company.revenue}`);
  if (props.technologies && Array.isArray(props.technologies)) {
    contextParts.push(`Technologies: ${(props.technologies as string[]).join(", ")}`);
  }
  if (props.latest_funding_stage) {
    contextParts.push(`Latest Funding Stage: ${String(props.latest_funding_stage)}`);
  }
  if (props.total_funding_printed) {
    contextParts.push(`Total Funding: ${String(props.total_funding_printed)}`);
  }
  if (props.founded_year) {
    contextParts.push(`Founded: ${String(props.founded_year)}`);
  }
  if (props.city || props.country) {
    contextParts.push(`Location: ${[props.city, props.state, props.country].filter(Boolean).join(", ")}`);
  }
  if (props.keywords && Array.isArray(props.keywords)) {
    contextParts.push(`Keywords: ${(props.keywords as string[]).join(", ")}`);
  }

  try {
    const { text } = await tracedGenerateText({
      model,
      system: `You generate concise company intelligence for sales reps. Return ONLY valid JSON with exactly two fields. No markdown, no code fences.

Rules:
- Be specific and factual. Never fabricate information.
- If data is limited, work with what you have and note it is based on limited information.
- Do not use filler phrases like "leading provider" unless evidence supports it.
- No emojis.`,
      prompt: `Generate two fields for this company:

${contextParts.join("\n")}

1. account_summary: 2-3 sentences synthesizing what this company does, their market position, and why a sales rep should care. Be specific, not generic.
2. how_they_make_money: 1-2 sentences on their business model and revenue sources.

Return JSON: { "account_summary": "...", "how_they_make_money": "..." }`,
      // @ts-expect-error maxTokens exists in AI SDK but type definition may lag
      maxTokens: 400,
      _trace: { agentId: "ai-account-summary", tenantId: tenantId || "default" },
    });

    // Parse the JSON response
    const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const summary = parsed.account_summary;
    const howTheyMakeMoney = parsed.how_they_make_money;

    if (!summary || !howTheyMakeMoney) {
      return null;
    }

    return {
      ai_account_summary: String(summary),
      ai_how_they_make_money: String(howTheyMakeMoney),
    };
  } catch (error) {
    console.warn("[ai-account-summary] Generation failed:", error);
    return null;
  }
}
