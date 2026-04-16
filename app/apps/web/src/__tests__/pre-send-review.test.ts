/**
 * Tests for coaching/pre-send-review.ts — schema validation.
 */

import { describe, it, expect } from "vitest";
// Import schema directly via inline definition to avoid transitive
// AI SDK import from the full module (pre-send-review.ts imports
// tracedGenerateObject → ai SDK which has broken package resolution).
import { z } from "zod";

const coachingScoreSchema = z.object({
  dimensions: z.object({
    tone: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
      suggestion: z.string().optional(),
    }),
    completeness: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
      missingItems: z.array(z.string()),
    }),
    objectionHandling: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
      unaddressedObjections: z.array(z.string()),
    }),
    nextStep: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
    }),
    processAdherence: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
      skippedSteps: z.array(z.string()),
    }),
  }),
  overallScore: z.number().min(0).max(1),
  verdict: z.enum(["send", "review", "revise"]),
  topSuggestion: z.string().optional(),
});

describe("coachingScoreSchema", () => {
  const validScore = {
    dimensions: {
      tone: { score: 0.8, feedback: "Appropriate professional tone.", suggestion: "Consider being more direct." },
      completeness: { score: 0.7, feedback: "Covers most items.", missingItems: ["Pricing follow-up"] },
      objectionHandling: { score: 0.6, feedback: "Partially addresses concerns.", unaddressedObjections: ["Timeline concern"] },
      nextStep: { score: 0.9, feedback: "Clear call to action." },
      processAdherence: { score: 0.8, feedback: "Follows methodology.", skippedSteps: [] },
    },
    overallScore: 0.76,
    verdict: "send" as const,
    topSuggestion: "Address the timeline concern raised in the last meeting.",
  };

  it("validates a well-formed coaching score", () => {
    expect(coachingScoreSchema.safeParse(validScore).success).toBe(true);
  });

  it("validates all verdict values", () => {
    for (const verdict of ["send", "review", "revise"]) {
      const score = { ...validScore, verdict };
      expect(coachingScoreSchema.safeParse(score).success).toBe(true);
    }
  });

  it("rejects invalid verdict", () => {
    const score = { ...validScore, verdict: "hold" };
    expect(coachingScoreSchema.safeParse(score).success).toBe(false);
  });

  it("rejects scores outside 0-1 range", () => {
    const score = {
      ...validScore,
      dimensions: {
        ...validScore.dimensions,
        tone: { score: 1.5, feedback: "Over range" },
      },
    };
    expect(coachingScoreSchema.safeParse(score).success).toBe(false);
  });

  it("rejects negative scores", () => {
    const score = { ...validScore, overallScore: -0.1 };
    expect(coachingScoreSchema.safeParse(score).success).toBe(false);
  });

  it("accepts optional topSuggestion", () => {
    const score = { ...validScore, topSuggestion: undefined };
    expect(coachingScoreSchema.safeParse(score).success).toBe(true);
  });

  it("accepts empty arrays for missing items and skipped steps", () => {
    const score = {
      ...validScore,
      dimensions: {
        ...validScore.dimensions,
        completeness: { score: 1.0, feedback: "All covered.", missingItems: [] },
        objectionHandling: { score: 1.0, feedback: "All handled.", unaddressedObjections: [] },
        processAdherence: { score: 1.0, feedback: "Perfect.", skippedSteps: [] },
      },
    };
    expect(coachingScoreSchema.safeParse(score).success).toBe(true);
  });

  it("accepts score of exactly 0 and 1", () => {
    const score = {
      ...validScore,
      overallScore: 0,
      dimensions: {
        ...validScore.dimensions,
        tone: { score: 0, feedback: "Terrible tone." },
        nextStep: { score: 1, feedback: "Perfect CTA." },
      },
    };
    expect(coachingScoreSchema.safeParse(score).success).toBe(true);
  });
});
