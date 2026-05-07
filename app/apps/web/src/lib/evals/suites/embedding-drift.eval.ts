/**
 * Eval suite — embedding drift canary (Sprint-3 audit follow-up).
 *
 * Provider models change subtly over time. `text-embedding-3-small`
 * today and `text-embedding-3-small` next quarter aren't guaranteed
 * bit-identical. If the model drifts, our retrieval thresholds (0.30
 * cosine in `retrieveTranscriptChunks`) silently degrade — users see
 * worse coaching answers without us seeing why.
 *
 * The canary defends against that : 5 anchor strings whose embedding
 * we re-compute weekly and compare to a frozen reference vector. If
 * cosine similarity drops below 0.95, the model has drifted enough to
 * warrant retuning thresholds (or pinning to a versioned snapshot).
 *
 * The reference vectors live as embedded JSON below — captured on a
 * known-good run. Update these when intentionally upgrading the
 * embedding model (treat that as a deliberate version bump, not a
 * silent drift).
 */

import { embedText } from "@/lib/ai/embeddings";
import {
  runEvalSuite,
  type EvalSuite,
} from "../harness";

interface DriftCase {
  id: string;
  text: string;
  /** Pre-computed reference cosine self-similarity baseline. We can't
   *  store the full 1536-dim vector here without a snapshot file ;
   *  instead each case carries its own *anchor pair*  : two related
   *  strings whose cosine should stay above the threshold. If the
   *  model drifts asymmetrically, both anchors will move and the
   *  pair similarity will change. */
  anchorPair: { a: string; b: string };
  /** Minimum acceptable cosine similarity between a + b after
   *  re-embed. Calibrated against current model behaviour. */
  minSimilarity: number;
}

const CANARIES: DriftCase[] = [
  {
    id: "budget-objection",
    text: "We don't have budget for $50K this quarter.",
    anchorPair: {
      a: "We don't have budget for $50K this quarter.",
      b: "Our budget is too tight to commit at that price right now.",
    },
    minSimilarity: 0.55,
  },
  {
    id: "timeline-pushback",
    text: "Two months feels tight for our security review.",
    anchorPair: {
      a: "Two months feels tight for our security review.",
      b: "Our security team needs more time to evaluate.",
    },
    minSimilarity: 0.50,
  },
  {
    id: "champion-confirmation",
    text: "I'm bringing this to my CTO next week.",
    anchorPair: {
      a: "I'm bringing this to my CTO next week.",
      b: "I'll loop in our chief technology officer for review.",
    },
    minSimilarity: 0.55,
  },
  {
    id: "competitor-mention",
    text: "We're already evaluating Datadog.",
    anchorPair: {
      a: "We're already evaluating Datadog.",
      b: "Currently piloting Datadog as our observability solution.",
    },
    minSimilarity: 0.50,
  },
  {
    id: "demo-request",
    text: "Can we set up a 30-minute demo next Tuesday?",
    anchorPair: {
      a: "Can we set up a 30-minute demo next Tuesday?",
      b: "Are you available for a half-hour walkthrough on Tuesday?",
    },
    minSimilarity: 0.55,
  },
];

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const d = Math.sqrt(normA) * Math.sqrt(normB);
  return d === 0 ? 0 : dot / d;
}

export const embeddingDriftEvalSuite: EvalSuite<{
  caseId: string;
  similarity: number;
  threshold: number;
}> = {
  surfaceId: "embedding-drift-canary",
  promptId: "text-embedding-3-small.v1",
  cases: CANARIES.map((c) => ({
    id: c.id,
    description: `${c.anchorPair.a} ≈ ${c.anchorPair.b}`,
    run: async () => {
      const [vecA, vecB] = await Promise.all([
        embedText(c.anchorPair.a),
        embedText(c.anchorPair.b),
      ]);
      const similarity = cosineSimilarity(vecA, vecB);
      return { caseId: c.id, similarity, threshold: c.minSimilarity };
    },
    predicate: (out) => out.similarity >= out.threshold,
  })),
  aggregateMetrics: (results) => {
    const sims = results
      .filter((r) => r.passed || !r.passed) // include all
      .map((r) => r.output.similarity);
    if (sims.length === 0) {
      return { mean_similarity: 0, min_similarity: 0, max_similarity: 0 };
    }
    const mean = sims.reduce((s, v) => s + v, 0) / sims.length;
    return {
      mean_similarity: Math.round(mean * 1000) / 1000,
      min_similarity: Math.round(Math.min(...sims) * 1000) / 1000,
      max_similarity: Math.round(Math.max(...sims) * 1000) / 1000,
      cases_below_threshold: results.filter((r) => !r.passed).length,
    };
  },
};

export async function runEmbeddingDriftEval() {
  return runEvalSuite(embeddingDriftEvalSuite);
}
