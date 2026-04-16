/**
 * Tests for deal-briefing.ts — schema validation tests.
 *
 * These test the Zod schemas and data structures without requiring
 * actual DB or LLM mocks, avoiding vi.mock hoisting complexity.
 */

import { describe, it, expect } from "vitest";
import { dealBriefSchema } from "@/lib/deal-briefing-schema";

describe("dealBriefSchema", () => {
  const validBrief = {
    dealId: "deal-1",
    dealName: "Acme Corp Deal",
    stage: "proposal",
    value: 50000,
    contactName: "Sarah Chen",
    companyName: "Acme Corp",
    daysInStage: 20,
    riskLevel: "high" as const,
    summary: "Deal stalled at proposal stage for 20 days.",
    keyDiscussions: [
      {
        date: "2026-03-26",
        topic: "Pricing proposal sent",
        source: "email" as const,
        verbatimQuote: "here is the pricing we discussed",
      },
    ],
    promisesMade: [
      { by: "them" as const, what: "Review pricing internally", when: "Friday", fulfilled: null },
    ],
    objectionsRaised: [
      { objection: "Integration complexity", status: "open" as const },
    ],
    stallReason: "Waiting for CTO buy-in on timeline.",
    nextAction: {
      action: "Send check-in referencing CTO review",
      owner: "us" as const,
      suggestedDate: "2026-04-16",
    },
    healthScore: 35,
  };

  it("validates a well-formed brief", () => {
    const result = dealBriefSchema.safeParse(validBrief);
    expect(result.success).toBe(true);
  });

  it("rejects brief missing required fields", () => {
    const result = dealBriefSchema.safeParse({
      dealId: "deal-1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null value and stallReason", () => {
    const brief = {
      ...validBrief,
      value: null,
      contactName: null,
      companyName: null,
      stallReason: null,
      riskLevel: "low",
      healthScore: 80,
    };
    const result = dealBriefSchema.safeParse(brief);
    expect(result.success).toBe(true);
  });

  it("validates all risk levels", () => {
    for (const level of ["low", "medium", "high", "critical"]) {
      const brief = { ...validBrief, riskLevel: level };
      expect(dealBriefSchema.safeParse(brief).success).toBe(true);
    }
  });

  it("rejects invalid risk level", () => {
    const brief = { ...validBrief, riskLevel: "extreme" };
    expect(dealBriefSchema.safeParse(brief).success).toBe(false);
  });

  it("validates promise with fulfilled null", () => {
    const brief = {
      ...validBrief,
      promisesMade: [
        { by: "us" as const, what: "Send spec", when: "Friday", fulfilled: false },
        { by: "them" as const, what: "Internal review", fulfilled: null },
      ],
    };
    expect(dealBriefSchema.safeParse(brief).success).toBe(true);
  });

  it("validates discussion with optional verbatim quote", () => {
    const brief = {
      ...validBrief,
      keyDiscussions: [
        { date: "2026-03-26", topic: "Pricing call", source: "meeting" as const },
        {
          date: "2026-03-28",
          topic: "Email follow-up",
          source: "email" as const,
          verbatimQuote: "We can't afford more than $40K",
        },
      ],
    };
    expect(dealBriefSchema.safeParse(brief).success).toBe(true);
  });

  it("validates objection statuses", () => {
    for (const status of ["open", "addressed", "resolved"]) {
      const brief = {
        ...validBrief,
        objectionsRaised: [
          { objection: "Test", status, ourResponse: "We addressed this." },
        ],
      };
      expect(dealBriefSchema.safeParse(brief).success).toBe(true);
    }
  });

  it("validates empty arrays for discussions, promises, objections", () => {
    const brief = {
      ...validBrief,
      keyDiscussions: [],
      promisesMade: [],
      objectionsRaised: [],
    };
    expect(dealBriefSchema.safeParse(brief).success).toBe(true);
  });

  it("validates nextAction owner enum", () => {
    for (const owner of ["us", "them"]) {
      const brief = {
        ...validBrief,
        nextAction: { action: "Follow up", owner },
      };
      expect(dealBriefSchema.safeParse(brief).success).toBe(true);
    }
  });
});
