import { db } from "@/db";
import { deals, companies, contacts, activities } from "@/db/schema";
import { eq, and, sql, gte, desc } from "drizzle-orm";
import { predictDealVelocity } from "@/lib/deal-velocity";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { SkillRunOptions } from "@/skills/types";
import type { SalesCoachingInput, SalesCoachingOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function salesCoachingHandler(
  input: SalesCoachingInput,
  options: SkillRunOptions,
): Promise<SalesCoachingOutput> {
  // Fetch deal
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, options.tenantId)));

  if (!deal) throw new Error(`Deal ${input.dealId} not found`);

  // Fetch company
  let companyName: string | null = null;
  if (deal.companyId) {
    const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, deal.companyId));
    companyName = company?.name ?? null;
  }

  // Get velocity prediction
  const velocity = await predictDealVelocity(input.dealId, options.tenantId);

  // Get recent activities with raw content — the coach needs specific
  // quotes, not just activity-type histograms, to call out real moments.
  const recentActivities = await db
    .select()
    .from(activities)
    .where(and(
      eq(activities.tenantId, options.tenantId),
      eq(activities.entityId, input.dealId),
      eq(activities.entityType, "deal"),
    ))
    .orderBy(desc(activities.occurredAt))
    .limit(20);

  // Build a richer transcript so the LLM can cite specific lines.
  // Truncate per-entry so 20 activities fit inside the prompt budget
  // without blowing past context — meetings are the most valuable
  // source (full summaries), emails second, everything else a one-liner.
  const activityTranscript = recentActivities.map((a) => {
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    const header = `[${a.occurredAt?.toISOString?.() ?? a.occurredAt}] ${a.activityType} (${a.channel}, ${a.direction}) — sentiment: ${a.sentiment ?? "unknown"}`;
    // Meeting activities come in several variants (meeting_scheduled /
    // meeting_completed / meeting_cancelled). For coaching we care about
    // the ones that carry a summary / transcript — completed + scheduled
    // count; cancelled has no content to cite.
    const isMeeting = a.activityType === "meeting_completed" || a.activityType === "meeting_scheduled";
    if (isMeeting) {
      const summary = (meta.summary as string) ?? a.rawContent ?? "";
      const keyPoints = Array.isArray(meta.keyPoints) ? (meta.keyPoints as string[]) : [];
      const buyingSignals = (meta.buyingSignals ?? {}) as Record<string, unknown>;
      const lines: string[] = [];
      if (summary) lines.push(`  summary: ${String(summary).slice(0, 400)}`);
      if (keyPoints.length) lines.push(`  keyPoints: ${keyPoints.slice(0, 6).join(" | ")}`);
      if (buyingSignals.painPoints) lines.push(`  painPoints: ${JSON.stringify(buyingSignals.painPoints).slice(0, 200)}`);
      if (buyingSignals.objections) lines.push(`  objections: ${JSON.stringify(buyingSignals.objections).slice(0, 200)}`);
      if (buyingSignals.nextSteps) lines.push(`  nextSteps: ${JSON.stringify(buyingSignals.nextSteps).slice(0, 200)}`);
      return [header, ...lines].join("\n");
    }
    if (a.activityType === "email_sent" || a.activityType === "email_replied") {
      const subject = (meta.subject as string) ?? "";
      const snippet = (meta.snippet as string) ?? a.rawContent ?? "";
      return `${header}\n  subject: ${subject}\n  body: ${String(snippet).slice(0, 300)}`;
    }
    const note = a.rawContent ?? (meta.note as string) ?? "";
    return note ? `${header}\n  ${String(note).slice(0, 200)}` : header;
  }).join("\n\n");

  // LLM coaching
  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const result = await tracedGenerateObject({
    model,
    schema: z.object({
      dealHealthScore: z.number(),
      diagnosisHeading: z.string(),
      evidenceQuotes: z.array(z.object({
        quote: z.string(),
        context: z.string(),
        sourceType: z.enum(["email", "meeting", "note", "activity"]),
      })),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      nextSteps: z.array(z.string()),
      stageAdviceToAdvance: z.string(),
      objectionsToAnticipate: z.array(z.string()),
    }),
    prompt: `You are a tough, senior CRO coaching a founder on a live deal.
Talk like Sam Blond at Brex: direct, confrontational where warranted,
grounded in specific moments from the transcript. No generic advice.
No polite hedging. If something went wrong, name it.

## Deal
- Name: ${deal.name}
- Stage: ${deal.stage}
- Value: ${deal.value ? `$${deal.value}` : "unset"}
- Company: ${companyName || "unknown"}
- Days in current stage: ${velocity.daysInCurrentStage}
- Activity trend: ${velocity.activityTrend}
- Sentiment trend: ${velocity.sentimentTrend}
- Risk: ${velocity.risk}
- Summary: ${deal.summary || "none"}

## Activity transcript (${recentActivities.length} entries, most recent first)
${activityTranscript || "No activities recorded yet."}

## How to respond

1. **diagnosisHeading** — ONE short punchy sentence naming the core problem
   or opportunity, in the voice of a tough sales leader.
   Examples of the tone we want:
     "You Lost Control — This Demo Was About You, Not Their Pain"
     "Time Is Killing This Deal — Book The Next Step Today"
     "They're Ghosting Because You Never Confirmed A Champion"
   If the deal is genuinely healthy, return an empty string.
2. **evidenceQuotes** — 2-4 specific quotes or moments from the transcript
   that ground the diagnosis. Each must include: the verbatim quote or
   paraphrase, one line of context (date/source), and sourceType.
   Never invent quotes. If nothing in the transcript supports a claim,
   don't make the claim.
3. **dealHealthScore** 0-100. Calibrate: 85+ = on track, 60-84 = slowing,
   40-59 = stalled, <40 = at risk.
4. **strengths** — 2-4 specific things going well with evidence.
5. **weaknesses** — 2-4 specific things going wrong with evidence.
   Prefer concrete misses ("no next step confirmed in the Feb 11 call")
   over generic ("engagement is low").
6. **nextSteps** — 3-5 actions. Each starts with a verb. Each has a
   specific owner or time-window. Order by highest-leverage first.
7. **stageAdviceToAdvance** — one paragraph on how to move from
   ${deal.stage} to the next stage given this transcript.
8. **objectionsToAnticipate** — 2-3 objections the rep should preempt
   next touch, derived from painPoints/objections in the transcript
   when available.

Cite specifics. Name dates. Name people. Never generic.`,
    _trace: {
      agentId: "skill-sales-coaching",
      tenantId: options.tenantId,
    },
  });

  return {
    dealId: input.dealId,
    dealName: deal.name,
    stage: deal.stage ?? "unknown",
    value: deal.value ? Number(deal.value) : null,
    companyName,
    coaching: {
      dealHealthScore: result.object.dealHealthScore,
      risk: velocity.risk as "on_track" | "slowing" | "stalled" | "at_risk",
      diagnosisHeading: result.object.diagnosisHeading,
      evidenceQuotes: result.object.evidenceQuotes,
      strengths: result.object.strengths,
      weaknesses: result.object.weaknesses,
      nextSteps: result.object.nextSteps,
      stageAdviceToAdvance: result.object.stageAdviceToAdvance,
      objectionsToAnticipate: result.object.objectionsToAnticipate,
    },
  };
}
