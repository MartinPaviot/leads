/**
 * P1-9 — the agentic research loop. The MODEL decides which pages to crawl
 * (following /pricing, /about, /customers from the links browsePage returns),
 * when to dig deeper, and when the dossier is complete — bounded by
 * stopWhen: stepCountIs(maxSteps). The final structured output (experimental_output)
 * is the same SynthesizedFields the deterministic synthesizer produces, so the
 * caller (buildIntelligenceBrief) persists it with zero schema change.
 *
 * Runs through tracedGenerateText, so the tenant budget gate + cost tracing apply.
 */

import { Output, stepCountIs } from "ai";
import { z } from "zod";
import { anthropic, getModelForTask } from "@/lib/ai/ai-provider";
import { tracedGenerateText } from "@/lib/ai/traced-ai";
import { buildResearchTools, newToolLedger, type BuildToolsArgs, type ToolLedger } from "./research-agent-tools";
import type { SynthesizedFields } from "./brief-synthesizer";

/** Output schema = the synthesized fields of IntelligenceBrief (types.ts). */
const briefOutputSchema = z.object({
  websiteSummary: z.string().nullable(),
  painPoints: z.array(z.string()).max(5),
  bestAngle: z.string().nullable(),
  competitorDetected: z.string().nullable(),
  communicationStyle: z
    .object({
      formality: z.enum(["formal", "casual", "mixed"]),
      preferredLength: z.enum(["short", "medium", "long"]),
      tone: z.string(),
    })
    .nullable(),
  publicContent: z.array(
    z.object({
      type: z.enum(["linkedin_post", "blog_post", "podcast", "talk", "tweet"]),
      title: z.string(),
      quote: z.string(),
      url: z.string(),
      date: z.string(),
    }),
  ),
  warmthSignals: z.array(
    z.object({
      type: z.enum(["mutual_connection", "shared_community", "alumni", "shared_investor", "past_interaction"]),
      detail: z.string(),
    }),
  ),
});

export interface RunResearchAgentArgs {
  tenantId: string;
  companyName: string;
  domain: string | null;
  contact: { firstName: string | null; lastName: string | null; title: string | null; linkedinUrl: string | null } | null;
  maxSteps?: number;
  enrichApollo?: BuildToolsArgs["enrichApollo"];
  /** Test seam — inject a model. Defaults to the Sonnet planner. */
  model?: Parameters<typeof tracedGenerateText>[0]["model"];
}

export interface RunResearchAgentResult {
  synthesized: SynthesizedFields;
  attempted: number;
  succeeded: number;
  errors: Array<{ source: string; error: string }>;
  collected: ToolLedger["collected"];
  steps: number;
}

const RESEARCH_SYSTEM = `You are a B2B research analyst building a dossier on a prospect company for sales outreach.

Use the tools to gather facts. Strategy:
- Start with fetchWebsite, then follow the most relevant internal links via browsePage (/pricing, /about, /customers, /blog) to understand what they do and who they sell to.
- Use fetchJobs (hiring = gaps/priorities), detectTechStack (legacy/competitor tools = angles), fetchNews (recent triggers).
- Stop calling tools once you have enough to fill the dossier — do NOT loop pointlessly.

Then produce the structured dossier. Rules:
- NEVER invent facts. Every field must be grounded in what the tools returned. If you didn't find something, leave it null/empty.
- bestAngle: the single best outreach angle given their CURRENT situation.
- painPoints: 1-5 inferred from jobs/tech/news, concrete not generic.
- publicContent: only citable snippets you actually saw.
- warmthSignals: only with real evidence.`;

function buildSeedPrompt(a: RunResearchAgentArgs): string {
  const parts: string[] = [`Company: ${a.companyName}`];
  if (a.domain) parts.push(`Domain: ${a.domain}`);
  if (a.contact) {
    const name = [a.contact.firstName, a.contact.lastName].filter(Boolean).join(" ");
    if (name) parts.push(`Contact: ${name}${a.contact.title ? `, ${a.contact.title}` : ""}`);
  }
  parts.push("\nResearch this company and produce the structured dossier.");
  return parts.join("\n");
}

// Step 0 = planning (Sonnet, the default model). Later steps lean on extraction,
// routed to the cheaper Haiku. Coarse heuristic — calibrate in eval (T6).
type AgentModel = Parameters<typeof tracedGenerateText>[0]["model"];

export function routeStep({ stepNumber }: { stepNumber: number }): { model?: AgentModel } {
  if (stepNumber <= 0) return {};
  const light = getModelForTask("lightweight") as unknown as AgentModel | undefined;
  return light ? { model: light } : {};
}

export async function runResearchAgent(a: RunResearchAgentArgs): Promise<RunResearchAgentResult> {
  const ledger = newToolLedger();
  const tools = buildResearchTools(
    { rootDomain: a.domain, companyName: a.companyName, enrichApollo: a.enrichApollo },
    ledger,
  );

  const result = await tracedGenerateText({
    model: a.model ?? anthropic("claude-sonnet-4-6"),
    system: RESEARCH_SYSTEM,
    messages: [{ role: "user", content: buildSeedPrompt(a) }],
    tools,
    stopWhen: stepCountIs(a.maxSteps ?? 8),
    experimental_output: Output.object({ schema: briefOutputSchema }),
    prepareStep: routeStep,
    _trace: { agentId: "research-agent-brief", tenantId: a.tenantId, inputPreview: a.companyName },
  });

  const out = (result as { experimental_output: z.infer<typeof briefOutputSchema> }).experimental_output;

  const synthesized: SynthesizedFields = {
    websiteSummary: out.websiteSummary,
    painPoints: out.painPoints,
    bestAngle: out.bestAngle,
    competitorDetected: out.competitorDetected,
    communicationStyle: out.communicationStyle,
    publicContent: out.publicContent,
    warmthSignals: out.warmthSignals,
    publicContentDepth: out.publicContent.length,
  };

  return {
    synthesized,
    attempted: ledger.attempted,
    succeeded: ledger.succeeded,
    errors: ledger.errors,
    collected: ledger.collected,
    steps: (result as { steps?: unknown[] }).steps?.length ?? 0,
  };
}
