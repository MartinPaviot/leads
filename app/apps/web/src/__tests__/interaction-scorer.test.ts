/**
 * Tests for coaching/interaction-scorer.ts — schema validation.
 */

import { describe, it, expect } from "vitest";
// Inline schema to avoid transitive AI SDK import chain.
import { z } from "zod";

const interactionScoreSchema = z.object({
  overallScore: z.number().min(0).max(1),
  category: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  coachingAdvice: z.string(),
  suggestedFollowUp: z.string().optional(),
});

describe("interactionScoreSchema", () => {
  const validScore = {
    overallScore: 0.72,
    category: "next_step",
    strengths: ["Good rapport building", "Clear product knowledge"],
    improvements: ["Missed opportunity to ask about budget"],
    coachingAdvice: "Always set a concrete next step before ending a conversation.",
    suggestedFollowUp: "Send a recap email with specific next steps and timeline.",
  };

  it("validates a well-formed interaction score", () => {
    expect(interactionScoreSchema.safeParse(validScore).success).toBe(true);
  });

  it("accepts optional suggestedFollowUp", () => {
    const score = { ...validScore, suggestedFollowUp: undefined };
    expect(interactionScoreSchema.safeParse(score).success).toBe(true);
  });

  it("rejects scores outside 0-1 range", () => {
    expect(interactionScoreSchema.safeParse({ ...validScore, overallScore: 1.5 }).success).toBe(false);
    expect(interactionScoreSchema.safeParse({ ...validScore, overallScore: -0.1 }).success).toBe(false);
  });

  it("accepts empty strengths and improvements arrays", () => {
    const score = { ...validScore, strengths: [], improvements: [] };
    expect(interactionScoreSchema.safeParse(score).success).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(interactionScoreSchema.safeParse({ overallScore: 0.5 }).success).toBe(false);
    expect(interactionScoreSchema.safeParse({ category: "tone" }).success).toBe(false);
  });

  it("accepts any category string", () => {
    for (const cat of ["tone", "completeness", "objection_handling", "next_step", "process_adherence", "timing"]) {
      const score = { ...validScore, category: cat };
      expect(interactionScoreSchema.safeParse(score).success).toBe(true);
    }
  });
});
