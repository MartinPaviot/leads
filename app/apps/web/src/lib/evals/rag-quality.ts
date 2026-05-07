/**
 * RAG Quality Metrics
 *
 * Measures retrieval quality across three dimensions:
 * 1. Precision@k: what % of returned results are relevant?
 * 2. Citation accuracy: when the agent cites a source, is the source correct?
 * 3. Groundedness: does the agent's response only state things in the retrieved context?
 *
 * These metrics are computed on every traced chat request (sampled at 10%)
 * and aggregated in the agent health dashboard.
 *
 * Implementation notes:
 * - Precision@k uses a fast LLM call (Haiku) to judge relevance of each result
 * - Citation accuracy verifies each citation's sourceIndex points to a result
 *   that supports the claimed text
 * - Groundedness checks if the agent's claims are supported by the retrieved context
 * - All metrics are 0-1, where 1 is perfect quality
 */

import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { getModelForTask } from "@/lib/ai/ai-provider";
import logger from "@/lib/observability/logger";

// ── Public Types ──────────────────────────────────────────────

export interface RagMetrics {
  /** 0-1, % of top-k results that are relevant to the query */
  precisionAtK: number;
  /** 0-1, % of citations pointing to correct source */
  citationAccuracy: number;
  /** 0-1, % of claims in the response grounded in retrieved context */
  groundedness: number;
  /** Time spent on retrieval (ms) */
  retrievalLatencyMs: number;
  /** Number of results returned */
  resultCount: number;
  /** Which search mode was used */
  searchMode: "semantic" | "fulltext" | "hybrid";
}

export interface RetrievedResult {
  entityType: string;
  entityId: string;
  content: string;
  score: number;
}

export interface Citation {
  sourceIndex: number;
  claimedText: string;
}

export interface MeasureRagQualityParams {
  query: string;
  retrievedResults: RetrievedResult[];
  agentResponse: string;
  citations: Citation[];
  retrievalLatencyMs?: number;
  searchMode?: "semantic" | "fulltext" | "hybrid";
}

// ── Zod schemas for LLM judgments ─────────────────────────────

const relevanceJudgmentSchema = z.object({
  judgments: z.array(
    z.object({
      index: z.number().describe("0-based index of the result"),
      relevant: z.boolean().describe("Is this result relevant to the query?"),
      reason: z.string().describe("One-sentence explanation"),
    }),
  ),
});

const groundednessJudgmentSchema = z.object({
  claims: z.array(
    z.object({
      claim: z.string().describe("A factual claim from the response"),
      grounded: z
        .boolean()
        .describe("Is this claim supported by the retrieved context?"),
      supportingSourceIndex: z
        .number()
        .nullable()
        .describe("Index of the source that supports this claim, or null"),
    }),
  ),
  overallGroundedness: z
    .number()
    .min(0)
    .max(1)
    .describe("Overall fraction of claims that are grounded"),
});

// ── Main measurement function ─────────────────────────────────

/**
 * Measure RAG quality for a single chat request.
 *
 * Uses Haiku (fast + cheap, ~$0.001 per call) for LLM-as-judge evaluations.
 * All three dimensions are measured in parallel for speed.
 *
 * Returns null if the model is unavailable or measurement fails.
 */
export async function measureRagQuality(
  params: MeasureRagQualityParams,
): Promise<RagMetrics | null> {
  const {
    query,
    retrievedResults,
    agentResponse,
    citations,
    retrievalLatencyMs = 0,
    searchMode = "hybrid",
  } = params;

  // Skip if there's nothing to measure
  if (retrievedResults.length === 0 && citations.length === 0) {
    return {
      precisionAtK: 0,
      citationAccuracy: citations.length === 0 ? 1 : 0,
      groundedness: 0,
      retrievalLatencyMs,
      resultCount: 0,
      searchMode,
    };
  }

  const rawModel = getModelForTask("lightweight");
  if (!rawModel) {
    logger.warn("rag-quality: no lightweight model available, skipping measurement");
    return null;
  }
  // getModelForTask("lightweight") always returns a LanguageModel (not an
  // embedding model) — the union type is an artifact of the overloaded helper.
  const model = rawModel as LanguageModel;

  try {
    // Run all three measurements in parallel
    const [precisionAtK, citationAccuracy, groundedness] = await Promise.all([
      measurePrecisionAtK(model, query, retrievedResults),
      measureCitationAccuracy(model, retrievedResults, citations),
      measureGroundedness(model, query, retrievedResults, agentResponse),
    ]);

    return {
      precisionAtK,
      citationAccuracy,
      groundedness,
      retrievalLatencyMs,
      resultCount: retrievedResults.length,
      searchMode,
    };
  } catch (err) {
    logger.warn("rag-quality: measurement failed", { err });
    return null;
  }
}

// ── Precision@k ───────────────────────────────────────────────

/**
 * Precision@k: what fraction of the top-k retrieved results are actually
 * relevant to the user's query?
 *
 * Uses LLM-as-judge to classify each result as relevant or not.
 */
async function measurePrecisionAtK(
  model: LanguageModel,
  query: string,
  results: RetrievedResult[],
): Promise<number> {
  if (results.length === 0) return 0;

  // Cap at 10 results to keep cost low
  const topK = results.slice(0, 10);

  const resultsText = topK
    .map(
      (r, i) =>
        `[${i}] (${r.entityType}:${r.entityId}, score=${r.score.toFixed(3)})\n${r.content.slice(0, 500)}`,
    )
    .join("\n\n");

  try {
    const { object } = await generateObject({
      model,
      schema: relevanceJudgmentSchema,
      prompt: `You are judging whether search results are relevant to a user's query.

QUERY: "${query}"

RESULTS:
${resultsText}

For each result, judge whether it is relevant to answering the query.
A result is relevant if it contains information that would help answer the query, even partially.
A result is NOT relevant if it is about a completely different topic or entity.`,
    });

    const relevant = object.judgments.filter((j) => j.relevant).length;
    return topK.length > 0 ? relevant / topK.length : 0;
  } catch (err) {
    logger.warn("rag-quality: precision@k measurement failed", { err });
    return 0;
  }
}

// ── Citation Accuracy ─────────────────────────────────────────

/**
 * Citation accuracy: when the agent cites "[Source N]", does source N
 * actually support the claimed text?
 *
 * This is a deterministic check first (does the source index exist and
 * contain keywords from the claim?) with an LLM fallback for ambiguous cases.
 */
async function measureCitationAccuracy(
  model: LanguageModel,
  results: RetrievedResult[],
  citations: Citation[],
): Promise<number> {
  if (citations.length === 0) return 1; // No citations = nothing wrong

  let correct = 0;

  for (const citation of citations) {
    // Basic check: does the source index exist?
    if (citation.sourceIndex < 0 || citation.sourceIndex >= results.length) {
      continue; // Invalid index = incorrect citation
    }

    const source = results[citation.sourceIndex];
    if (!source) continue;

    // Fast heuristic: check if key terms from the claimed text appear in the source
    const claimTerms = citation.claimedText
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 3);
    const sourceContent = source.content.toLowerCase();
    const termOverlap =
      claimTerms.length > 0
        ? claimTerms.filter((t) => sourceContent.includes(t)).length /
          claimTerms.length
        : 0;

    if (termOverlap > 0.5) {
      // High term overlap — likely correct
      correct++;
    } else if (claimTerms.length > 0) {
      // Ambiguous — use LLM to verify
      try {
        const { object } = await generateObject({
          model,
          schema: z.object({
            supported: z
              .boolean()
              .describe(
                "Does the source content support the claimed text?",
              ),
          }),
          prompt: `Does this source support the following claim?

CLAIM: "${citation.claimedText}"

SOURCE CONTENT:
${source.content.slice(0, 800)}

Answer whether the source content contains information that supports the claim. Minor paraphrasing is acceptable.`,
        });
        if (object.supported) correct++;
      } catch {
        // If LLM fails, fall back to the heuristic result (not correct)
      }
    }
  }

  return citations.length > 0 ? correct / citations.length : 1;
}

// ── Groundedness ──────────────────────────────────────────────

/**
 * Groundedness: does the agent's response only state things that are
 * supported by the retrieved context?
 *
 * Extracts factual claims from the response and checks each one against
 * the retrieved context. Claims that are general knowledge (e.g. "emails
 * are a common communication channel") are considered grounded by default.
 */
async function measureGroundedness(
  model: LanguageModel,
  query: string,
  results: RetrievedResult[],
  agentResponse: string,
): Promise<number> {
  if (!agentResponse || agentResponse.trim().length < 20) return 1;
  if (results.length === 0) return 0;

  const contextText = results
    .map(
      (r, i) =>
        `[Source ${i}] (${r.entityType}:${r.entityId})\n${r.content.slice(0, 600)}`,
    )
    .join("\n\n");

  try {
    const { object } = await generateObject({
      model,
      schema: groundednessJudgmentSchema,
      prompt: `You are checking whether an AI assistant's response is grounded in the retrieved context.

USER QUERY: "${query}"

RETRIEVED CONTEXT:
${contextText}

ASSISTANT RESPONSE:
${agentResponse.slice(0, 1500)}

INSTRUCTIONS:
1. Extract each distinct factual claim from the assistant's response.
2. For each claim, check whether it is supported by the retrieved context.
3. Claims that are general knowledge (e.g. common definitions, widely known facts) count as grounded.
4. Claims about specific entities, numbers, dates, or names MUST be supported by the context to be grounded.
5. Conversational filler ("I can help with that", "Let me check") is not a claim and should be excluded.
6. Compute overallGroundedness as the fraction of claims that are grounded.`,
    });

    return object.overallGroundedness;
  } catch (err) {
    logger.warn("rag-quality: groundedness measurement failed", { err });
    return 0;
  }
}

// ── Sampling helper ───────────────────────────────────────────

/** RAG quality sampling rate — measure 10% of chat requests */
export const RAG_QUALITY_SAMPLE_RATE = 0.1;

/**
 * Deterministic sampling: should this request be measured?
 * Uses a simple random check.
 */
export function shouldMeasureRagQuality(): boolean {
  return Math.random() < RAG_QUALITY_SAMPLE_RATE;
}

// ── Citation extraction from response text ────────────────────

/**
 * Extract citations from the agent's response text.
 * Looks for patterns like [Source 1], [Source 2], etc. and captures
 * the surrounding claimed text.
 */
export function extractCitationsFromResponse(responseText: string): Citation[] {
  const citations: Citation[] = [];
  // Match patterns like [Source N] with surrounding context
  const pattern = /\[Source\s+(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(responseText)) !== null) {
    const sourceIndex = parseInt(match[1], 10) - 1; // Convert 1-based to 0-based
    if (sourceIndex < 0) continue;

    // Extract the sentence containing the citation
    const start = Math.max(0, responseText.lastIndexOf(".", match.index - 200) + 1);
    const end = responseText.indexOf(".", match.index + match[0].length);
    const claimedText = responseText
      .slice(start, end > match.index ? end : match.index + match[0].length + 100)
      .trim()
      .replace(/\[Source\s+\d+\]/g, "")
      .trim();

    if (claimedText.length > 5) {
      citations.push({ sourceIndex, claimedText });
    }
  }

  return citations;
}
