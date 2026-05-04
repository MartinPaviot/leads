/**
 * LLM narrative layer for scoring reasons.
 *
 * Transforms dry rules-based reasons ("Industry match: SaaS",
 * "Size match: 150 employees") into contextual narratives
 * ("Similar profile to your best clients, recently funded,
 * your investor Founders Fund also backs them").
 *
 * Runs async after scoring — the score itself is deterministic
 * and instant; the narrative enriches the "why" for the UI.
 */

import { anthropic } from "@/lib/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { z } from "zod";

const narrativeSchema = z.object({
  bullets: z
    .array(z.string())
    .describe("2-3 short insight bullets, each under 80 chars. First-person perspective addressing the founder."),
});

export interface NarrativeInput {
  companyName: string;
  companyIndustry: string | null;
  companySize: string | null;
  companyCountry: string | null;
  fundingStage: string | null;
  totalFunding: number | null;
  fundingRecency: string | null;
  investors: string[];
  technologies: string[];
  rawReasons: string[];
  signals: Array<{ type: string; reason: string; value: boolean }>;
  tenantName: string | null;
  tenantIndustry: string | null;
  tenantInvestors: string[];
  topClientNames: string[];
}

export async function narrateScoreReasons(
  input: NarrativeInput,
  tenantId: string,
): Promise<string[]> {
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) return input.rawReasons;

  const signalContext = input.signals
    .filter((s) => s.value)
    .map((s) => `${s.type}: ${s.reason}`)
    .join("; ");

  const investorOverlap = input.tenantInvestors.length > 0
    ? input.investors.filter((inv) =>
        input.tenantInvestors.some(
          (ti) => ti.toLowerCase() === inv.toLowerCase(),
        ),
      )
    : [];

  const prompt = `You write scoring insights for a sales prospecting tool. The founder sees these bullets next to each company in their TAM.

COMPANY: ${input.companyName}
Industry: ${input.companyIndustry ?? "unknown"}
Size: ${input.companySize ?? "unknown"}
Country: ${input.companyCountry ?? "unknown"}
Funding: ${input.fundingStage ?? "none"}${input.totalFunding ? ` ($${(input.totalFunding / 1_000_000).toFixed(1)}M)` : ""}${input.fundingRecency ? ` — ${input.fundingRecency}` : ""}
Tech stack: ${input.technologies.slice(0, 5).join(", ") || "unknown"}
Investors: ${input.investors.slice(0, 3).join(", ") || "none on file"}
${signalContext ? `Active signals: ${signalContext}` : ""}

FOUNDER CONTEXT:
Company: ${input.tenantName ?? "their company"}
Industry: ${input.tenantIndustry ?? "unknown"}
Their investors: ${input.tenantInvestors.join(", ") || "not configured"}
${investorOverlap.length > 0 ? `SHARED INVESTORS: ${investorOverlap.join(", ")}` : ""}
${input.topClientNames.length > 0 ? `Best clients: ${input.topClientNames.join(", ")}` : ""}

RAW SCORE REASONS: ${input.rawReasons.join("; ")}

Write 2-3 bullets that tell the founder WHY this company matters to THEM specifically. Rules:
- Each bullet < 80 chars
- Be specific (name the investor, the funding amount, the tech)
- Never repeat what the founder already knows (they set their own ICP)
- "Similar to [client X]" when industry/size matches a known client
- "Raised $Xm [timeframe] — active budget" when recently funded
- "Your investor [Y] also backs them" when overlap exists
- Skip generic statements like "matches your ICP" or "good fit"
- If there's nothing specific to say, return the raw reasons unchanged`;

  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: narrativeSchema,
      prompt,
      _trace: {
        agentId: "score-narrative",
        tenantId,
        inputPreview: `Narrate score for ${input.companyName}`,
      },
    });

    return object.bullets.length > 0 ? object.bullets : input.rawReasons;
  } catch {
    return input.rawReasons;
  }
}
