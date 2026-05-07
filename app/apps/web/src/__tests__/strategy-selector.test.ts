import { describe, it, expect } from "vitest";
import {
  scoreWarmIntro,
  scoreTriggerBased,
  scoreSmykm,
  scoreDisplacement,
  scoreValueFirst,
  scoreSocialFirst,
  scoreMultiThread,
  scoreReEngagement,
  scoreEventTriggered,
  scoreLongGame,
  type ScoringInput,
  type Signal,
} from "../lib/campaign-engine/playbook-conditions";
import type { IntelligenceBrief, WarmPath } from "../lib/campaign-engine/types";

function makeBrief(overrides: Partial<IntelligenceBrief> = {}): IntelligenceBrief {
  return {
    id: "brief-1",
    tenantId: "t-1",
    companyId: "c-1",
    contactId: null,
    websiteSummary: "A B2B SaaS company",
    recentNews: [],
    jobPostings: [],
    techStack: [],
    linkedinActivity: null,
    publicContent: [],
    competitorDetected: null,
    communicationStyle: null,
    painPoints: [],
    bestAngle: null,
    warmthSignals: [],
    publicContentDepth: 0,
    sourcesAttempted: 4,
    sourcesSucceeded: 3,
    sourceErrors: [],
    researchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function makeInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    brief: makeBrief(),
    warmPath: null,
    signals: [],
    previousOutreach: null,
    contactsAvailable: 1,
    companyScore: 50,
    hasInboundVisit: false,
    ...overrides,
  };
}

describe("Strategy Selector - Playbook Conditions", () => {
  describe("scoreWarmIntro", () => {
    it("returns 0 when no warm path", () => {
      const result = scoreWarmIntro(makeInput());
      expect(result.score).toBe(0);
    });

    it("scores >= 90 with 1st-degree warm path", () => {
      const warmPath: WarmPath = {
        distance: 1,
        connectorNodeId: "n-1",
        connectorName: "Alice",
        connectorEmail: null,
        lastActiveAt: new Date().toISOString(),
        relationshipType: "SENT_EMAIL",
      };
      const result = scoreWarmIntro(makeInput({ warmPath }));
      expect(result.score).toBeGreaterThanOrEqual(90);
    });

    it("scores lower with 2nd-degree path", () => {
      const warmPath: WarmPath = {
        distance: 2,
        connectorNodeId: "n-2",
        connectorName: "Bob",
        connectorEmail: null,
        lastActiveAt: new Date().toISOString(),
        relationshipType: "WORKS_AT",
      };
      const result = scoreWarmIntro(makeInput({ warmPath }));
      expect(result.score).toBeGreaterThanOrEqual(85);
      expect(result.score).toBeLessThan(95);
    });

    it("penalizes inactive connector", () => {
      const warmPath: WarmPath = {
        distance: 1,
        connectorNodeId: "n-1",
        connectorName: "Charlie",
        connectorEmail: null,
        lastActiveAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
        relationshipType: "SENT_EMAIL",
      };
      const result = scoreWarmIntro(makeInput({ warmPath }));
      expect(result.score).toBeLessThan(90);
    });

    it("returns 0 for distance > 2", () => {
      const warmPath: WarmPath = {
        distance: 3,
        connectorNodeId: "n-3",
        connectorName: "Eve",
        connectorEmail: null,
        lastActiveAt: null,
        relationshipType: "KNOWS",
      };
      const result = scoreWarmIntro(makeInput({ warmPath }));
      expect(result.score).toBe(0);
    });
  });

  describe("scoreTriggerBased", () => {
    it("returns 0 with no fresh signals", () => {
      const result = scoreTriggerBased(makeInput());
      expect(result.score).toBe(0);
    });

    it("scores >= 85 with a fresh high-confidence signal", () => {
      const signals: Signal[] = [
        { type: "funding_recent", confidence: "high", detectedAt: new Date().toISOString(), isNew: true },
      ];
      const result = scoreTriggerBased(makeInput({ signals }));
      expect(result.score).toBeGreaterThanOrEqual(85);
    });

    it("adds stacking bonus for multiple signals", () => {
      const signals: Signal[] = [
        { type: "funding_recent", confidence: "high", detectedAt: new Date().toISOString(), isNew: true },
        { type: "hiring_intent", confidence: "high", detectedAt: new Date().toISOString(), isNew: true },
      ];
      const single = scoreTriggerBased(makeInput({ signals: [signals[0]] }));
      const double = scoreTriggerBased(makeInput({ signals }));
      expect(double.score).toBeGreaterThan(single.score);
    });

    it("ignores old signals", () => {
      const signals: Signal[] = [
        { type: "funding_recent", confidence: "high", detectedAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), isNew: false },
      ];
      const result = scoreTriggerBased(makeInput({ signals }));
      expect(result.score).toBe(0);
    });
  });

  describe("scoreSmykm", () => {
    it("returns 0 with insufficient public content", () => {
      const result = scoreSmykm(makeInput({ brief: makeBrief({ publicContentDepth: 1 }) }));
      expect(result.score).toBe(0);
    });

    it("scores > 70 with 3+ public content pieces", () => {
      const result = scoreSmykm(makeInput({ brief: makeBrief({ publicContentDepth: 3 }) }));
      expect(result.score).toBeGreaterThan(70);
    });
  });

  describe("scoreDisplacement", () => {
    it("returns 0 when no competitor detected", () => {
      const result = scoreDisplacement(makeInput());
      expect(result.score).toBe(0);
    });

    it("scores 80 when competitor detected", () => {
      const result = scoreDisplacement(makeInput({ brief: makeBrief({ competitorDetected: "HubSpot" }) }));
      expect(result.score).toBe(80);
    });
  });

  describe("scoreValueFirst", () => {
    it("returns 0 with no website and no tech stack", () => {
      const brief = makeBrief({ websiteSummary: null, techStack: [] });
      const result = scoreValueFirst(makeInput({ brief }));
      expect(result.score).toBe(0);
    });

    it("scores > 70 with website + tech stack", () => {
      const brief = makeBrief({
        websiteSummary: "A company",
        techStack: [
          { tool: "React", category: "framework", confidence: "high" },
          { tool: "Stripe", category: "payments", confidence: "high" },
          { tool: "HubSpot", category: "crm", confidence: "high" },
        ],
      });
      const result = scoreValueFirst(makeInput({ brief }));
      expect(result.score).toBeGreaterThan(70);
    });
  });

  describe("scoreSocialFirst", () => {
    it("returns 0 with no LinkedIn activity", () => {
      const result = scoreSocialFirst(makeInput());
      expect(result.score).toBe(0);
    });

    it("scores >= 75 with active LinkedIn poster", () => {
      const brief = makeBrief({
        linkedinActivity: { postsPerWeek: 3, recentTopics: ["AI", "sales"], tone: "thought-leader", lastPostDate: null },
      });
      const result = scoreSocialFirst(makeInput({ brief }));
      expect(result.score).toBeGreaterThanOrEqual(75);
    });
  });

  describe("scoreMultiThread", () => {
    it("returns 0 with low company score", () => {
      const result = scoreMultiThread(makeInput({ companyScore: 60, contactsAvailable: 5 }));
      expect(result.score).toBe(0);
    });

    it("returns 0 with few contacts", () => {
      const result = scoreMultiThread(makeInput({ companyScore: 90, contactsAvailable: 2 }));
      expect(result.score).toBe(0);
    });

    it("scores 78 with high score + multiple contacts", () => {
      const result = scoreMultiThread(makeInput({ companyScore: 90, contactsAvailable: 4 }));
      expect(result.score).toBe(78);
    });
  });

  describe("scoreReEngagement", () => {
    it("returns 0 without previous outreach", () => {
      const result = scoreReEngagement(makeInput());
      expect(result.score).toBe(0);
    });

    it("returns 0 if less than 60 days", () => {
      const result = scoreReEngagement(makeInput({
        previousOutreach: { strategyUsed: null, outcome: "not_now", date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), emailsSent: 3 },
      }));
      expect(result.score).toBe(0);
    });

    it("scores >= 65 after 60+ days with not_now outcome", () => {
      const result = scoreReEngagement(makeInput({
        previousOutreach: { strategyUsed: null, outcome: "not_now", date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), emailsSent: 3 },
      }));
      expect(result.score).toBeGreaterThanOrEqual(65);
    });
  });

  describe("scoreEventTriggered", () => {
    it("returns 0 without inbound visit", () => {
      const result = scoreEventTriggered(makeInput());
      expect(result.score).toBe(0);
    });

    it("scores >= 90 with inbound visit", () => {
      const result = scoreEventTriggered(makeInput({ hasInboundVisit: true }));
      expect(result.score).toBeGreaterThanOrEqual(90);
    });
  });

  describe("scoreLongGame", () => {
    it("always returns 30 as fallback", () => {
      const result = scoreLongGame(makeInput());
      expect(result.score).toBe(30);
    });
  });

  describe("Strategy priority ordering", () => {
    it("event_triggered scores >= 90 (high urgency)", () => {
      const input = makeInput({ hasInboundVisit: true });
      const eventScore = scoreEventTriggered(input);
      expect(eventScore.score).toBeGreaterThanOrEqual(90);
    });

    it("warm_intro beats trigger_based by default", () => {
      const warmPath: WarmPath = { distance: 1, connectorNodeId: "n-1", connectorName: "A", connectorEmail: null, lastActiveAt: new Date().toISOString(), relationshipType: "SENT_EMAIL" };
      const signals: Signal[] = [{ type: "funding", confidence: "high", detectedAt: new Date().toISOString(), isNew: true }];
      const input = makeInput({ warmPath, signals });

      const warmScore = scoreWarmIntro(input);
      const triggerScore = scoreTriggerBased(input);
      expect(warmScore.score).toBeGreaterThanOrEqual(triggerScore.score);
    });
  });
});
