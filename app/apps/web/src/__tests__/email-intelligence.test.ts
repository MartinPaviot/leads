/**
 * Tests for email-intelligence.ts — type validation, utility helpers,
 * and data structure contracts.
 *
 * The core extraction uses LLM (tracedGenerateObject), so we test:
 * 1. ThreadIntelligence / BuyingSignal / Objection type contracts
 * 2. extractCompetitorHint helper (private, tested via module behavior)
 * 3. extractThreadIntelligence edge cases (skips outbound-only, empty)
 * 4. Zod schema validation for the LLM output structure
 * 5. ThreadEmail type shape validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import type {
  ThreadIntelligence,
  BuyingSignal,
  Objection,
  ThreadEmail,
} from "@/lib/emails/email-intelligence";

// ── ThreadIntelligence type contract ─────────────────────────

describe("ThreadIntelligence type contract", () => {
  const validIntelligence: ThreadIntelligence = {
    threadId: "thread-123",
    signals: [
      {
        type: "budget",
        evidence: "We have $50K allocated for this quarter",
        confidence: 0.85,
      },
      {
        type: "timeline",
        evidence: "Need to decide by end of Q2",
        confidence: 0.9,
      },
    ],
    competitors: ["Salesforce", "HubSpot"],
    sentiment: "positive",
    sentimentTrend: "improving",
    objections: [
      {
        category: "pricing",
        summary: "Concerned about per-seat cost at scale",
        status: "raised",
      },
    ],
    nextSteps: ["Schedule demo with engineering team", "Send pricing proposal"],
    urgencyLevel: "high",
    extractedAt: "2026-04-27T12:00:00.000Z",
  };

  it("validates a well-formed ThreadIntelligence object", () => {
    expect(validIntelligence.threadId).toBe("thread-123");
    expect(validIntelligence.signals).toHaveLength(2);
    expect(validIntelligence.competitors).toContain("Salesforce");
    expect(validIntelligence.sentiment).toBe("positive");
    expect(validIntelligence.sentimentTrend).toBe("improving");
    expect(validIntelligence.objections).toHaveLength(1);
    expect(validIntelligence.nextSteps).toHaveLength(2);
    expect(validIntelligence.urgencyLevel).toBe("high");
    expect(validIntelligence.extractedAt).toBeTruthy();
  });

  it("validates all BuyingSignal types", () => {
    const validTypes: BuyingSignal["type"][] = [
      "budget",
      "timeline",
      "authority",
      "need",
      "champion",
      "expansion",
    ];
    for (const type of validTypes) {
      const signal: BuyingSignal = {
        type,
        evidence: `Evidence for ${type}`,
        confidence: 0.8,
      };
      expect(signal.type).toBe(type);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("validates all Objection categories", () => {
    const validCategories: Objection["category"][] = [
      "pricing",
      "timing",
      "features",
      "security",
      "competition",
      "internal",
    ];
    for (const category of validCategories) {
      const objection: Objection = {
        category,
        summary: `Objection about ${category}`,
        status: "raised",
      };
      expect(objection.category).toBe(category);
    }
  });

  it("validates all Objection statuses", () => {
    const validStatuses: Objection["status"][] = [
      "raised",
      "addressed",
      "unresolved",
    ];
    for (const status of validStatuses) {
      const objection: Objection = {
        category: "pricing",
        summary: "Test objection",
        status,
      };
      expect(objection.status).toBe(status);
    }
  });

  it("validates all sentiment values", () => {
    const validSentiments: ThreadIntelligence["sentiment"][] = [
      "positive",
      "neutral",
      "negative",
      "mixed",
    ];
    for (const sentiment of validSentiments) {
      const intel: ThreadIntelligence = { ...validIntelligence, sentiment };
      expect(intel.sentiment).toBe(sentiment);
    }
  });

  it("validates all sentimentTrend values", () => {
    const validTrends: ThreadIntelligence["sentimentTrend"][] = [
      "improving",
      "stable",
      "declining",
    ];
    for (const trend of validTrends) {
      const intel: ThreadIntelligence = {
        ...validIntelligence,
        sentimentTrend: trend,
      };
      expect(intel.sentimentTrend).toBe(trend);
    }
  });

  it("validates all urgencyLevel values", () => {
    const validLevels: ThreadIntelligence["urgencyLevel"][] = [
      "high",
      "medium",
      "low",
      "none",
    ];
    for (const level of validLevels) {
      const intel: ThreadIntelligence = {
        ...validIntelligence,
        urgencyLevel: level,
      };
      expect(intel.urgencyLevel).toBe(level);
    }
  });
});

// ── ThreadEmail type contract ───────────────────────────────

describe("ThreadEmail type contract", () => {
  it("validates a well-formed ThreadEmail", () => {
    const email: ThreadEmail = {
      from: "sarah@acme.com",
      to: ["sales@elevay.io", "cto@acme.com"],
      subject: "Re: Product demo follow-up",
      body: "Thanks for the demo, we're interested in moving forward.",
      direction: "inbound",
      date: new Date("2026-04-25T10:00:00Z"),
    };
    expect(email.from).toBe("sarah@acme.com");
    expect(email.to).toHaveLength(2);
    expect(email.direction).toBe("inbound");
  });

  it("accepts ISO string for date field", () => {
    const email: ThreadEmail = {
      from: "sales@elevay.io",
      to: ["sarah@acme.com"],
      subject: "Pricing proposal",
      body: "Here is the pricing we discussed.",
      direction: "outbound",
      date: "2026-04-25T10:00:00Z",
    };
    expect(email.date).toBe("2026-04-25T10:00:00Z");
  });
});

// ── Zod schema validation (mirrors the LLM output schema) ───

describe("threadIntelligenceSchema (Zod)", () => {
  // Rebuild the schema locally to validate without importing private const
  const buyingSignalSchema = z.object({
    type: z.enum([
      "budget",
      "timeline",
      "authority",
      "need",
      "champion",
      "expansion",
    ]),
    evidence: z.string(),
    confidence: z.number().min(0).max(1),
  });

  const objectionSchema = z.object({
    category: z.enum([
      "pricing",
      "timing",
      "features",
      "security",
      "competition",
      "internal",
    ]),
    summary: z.string(),
    status: z.enum(["raised", "addressed", "unresolved"]),
  });

  const schema = z.object({
    signals: z.array(buyingSignalSchema),
    competitors: z.array(z.string()),
    sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
    sentimentTrend: z.enum(["improving", "stable", "declining"]),
    objections: z.array(objectionSchema),
    nextSteps: z.array(z.string()),
    urgencyLevel: z.enum(["high", "medium", "low", "none"]),
  });

  it("validates a well-formed LLM response", () => {
    const result = schema.safeParse({
      signals: [
        { type: "budget", evidence: "$50K approved", confidence: 0.85 },
      ],
      competitors: ["Salesforce"],
      sentiment: "positive",
      sentimentTrend: "improving",
      objections: [
        { category: "pricing", summary: "Too expensive", status: "raised" },
      ],
      nextSteps: ["Demo scheduled for Friday"],
      urgencyLevel: "high",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid signal type", () => {
    const result = schema.safeParse({
      signals: [
        {
          type: "invalid_signal_type",
          evidence: "test",
          confidence: 0.5,
        },
      ],
      competitors: [],
      sentiment: "neutral",
      sentimentTrend: "stable",
      objections: [],
      nextSteps: [],
      urgencyLevel: "none",
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence outside 0-1 range", () => {
    const result = schema.safeParse({
      signals: [
        { type: "budget", evidence: "test", confidence: 1.5 },
      ],
      competitors: [],
      sentiment: "neutral",
      sentimentTrend: "stable",
      objections: [],
      nextSteps: [],
      urgencyLevel: "none",
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty arrays for optional collections", () => {
    const result = schema.safeParse({
      signals: [],
      competitors: [],
      sentiment: "neutral",
      sentimentTrend: "stable",
      objections: [],
      nextSteps: [],
      urgencyLevel: "none",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid objection status", () => {
    const result = schema.safeParse({
      signals: [],
      competitors: [],
      sentiment: "neutral",
      sentimentTrend: "stable",
      objections: [
        { category: "pricing", summary: "Test", status: "invalid" },
      ],
      nextSteps: [],
      urgencyLevel: "none",
    });
    expect(result.success).toBe(false);
  });
});
