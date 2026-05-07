import { enrichOrganization, searchPeople } from "@/lib/integrations/apollo-client";
import { getSkillKnowledge } from "@/skills/skill-knowledge";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { SkillRunOptions } from "@/skills/types";
import type { CompetitorIntelInput, CompetitorIntelOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function competitorIntelHandler(
  input: CompetitorIntelInput,
  options: SkillRunOptions,
): Promise<CompetitorIntelOutput> {
  // Enrich via Apollo + fetch knowledge in parallel
  const [org, knowledgeBlock] = await Promise.all([
    enrichOrganization(input.competitorDomain).catch(() => null),
    getSkillKnowledge(`competitor analysis market positioning product comparison`, options.tenantId),
  ]);
  const competitorName = input.competitorName || org?.name || input.competitorDomain;

  // Find key people (C-suite + VPs)
  const keyPeople: CompetitorIntelOutput["intel"]["keyPeople"] = [];
  if (input.focusAreas.includes("team")) {
    const people = await searchPeople({
      q_organization_domains: input.competitorDomain,
      person_seniorities: ["c_suite", "vp", "founder"],
      per_page: 10,
    }).catch(() => null);

    if (people) {
      for (const p of people.people) {
        keyPeople.push({
          name: p.name || `${p.first_name} ${p.last_name}`,
          title: p.title || "Unknown",
          linkedinUrl: p.linkedin_url,
        });
      }
    }
  }

  // LLM analysis for positioning and vulnerabilities
  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const companyData = org
    ? `Name: ${org.name}\nIndustry: ${org.industry}\nDescription: ${org.description}\nEmployees: ${org.estimated_num_employees}\nRevenue: ${org.annual_revenue_printed}\nFunding: ${org.total_funding_printed} (${org.latest_funding_stage})\nTech: ${org.technology_names?.join(", ")}\nHQ: ${org.city}, ${org.country}\nKeywords: ${org.keywords?.join(", ")}`
    : `Domain: ${input.competitorDomain}`;

  const result = await tracedGenerateObject({
    model,
    schema: z.object({
      positioning: z.string(),
      strengths: z.array(z.string()),
      vulnerabilities: z.array(z.string()),
    }),
    prompt: `Analyze this competitor and provide intelligence.

## Competitor Data
${companyData}

## Key People (${keyPeople.length})
${keyPeople.map((p) => `- ${p.name} (${p.title})`).join("\n")}

## Knowledge Context
${knowledgeBlock}

Generate:
1. Positioning: How does this company position itself in the market? (2-3 sentences)
2. Strengths: 3-5 competitive strengths
3. Vulnerabilities: 3-5 weaknesses or gaps we can exploit

Be specific and analytical, not generic.`,
    _trace: {
      agentId: "skill-competitor-intel",
      tenantId: options.tenantId,
    },
  });

  return {
    competitorName,
    competitorDomain: input.competitorDomain,
    intel: {
      companyOverview: org?.description || `Company at ${input.competitorDomain}`,
      industry: org?.industry ?? null,
      employeeCount: org?.estimated_num_employees ?? null,
      revenue: org?.annual_revenue_printed ?? null,
      funding: {
        stage: org?.latest_funding_stage ?? null,
        totalFunding: org?.total_funding_printed ?? null,
      },
      techStack: org?.technology_names ?? [],
      keyPeople,
      positioning: result.object.positioning,
      strengths: result.object.strengths,
      vulnerabilities: result.object.vulnerabilities,
    },
  };
}
