/**
 * Automatic Win/Loss Analysis
 *
 * When a deal closes, retroactively analyzes the entire deal history
 * to understand what drove the outcome. Feeds insights back into
 * the scoring model and generates shareable post-mortems.
 *
 * Analysis dimensions:
 * - Which signals appeared before the outcome?
 * - What was the engagement velocity (time between touches)?
 * - Was a champion identified? When?
 * - Were competitors mentioned? Which ones?
 * - What objections were raised and how were they handled?
 * - How does this deal compare to similar won/lost deals?
 * - What would we do differently?
 *
 * The function:
 * 1. Loads the deal + all activities (emails, meetings, tasks, notes)
 * 2. Loads email thread intelligence (if available) for signal data
 * 3. Uses Haiku to synthesize a structured analysis
 * 4. Compares against the tenant's closed deal history for benchmarking
 * 5. Stores the analysis in deal properties for future reference
 */

import { db } from "@/db";
import {
  deals,
  activities,
  contacts,
  companies,
  signalOutcomes,
} from "@/db/schema";
import { and, eq, desc, sql, or, inArray, isNull } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { z } from "zod";

// ── Types ────────────────────────────────────────────────────

export interface WinLossAnalysis {
  dealId: string;
  outcome: "won" | "lost";
  keyFactors: Array<{
    factor: string;
    impact: "positive" | "negative" | "neutral";
    evidence: string;
  }>;
  engagementVelocity: {
    avgDaysBetweenTouches: number;
    benchmark: number;
    verdict: "faster" | "slower" | "normal";
  };
  championTimeline: {
    identified: boolean;
    when?: string;
    who?: string;
  };
  competitorPresence: {
    mentioned: boolean;
    names: string[];
    impactOnOutcome: string;
  };
  objectionHandling: Array<{
    objection: string;
    wasAddressed: boolean;
    outcome: string;
  }>;
  comparisonToSimilar: {
    similarDeals: number;
    avgOutcomeRate: number;
    thisDealsPosition: string;
  };
  lessonsLearned: string[];
  recommendedChanges: string[];
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Compute the average number of days between consecutive activities.
 * Returns Infinity when fewer than 2 activities exist (no gap to compute).
 */
function computeEngagementVelocity(
  activityDates: Date[],
): number {
  if (activityDates.length < 2) return Infinity;

  const sorted = [...activityDates].sort((a, b) => a.getTime() - b.getTime());
  let totalGapMs = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalGapMs += sorted[i].getTime() - sorted[i - 1].getTime();
  }
  const avgGapMs = totalGapMs / (sorted.length - 1);
  return Math.round(avgGapMs / (24 * 60 * 60 * 1000) * 10) / 10;
}

/**
 * Extract champion signals from deal properties and activity summaries.
 * Champion = an internal advocate who actively pushes the deal forward.
 */
function extractChampionSignals(
  dealProps: Record<string, unknown>,
  activitySummaries: Array<{ summary: string | null; occurredAt: Date | null }>,
): { identified: boolean; when?: string; who?: string } {
  // Check deal properties first (synced from email signal extraction)
  const championSignals = dealProps.championSignals as string[] | undefined;
  if (championSignals && championSignals.length > 0) {
    return {
      identified: true,
      who: championSignals[0],
      when: (dealProps.lastSignalUpdate as string) || undefined,
    };
  }

  // Scan activity summaries for champion keywords
  const championKeywords = [
    "champion",
    "advocate",
    "sponsor",
    "internal supporter",
    "pushing internally",
    "will present to",
    "getting buy-in",
    "aligned internally",
  ];
  for (const act of activitySummaries) {
    if (!act.summary) continue;
    const lower = act.summary.toLowerCase();
    if (championKeywords.some((kw) => lower.includes(kw))) {
      return {
        identified: true,
        when: act.occurredAt?.toISOString().split("T")[0],
        who: "Detected from activity: " + act.summary.slice(0, 80),
      };
    }
  }

  return { identified: false };
}

/**
 * Extract objection data from deal properties and activities.
 * Returns structured objections with handling status.
 */
function extractObjections(
  dealProps: Record<string, unknown>,
  activitySummaries: Array<{ summary: string | null; direction: string | null }>,
): Array<{ objection: string; wasAddressed: boolean; outcome: string }> {
  const objections = (dealProps.objections as string[]) || [];
  if (objections.length === 0) return [];

  // For each objection, check if there was a follow-up outbound activity
  // that addressed it (heuristic: outbound activity after the objection mention)
  return objections.map((obj) => {
    const objLower = obj.toLowerCase();
    const addressed = activitySummaries.some((a) => {
      if (a.direction !== "outbound" || !a.summary) return false;
      const sumLower = a.summary.toLowerCase();
      // Check if the outbound message references similar topic
      const topicWords = objLower.split(/\s+/).filter((w) => w.length > 4);
      return topicWords.some((w) => sumLower.includes(w));
    });

    return {
      objection: obj,
      wasAddressed: addressed,
      outcome: addressed ? "Addressed in follow-up" : "Not clearly addressed",
    };
  });
}

/**
 * Compare this deal to the tenant's historical closed deals with similar
 * attributes (same industry, similar deal size).
 */
async function benchmarkAgainstSimilar(
  tenantId: string,
  dealId: string,
  outcome: "won" | "lost",
  industry: string | null,
  dealValue: number | null,
): Promise<{
  similarDeals: number;
  avgOutcomeRate: number;
  thisDealsPosition: string;
}> {
  // Find closed deals in the same tenant
  const closedDeals = await db
    .select({
      id: deals.id,
      stage: deals.stage,
      value: deals.value,
      companyId: deals.companyId,
    })
    .from(deals)
    .where(
      and(
        eq(deals.tenantId, tenantId),
        isNull(deals.deletedAt),
        or(eq(deals.stage, "won"), eq(deals.stage, "lost")),
      ),
    );

  if (closedDeals.length <= 1) {
    return {
      similarDeals: 0,
      avgOutcomeRate: 0,
      thisDealsPosition: "Not enough historical data for comparison",
    };
  }

  // Filter to similar deals (same value bracket, +/- 50%)
  const similar = dealValue
    ? closedDeals.filter((d) => {
        if (!d.value) return true; // Include deals without value
        return d.value >= dealValue * 0.5 && d.value <= dealValue * 1.5;
      })
    : closedDeals;

  const similarExcludingSelf = similar.filter((d) => d.id !== dealId);
  const wonCount = similarExcludingSelf.filter(
    (d) => d.stage === "won",
  ).length;
  const totalSimilar = similarExcludingSelf.length;
  const avgOutcomeRate =
    totalSimilar > 0 ? Math.round((wonCount / totalSimilar) * 100) : 0;

  let position: string;
  if (outcome === "won" && avgOutcomeRate < 50) {
    position = "Won against the odds -- most similar deals were lost";
  } else if (outcome === "won" && avgOutcomeRate >= 50) {
    position = "Won in line with historical patterns";
  } else if (outcome === "lost" && avgOutcomeRate >= 50) {
    position = "Lost despite favorable historical odds";
  } else {
    position = "Lost as most similar deals did";
  }

  return {
    similarDeals: totalSimilar,
    avgOutcomeRate,
    thisDealsPosition: position,
  };
}

// ── Main Analysis Function ───────────────────────────────────

export async function analyzeWinLoss(
  dealId: string,
  tenantId: string,
): Promise<WinLossAnalysis> {
  // 1. Load the deal
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId), isNull(deals.deletedAt)))
    .limit(1);

  if (!deal) throw new Error(`Deal ${dealId} not found`);
  if (deal.stage !== "won" && deal.stage !== "lost") {
    throw new Error(`Deal ${dealId} is not closed (stage: ${deal.stage})`);
  }

  const outcome = deal.stage as "won" | "lost";
  const dealProps = (deal.properties || {}) as Record<string, unknown>;

  // 2. Load all activities for this deal (and its contact)
  const entityIds = [dealId];
  if (deal.contactId) entityIds.push(deal.contactId);

  const allActivities = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        inArray(activities.entityId, entityIds),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(200);

  // 3. Load company for industry context
  let companyIndustry: string | null = null;
  if (deal.companyId) {
    const [company] = await db
      .select({ industry: companies.industry })
      .from(companies)
      .where(eq(companies.id, deal.companyId))
      .limit(1);
    companyIndustry = company?.industry || null;
  }

  // 4. Load contact for champion identification
  let contactName: string | null = null;
  if (deal.contactId) {
    const [contact] = await db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .where(eq(contacts.id, deal.contactId))
      .limit(1);
    if (contact) {
      contactName = [contact.firstName, contact.lastName]
        .filter(Boolean)
        .join(" ");
    }
  }

  // 5. Load signal outcomes attributed to this deal
  const signals = await db
    .select({
      signalType: signalOutcomes.signalType,
      signalFiredAt: signalOutcomes.signalFiredAt,
    })
    .from(signalOutcomes)
    .where(
      and(
        eq(signalOutcomes.tenantId, tenantId),
        eq(signalOutcomes.dealId, dealId),
      ),
    );

  // 6. Compute engagement velocity
  const activityDates = allActivities
    .map((a) => a.occurredAt)
    .filter((d): d is Date => d !== null);
  const avgDaysBetweenTouches = computeEngagementVelocity(activityDates);

  // Benchmark: avg velocity of won deals in this tenant
  const [benchmarkResult] = await db
    .select({
      avgLifecycleDays: sql<number>`COALESCE(
        AVG(EXTRACT(EPOCH FROM (${deals.updatedAt} - ${deals.createdAt})) / 86400),
        30
      )`,
      avgDealCount: sql<number>`count(*)`,
    })
    .from(deals)
    .where(and(eq(deals.tenantId, tenantId), isNull(deals.deletedAt), eq(deals.stage, "won")));

  const benchmarkVelocity = Number(benchmarkResult?.avgDealCount || 0) > 0
    ? Math.round(Number(benchmarkResult?.avgLifecycleDays || 30) / Math.max(1, allActivities.length) * 10) / 10
    : 5; // Default 5 days between touches

  const velocityVerdict: "faster" | "slower" | "normal" =
    avgDaysBetweenTouches < benchmarkVelocity * 0.7
      ? "faster"
      : avgDaysBetweenTouches > benchmarkVelocity * 1.3
        ? "slower"
        : "normal";

  // 7. Extract champion info
  const championTimeline = extractChampionSignals(
    dealProps,
    allActivities.map((a) => ({
      summary: a.summary,
      occurredAt: a.occurredAt,
    })),
  );

  // 8. Extract competitor presence from deal properties
  const competitorNames = (dealProps.competitors as string[]) || [];
  const competitorPresence = {
    mentioned: competitorNames.length > 0,
    names: competitorNames,
    impactOnOutcome:
      competitorNames.length > 0
        ? outcome === "won"
          ? "Won despite competitive pressure"
          : "Competitive presence may have contributed to loss"
        : "No competitors detected",
  };

  // 9. Extract objection handling
  const objectionHandling = extractObjections(
    dealProps,
    allActivities.map((a) => ({
      summary: a.summary,
      direction: a.direction,
    })),
  );

  // 10. Compare to similar deals
  const comparisonToSimilar = await benchmarkAgainstSimilar(
    tenantId,
    dealId,
    outcome,
    companyIndustry,
    deal.value,
  );

  // 11. Build activity summary for LLM synthesis
  const activitySummary = allActivities
    .slice(0, 50) // Cap at 50 most recent for context window
    .map((a) => {
      const dateStr = a.occurredAt
        ? a.occurredAt.toISOString().split("T")[0]
        : "unknown date";
      return `[${dateStr}] ${a.activityType} (${a.direction || "n/a"}): ${a.summary || "no summary"}`;
    })
    .join("\n");

  // 12. Use Haiku to synthesize key factors and lessons
  let keyFactors: WinLossAnalysis["keyFactors"] = [];
  let lessonsLearned: string[] = [];
  let recommendedChanges: string[] = [];

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { object } = await tracedGenerateObject({
        model: anthropic("claude-haiku-4-5-20251001"),
        schema: z.object({
          keyFactors: z.array(
            z.object({
              factor: z.string().describe("A key factor that influenced the outcome"),
              impact: z.enum(["positive", "negative", "neutral"]),
              evidence: z
                .string()
                .describe("Specific evidence from the deal history"),
            }),
          ).describe("Top 3-7 factors that drove the outcome"),
          lessonsLearned: z
            .array(z.string())
            .describe("2-4 actionable lessons from this deal"),
          recommendedChanges: z
            .array(z.string())
            .describe("2-3 specific process changes to improve future outcomes"),
        }),
        prompt: `Analyze this ${outcome.toUpperCase()} deal and identify what drove the outcome.

Deal: ${deal.name}
Stage: ${deal.stage}
Value: ${deal.value ? `$${deal.value.toLocaleString()}` : "unknown"}
Industry: ${companyIndustry || "unknown"}
Contact: ${contactName || "unknown"}
Deal lifecycle: ${deal.createdAt ? Math.round((Date.now() - new Date(deal.createdAt).getTime()) / 86400000) : "unknown"} days

Signals detected: ${signals.map((s) => s.signalType).join(", ") || "none"}
Competitors mentioned: ${competitorNames.join(", ") || "none"}
Objections raised: ${(dealProps.objections as string[])?.join(", ") || "none"}
Champion identified: ${championTimeline.identified ? `Yes (${championTimeline.who})` : "No"}
Engagement velocity: ${avgDaysBetweenTouches} days between touches (benchmark: ${benchmarkVelocity})

Activity timeline (most recent first):
${activitySummary || "No activities recorded"}

Based on this deal history, identify:
1. The key factors (3-7) that drove the ${outcome} outcome, with specific evidence
2. Actionable lessons learned (2-4)
3. Recommended process changes (2-3) to win more deals like this

Be specific and reference actual events from the timeline. Do not be generic.`,
        _trace: {
          agentId: "win-loss-analysis",
          tenantId,
        },
      });

      keyFactors = object.keyFactors;
      lessonsLearned = object.lessonsLearned;
      recommendedChanges = object.recommendedChanges;
    } catch (err) {
      console.warn("Win/loss LLM synthesis failed, using heuristic fallback:", err);
      // Heuristic fallback when LLM unavailable
      keyFactors = buildHeuristicFactors(
        outcome,
        avgDaysBetweenTouches,
        benchmarkVelocity,
        championTimeline.identified,
        competitorNames.length > 0,
        objectionHandling,
        allActivities.length,
      );
      lessonsLearned = buildHeuristicLessons(outcome, keyFactors);
      recommendedChanges = buildHeuristicRecommendations(outcome, keyFactors);
    }
  } else {
    // No LLM available -- pure heuristic analysis
    keyFactors = buildHeuristicFactors(
      outcome,
      avgDaysBetweenTouches,
      benchmarkVelocity,
      championTimeline.identified,
      competitorNames.length > 0,
      objectionHandling,
      allActivities.length,
    );
    lessonsLearned = buildHeuristicLessons(outcome, keyFactors);
    recommendedChanges = buildHeuristicRecommendations(outcome, keyFactors);
  }

  // 13. Build the final analysis
  const analysis: WinLossAnalysis = {
    dealId,
    outcome,
    keyFactors,
    engagementVelocity: {
      avgDaysBetweenTouches: Number.isFinite(avgDaysBetweenTouches)
        ? avgDaysBetweenTouches
        : -1,
      benchmark: benchmarkVelocity,
      verdict: velocityVerdict,
    },
    championTimeline,
    competitorPresence,
    objectionHandling,
    comparisonToSimilar,
    lessonsLearned,
    recommendedChanges,
  };

  // 14. Store the analysis in deal properties
  await db
    .update(deals)
    .set({
      properties: {
        ...dealProps,
        winLossAnalysis: analysis,
        winLossAnalyzedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId));

  return analysis;
}

// ── Heuristic Fallbacks (no LLM needed) ──────────────────────

function buildHeuristicFactors(
  outcome: "won" | "lost",
  velocity: number,
  benchmark: number,
  hasChampion: boolean,
  hasCompetitor: boolean,
  objections: Array<{ objection: string; wasAddressed: boolean }>,
  activityCount: number,
): WinLossAnalysis["keyFactors"] {
  const factors: WinLossAnalysis["keyFactors"] = [];

  // Engagement velocity
  if (Number.isFinite(velocity)) {
    if (velocity < benchmark * 0.7) {
      factors.push({
        factor: "Fast engagement cadence",
        impact: outcome === "won" ? "positive" : "neutral",
        evidence: `${velocity} days between touches vs ${benchmark} benchmark`,
      });
    } else if (velocity > benchmark * 1.3) {
      factors.push({
        factor: "Slow engagement cadence",
        impact: outcome === "lost" ? "negative" : "neutral",
        evidence: `${velocity} days between touches vs ${benchmark} benchmark`,
      });
    }
  }

  // Champion
  if (hasChampion) {
    factors.push({
      factor: "Champion identified",
      impact: "positive",
      evidence: "An internal advocate was detected in communications",
    });
  } else if (outcome === "lost") {
    factors.push({
      factor: "No champion identified",
      impact: "negative",
      evidence: "No internal advocate was detected throughout the deal cycle",
    });
  }

  // Competition
  if (hasCompetitor) {
    factors.push({
      factor: "Competitive deal",
      impact: outcome === "lost" ? "negative" : "neutral",
      evidence: "Competitor mentions were detected in communications",
    });
  }

  // Objection handling
  const unaddressed = objections.filter((o) => !o.wasAddressed);
  if (unaddressed.length > 0 && outcome === "lost") {
    factors.push({
      factor: "Unaddressed objections",
      impact: "negative",
      evidence: `${unaddressed.length} objection(s) were not clearly addressed: ${unaddressed.map((o) => o.objection).join(", ")}`,
    });
  }

  // Activity volume
  if (activityCount < 5) {
    factors.push({
      factor: "Low activity volume",
      impact: outcome === "lost" ? "negative" : "neutral",
      evidence: `Only ${activityCount} activities recorded for this deal`,
    });
  } else if (activityCount > 20) {
    factors.push({
      factor: "High engagement volume",
      impact: outcome === "won" ? "positive" : "neutral",
      evidence: `${activityCount} activities recorded for this deal`,
    });
  }

  return factors;
}

function buildHeuristicLessons(
  outcome: "won" | "lost",
  factors: WinLossAnalysis["keyFactors"],
): string[] {
  const lessons: string[] = [];
  const negatives = factors.filter((f) => f.impact === "negative");
  const positives = factors.filter((f) => f.impact === "positive");

  if (outcome === "won") {
    if (positives.length > 0) {
      lessons.push(
        `Key winning factors: ${positives.map((p) => p.factor).join(", ")}`,
      );
    }
    lessons.push("Document and replicate the successful patterns from this deal");
  } else {
    if (negatives.length > 0) {
      lessons.push(
        `Primary loss drivers: ${negatives.map((n) => n.factor).join(", ")}`,
      );
    }
    lessons.push("Review objection handling process for similar future deals");
  }

  return lessons;
}

function buildHeuristicRecommendations(
  outcome: "won" | "lost",
  factors: WinLossAnalysis["keyFactors"],
): string[] {
  const recs: string[] = [];

  if (factors.some((f) => f.factor.includes("No champion"))) {
    recs.push("Prioritize champion identification earlier in the deal cycle");
  }
  if (factors.some((f) => f.factor.includes("Slow engagement"))) {
    recs.push("Reduce time between touches to maintain deal momentum");
  }
  if (factors.some((f) => f.factor.includes("Unaddressed objections"))) {
    recs.push(
      "Create an objection tracking checklist to ensure all concerns are addressed",
    );
  }
  if (factors.some((f) => f.factor.includes("Low activity"))) {
    recs.push("Increase touchpoint frequency for deals in this value range");
  }

  if (recs.length === 0) {
    recs.push(
      outcome === "won"
        ? "Use this deal as a template for similar future opportunities"
        : "Conduct a brief post-mortem with the team to capture additional insights",
    );
  }

  return recs;
}
