import { enrichOrganization } from "@/lib/integrations/apollo-client";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { industriesPromptHint, companySizesPromptHint } from "@/lib/config/icp-constants";
import { getSkillKnowledge } from "@/skills/skill-knowledge";
import type { SkillRunOptions } from "@/skills/types";
import type { IcpIdentificationInput, IcpIdentificationOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-haiku-4-5-20251001");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function icpIdentificationHandler(
  input: IcpIdentificationInput,
  options: SkillRunOptions,
): Promise<IcpIdentificationOutput> {
  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  // Enrich company via Apollo + retrieve knowledge in parallel
  const [org, knowledgeBlock] = await Promise.all([
    enrichOrganization(input.companyDomain).catch(() => null),
    getSkillKnowledge("ideal customer profile target market industries company size revenue", options.tenantId),
  ]);

  const companyContext = org
    ? `Company: ${org.name}\nIndustry: ${org.industry}\nEmployees: ${org.estimated_num_employees}\nRevenue: ${org.annual_revenue_printed}\nFunding: ${org.total_funding_printed} (${org.latest_funding_stage})\nTech: ${org.technology_names?.join(", ")}\nDescription: ${org.description}\nLocation: ${org.city}, ${org.country}`
    : `Company domain: ${input.companyDomain} (no Apollo data available)`;

  const existingIcpContext = input.existingIcp
    ? `\nExisting ICP to refine:\n${JSON.stringify(input.existingIcp, null, 2)}`
    : "";

  const result = await tracedGenerateObject({
    model,
    schema: z.object({
      industries: z.array(z.string()),
      companySizes: z.array(z.string()),
      revenueMin: z.number().nullable(),
      revenueMax: z.number().nullable(),
      geographies: z.array(z.string()),
      targetRoles: z.array(z.string()),
      targetSeniorities: z.array(z.string()),
      technologies: z.array(z.string()),
      painPoints: z.array(z.string()),
      excludeIndustries: z.array(z.string()),
      reasoning: z.string(),
    }),
    prompt: `Analyze this company and define its Ideal Customer Profile (ICP).

${companyContext}
${existingIcpContext}
${knowledgeBlock}

Define the ICP — who would buy this company's product/service? Think about:
- Which industries are most likely to need this?
- What company sizes are the sweet spot?
- What roles are the decision makers vs. champions?
- What technologies indicate readiness?
- What pain points does this company solve?
- What industries should be EXCLUDED?

${industriesPromptHint()}
${companySizesPromptHint()}
Use standard seniority levels: Owner, Founder, C-Suite, VP, Director, Manager, Senior.`,
    _trace: {
      agentId: "skill-icp-identification",
      tenantId: options.tenantId,
    },
  });

  const r = result.object;

  return {
    companyDomain: input.companyDomain,
    companyName: org?.name ?? null,
    icp: {
      industries: r.industries,
      companySizes: r.companySizes,
      revenueRange: r.revenueMin !== null && r.revenueMax !== null
        ? { min: r.revenueMin, max: r.revenueMax }
        : null,
      geographies: r.geographies,
      targetRoles: r.targetRoles,
      targetSeniorities: r.targetSeniorities,
      technologies: r.technologies,
      painPoints: r.painPoints,
      excludeIndustries: r.excludeIndustries,
    },
    reasoning: r.reasoning,
  };
}
