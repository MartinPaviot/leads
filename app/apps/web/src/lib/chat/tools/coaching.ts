import { db } from "@/db";
import { coachingInsights, aePerformanceSnapshots } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { searchActivityBodies } from "@/lib/search/activity-search";
import { detectTrends } from "@/lib/coaching/performance-aggregator";
import {
  retrieveTranscriptChunks,
  formatChunksForPrompt,
} from "@/lib/coaching/retrieve-transcript-chunks";
import { extractSpeakerHint } from "@/lib/coaching/speaker-bias";

export function buildCoachingTools(ctx: ToolContext) {
  const { tenantId, userId } = ctx;

  return {
    getCoachingInsights: makeTool({
      description: `Get recent coaching insights for the current user. Shows pre-send email reviews, post-interaction feedback, deal coaching, and process adherence tips. Use when user asks "coaching tips", "how am I doing?", "what should I improve?", "review my performance", "any feedback?".`,
      inputSchema: z.object({
        limit: z.number().optional().describe("Max insights to return (default 10)"),
        entityType: z
          .enum(["deal", "email", "meeting", "call"])
          .optional()
          .describe("Filter by entity type"),
        insightType: z
          .enum(["pre_send", "post_interaction", "deal_risk", "process_gap"])
          .optional()
          .describe("Filter by insight type"),
      }),
      execute: async (input) => {
        const conditions = [
          eq(coachingInsights.tenantId, tenantId),
          eq(coachingInsights.userId, userId),
        ];
        if (input.entityType) {
          conditions.push(eq(coachingInsights.entityType, input.entityType));
        }
        if (input.insightType) {
          conditions.push(eq(coachingInsights.insightType, input.insightType));
        }

        const insights = await db
          .select()
          .from(coachingInsights)
          .where(and(...conditions))
          .orderBy(desc(coachingInsights.createdAt))
          .limit(input.limit ?? 10);

        if (insights.length === 0) {
          return {
            message: "No coaching insights yet. They'll appear as you send emails and complete meetings.",
            insights: [],
          };
        }

        const avgScore =
          insights.reduce((sum, i) => sum + (i.score ?? 0), 0) / insights.length;

        return {
          count: insights.length,
          averageScore: Math.round(avgScore * 100) / 100,
          insights: insights.map((i) => ({
            id: i.id,
            type: i.insightType,
            category: i.category,
            score: i.score,
            summary: i.summary,
            detail: i.detail,
            suggestion: i.suggestion,
            date: i.createdAt.toISOString().split("T")[0],
            acknowledged: i.acknowledged,
          })),
        };
      },
    }),

    getMyPerformance: makeTool({
      description: `Get the user's performance metrics and trends over time. Shows email/meeting/deal counts, coaching scores, win rate, and improvement trends. Use when user asks "my performance", "my stats", "how am I trending?", "performance review", "my metrics".`,
      inputSchema: z.object({
        periods: z.number().optional().describe("Number of weekly periods to show (default 4)"),
      }),
      execute: async (input) => {
        const snapshots = await db
          .select()
          .from(aePerformanceSnapshots)
          .where(
            and(
              eq(aePerformanceSnapshots.tenantId, tenantId),
              eq(aePerformanceSnapshots.userId, userId),
            ),
          )
          .orderBy(desc(aePerformanceSnapshots.periodEnd))
          .limit(input.periods ?? 4);

        if (snapshots.length === 0) {
          return {
            message:
              "No performance data yet. Weekly snapshots are generated every Monday — you'll see metrics after your first full week.",
            snapshots: [],
            trends: [],
          };
        }

        const trends = await detectTrends(tenantId, userId);

        return {
          latestPeriod: {
            start: snapshots[0].periodStart.toISOString().split("T")[0],
            end: snapshots[0].periodEnd.toISOString().split("T")[0],
            emailsSent: snapshots[0].emailsSent,
            emailsReplied: snapshots[0].emailsReplied,
            meetingsCompleted: snapshots[0].meetingsCompleted,
            dealsWon: snapshots[0].dealsWon,
            dealsLost: snapshots[0].dealsLost,
            overallScore: snapshots[0].overallScore,
            winRate: snapshots[0].winRate,
          },
          trends: trends.map((t) => ({
            metric: t.metric,
            direction: t.direction,
            change: `${t.changePercent > 0 ? "+" : ""}${t.changePercent}%`,
          })),
          history: snapshots.map((s) => ({
            period: `${s.periodStart.toISOString().split("T")[0]} → ${s.periodEnd.toISOString().split("T")[0]}`,
            emailsSent: s.emailsSent,
            meetingsCompleted: s.meetingsCompleted,
            dealsWon: s.dealsWon,
            overallScore: s.overallScore,
          })),
        };
      },
    }),

    searchTranscripts: makeTool({
      description: `Retrieve verbatim transcript chunks from this customer's meeting recordings via semantic search. Use this BEFORE answering any question about what was said in a call — "what did they push back on?", "did they confirm budget?", "what objection did they raise?", "summarise their needs", "what's the timeline they mentioned?". The output includes timestamp markers like [12:34] that the user interface turns into clickable chips that seek the recording. ALWAYS quote verbatim with the [mm:ss] marker — never paraphrase a transcript.`,
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "The natural-language question to retrieve transcript context for",
          ),
        meetingIds: z
          .array(z.string())
          .optional()
          .describe(
            "Restrict to specific meetings (use when scope is a single deal)",
          ),
        k: z
          .number()
          .optional()
          .describe("Top-k chunks to retrieve (default 8)"),
      }),
      execute: async (input) => {
        // P0-4 follow-up — speaker-aware retrieval. When the question
        // names a speaker ("What did Sarah push back on?"), bias the
        // ranking toward chunks whose speaker matches. Detection is
        // pure heuristic ; null hint passes through unchanged.
        const speakerHint = extractSpeakerHint(input.query);
        const chunks = await retrieveTranscriptChunks(
          input.query,
          tenantId,
          {
            meetingIds: input.meetingIds,
            k: input.k ?? 8,
            speakerHint,
          },
        );
        if (chunks.length === 0) {
          return {
            count: 0,
            speakerHint: speakerHint?.name ?? null,
            message:
              "No relevant transcript chunks found. Answer the user honestly: 'I don't have evidence in the transcript for this.' Do NOT fall back to general knowledge.",
            chunks: [],
          };
        }
        return {
          count: chunks.length,
          /** Surfaced for traceability — when present, the LLM knows
           *  the retrieval was biased toward this speaker, so a
           *  refusal that says "Sarah didn't talk about X" reads as
           *  intentional rather than a generic miss. */
          speakerHint: speakerHint?.name ?? null,
          // Pre-formatted block — paste this directly into your
          // answer's quoted-evidence section. The `[mm:ss]` markers
          // are load-bearing for the UI, preserve them exactly.
          formattedForCitation: formatChunksForPrompt(chunks),
          chunks: chunks.map((c) => ({
            meetingId: c.meetingId,
            speaker: c.speaker,
            timestamp: c.startSec,
            text: c.text,
            similarity: Math.round(c.similarity * 100) / 100,
          })),
        };
      },
    }),

    searchExactWords: makeTool({
      description: `Search for exact words or phrases across all interactions (emails, meeting notes, call transcripts). Returns verbatim excerpts with source attribution. Use when user asks "what did X say about Y?", "find the exact quote about pricing", "search for mentions of competitor Z", "what words did Sarah use about timeline?".`,
      inputSchema: z.object({
        query: z.string().describe("The text to search for"),
        entityType: z
          .string()
          .optional()
          .describe("Filter to contact, company, or deal"),
        entityId: z.string().optional().describe("Specific entity ID"),
        limit: z.number().optional().describe("Max results (default 10)"),
      }),
      execute: async (input) => {
        const results = await searchActivityBodies(input.query, tenantId, {
          entityType: input.entityType,
          entityId: input.entityId,
          limit: input.limit ?? 10,
        });

        if (results.length === 0) {
          return {
            message: `No interactions found matching "${input.query}".`,
            results: [],
          };
        }

        return {
          query: input.query,
          totalMatches: results.length,
          results: results.map((r) => ({
            date: r.date,
            type: `${r.channel}/${r.activityType}`,
            direction: r.direction,
            entity: r.entityName
              ? `${r.entityType}: ${r.entityName}`
              : `${r.entityType}: ${r.entityId}`,
            matchedText: r.matchedText,
            excerpt: r.excerpt,
            sentiment: r.sentiment,
          })),
        };
      },
    }),
  };
}
