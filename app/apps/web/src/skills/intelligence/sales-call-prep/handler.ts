import { buildProspectContext, formatContextForPrompt } from "@/lib/context/prospect-context";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { SkillRunOptions } from "@/skills/types";
import type { SalesCallPrepInput, SalesCallPrepOutput } from "./schema";
import { normalizeMoment, MOMENT_AUTO } from "@/lib/motion/moment";
import { getStepDoctrine } from "@/lib/motion/doctrine";
import { resolveMoment, hasDiscoveryTraces, momentInstructions } from "./moment-resolution";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

type DealRow = typeof deals.$inferSelect;

export async function salesCallPrepHandler(
  input: SalesCallPrepInput,
  options: SkillRunOptions,
): Promise<SalesCallPrepOutput> {
  const ctx = await buildProspectContext(input.contactId, options.tenantId);
  if (!ctx) throw new Error(`Could not build prospect context for contact ${input.contactId}`);

  // Load the deal (for moment override, discovery traces, and deal context).
  let deal: DealRow | null = null;
  if (input.dealId) {
    const [row] = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, options.tenantId)));
    deal = row ?? null;
  }

  const props = (deal?.properties ?? {}) as Record<string, unknown>;

  // A conversational correction ("this is a demo") persists as the deal's
  // override — the only write, and the only correction surface (no UI control).
  const hinted = input.momentHint ? normalizeMoment(input.momentHint) : null;
  if (input.dealId && deal && hinted) {
    if (hinted === MOMENT_AUTO) {
      const next = { ...props };
      delete next.momentOverride;
      await db
        .update(deals)
        .set({ properties: next, updatedAt: new Date() })
        .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, options.tenantId)));
    } else {
      await db
        .update(deals)
        .set({ properties: { ...props, momentOverride: hinted }, updatedAt: new Date() })
        .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, options.tenantId)));
    }
  }

  const moment = resolveMoment({
    inputMoment: input.moment,
    momentHint: input.momentHint,
    callType: input.callType,
    dealOverride: typeof props.momentOverride === "string" ? props.momentOverride : null,
    hasDeal: !!deal,
    dealStage: deal?.stage ?? null,
  });

  // No discovery, no demo — a deterministic refuse (not an LLM guess).
  if (moment === "demo" && !hasDiscoveryTraces(deal)) {
    return {
      contactId: input.contactId,
      contactName: ctx.contact.fullName,
      companyName: ctx.company?.name ?? null,
      callType: input.callType,
      moment,
      prep: {
        executiveSummary: "No discovery has been captured for this deal yet.",
        personInsights: [],
        companyInsights: [],
        competitiveLandscape: "",
        callStrategy:
          "No discovery, no demo. Run a discovery call first to map and quantify the pain; then the demo can prove the gap closes. A demo on an unmapped deal is a feature lottery.",
        openingHook: "",
        discoveryQuestions: [],
        valuePropositions: [],
        objectionHandlers: [],
        closingMove: "Schedule the discovery call before the demo.",
        blocked: "No discovery captured — run discovery first.",
      },
    };
  }

  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const contextBlock = formatContextForPrompt(ctx);
  const dealContext = deal
    ? `\n## Deal Context\n- Name: ${deal.name}\n- Stage: ${deal.stage}\n- Value: ${deal.value ? `$${deal.value}` : "unset"}\n- Expected close: ${deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toISOString().split("T")[0] : "unset"}\n- Competitors: ${Array.isArray(props.competitors) && props.competitors.length ? (props.competitors as string[]).join(", ") : "none captured"}\n- Summary: ${deal.summary || "none"}`
    : "";

  const { rubric } = getStepDoctrine(moment);
  const doctrineBlock = rubric
    ? `\n## Method doctrine for this moment (apply these rules to THIS prospect; do not restate them)\n${rubric}\n`
    : "";

  const result = await tracedGenerateObject({
    model,
    schema: z.object({
      executiveSummary: z.string(),
      personInsights: z.array(z.string()),
      companyInsights: z.array(z.string()),
      competitiveLandscape: z.string(),
      callStrategy: z.string(),
      openingHook: z.string(),
      discoveryQuestions: z.array(z.string()),
      valuePropositions: z.array(z.string()),
      objectionHandlers: z.array(
        z.object({ objection: z.string(), response: z.string() }),
      ),
      closingMove: z.string(),
      blocked: z.string().optional(),
    }),
    prompt: `You are preparing a founder for a ${moment.replace("_", " ")} call. Be specific and tactical.

## Prospect Context
${contextBlock}${dealContext}
${doctrineBlock}
## What to produce for this moment
${momentInstructions(moment)}

## Output fields
1. executiveSummary (2-3 sentences: who this is and why they matter now)
2. personInsights (3-5 specific facts about this person, never generic)
3. companyInsights (3-5 specific facts about their company)
4. competitiveLandscape (who else they may be evaluating)
5. callStrategy (per the moment instructions above)
6. openingHook (a personalized opener that shows real homework)
7. discoveryQuestions (per the moment instructions above)
8. valuePropositions (per the moment instructions above)
9. objectionHandlers (3-4 likely objections for this moment, with ready responses)
10. closingMove (the specific next step to propose)

Hard rules:
- Everything must be grounded in the ACTUAL data above. NEVER invent a prospect fact; if something is unknown, write "unknown".
- Do not restate the doctrine; apply it to this specific prospect.`,
    _trace: {
      agentId: "skill-sales-call-prep",
      tenantId: options.tenantId,
    },
  });

  return {
    contactId: input.contactId,
    contactName: ctx.contact.fullName,
    companyName: ctx.company?.name ?? null,
    callType: input.callType,
    moment,
    prep: result.object,
  };
}
