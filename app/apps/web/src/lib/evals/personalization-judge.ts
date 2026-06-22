/**
 * P1-12 — semantic personalization judge. The deterministic grader scores
 * "personalization" by substring presence (email-quality-grader.ts), so fake
 * personalization ("I noticed your company…" with a generic pitch) passes. This
 * LLM-judge reads the cached research brief and decides, claim by claim, whether
 * each factual statement in the email is GROUNDED in a listed fact.
 *
 * Fail-open + CI-safe: no ANTHROPIC_API_KEY, empty brief, or any error → a
 * NEUTRAL { groundedScore: 0.5, skipped: true } so it never degrades the
 * deterministic gate. Runs only as an opt-in second stage, never in the bulk
 * generation hot path.
 */

import type { ResearchBriefContext } from "@/lib/context/prospect-context";

export interface ClaimVerdict {
  text: string;
  grounded: boolean;
  evidence: string | null;
}

export interface PersonalizationJudgeResult {
  groundedScore: number; // grounded / total factual claims, 0..1
  claims: ClaimVerdict[];
  skipped: boolean; // true → neutral, no penalty
  error?: string;
}

const NEUTRAL: PersonalizationJudgeResult = { groundedScore: 0.5, claims: [], skipped: true };

export function formatBriefFacts(brief: ResearchBriefContext): string {
  const facts: string[] = [];
  if (brief.bestAngle) facts.push(`- Angle: ${brief.bestAngle}`);
  if (brief.painPoints?.length) facts.push(`- Pain points: ${brief.painPoints.join("; ")}`);
  if (brief.competitorDetected) facts.push(`- Competitor in use: ${brief.competitorDetected}`);
  for (const p of brief.publicContent ?? []) {
    if (p.quote) facts.push(`- They said publicly: "${p.quote}"`);
  }
  for (const w of brief.warmthSignals ?? []) {
    if (w.detail) facts.push(`- Warm path: ${w.detail}`);
  }
  return facts.join("\n");
}

function JUDGE_PROMPT(factSheet: string, body: string): string {
  return `You are auditing a cold email for FAKE personalization.

VERIFIED FACTS about this prospect (the ONLY facts the email may claim):
${factSheet}

EMAIL BODY:
${body}

Extract every FACTUAL claim the email makes about the prospect or their company
(ignore greetings, generic value props, and the CTA). For each claim decide if it
is GROUNDED — a claim is grounded ONLY if one of the verified facts above supports
it. A plausible-sounding claim that is NOT in the list is NOT grounded.

Return STRICT JSON, nothing else:
{"claims":[{"text":"<claim>","grounded":true|false,"evidence":"<the fact that supports it, or null>"}]}`;
}

export function parseJudgeJson(text: string): PersonalizationJudgeResult {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return NEUTRAL;
  try {
    const parsed = JSON.parse(match[0]) as { claims?: ClaimVerdict[] };
    const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
    if (claims.length === 0) return { groundedScore: 0.5, claims: [], skipped: false };
    const grounded = claims.filter((c) => c.grounded === true).length;
    return { groundedScore: grounded / Math.max(1, claims.length), claims, skipped: false };
  } catch {
    return NEUTRAL;
  }
}

export async function judgePersonalization(
  emailBody: string,
  brief: ResearchBriefContext | undefined,
): Promise<PersonalizationJudgeResult> {
  const { briefIsEmpty } = await import("@/lib/campaign-engine/build-intelligence-brief");
  if (!brief || briefIsEmpty(brief)) return NEUTRAL;
  if (!process.env.ANTHROPIC_API_KEY) return NEUTRAL;
  try {
    const { generateText } = await import("ai");
    const { getModelForTask } = await import("@/lib/ai/ai-provider");
    const model = getModelForTask("lightweight");
    if (!model) return NEUTRAL;
    const res = await generateText({
      // getModelForTask's return type is wide (includes embedding models); for
      // "lightweight" it's a chat model — narrow for generateText's model param.
      model: model as unknown as Parameters<typeof generateText>[0]["model"],
      maxOutputTokens: 600,
      prompt: JUDGE_PROMPT(formatBriefFacts(brief), emailBody.slice(0, 2000)),
    });
    return parseJudgeJson(res.text);
  } catch (err) {
    return { ...NEUTRAL, error: err instanceof Error ? err.message : "unknown" };
  }
}
