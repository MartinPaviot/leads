/**
 * Tests for the deal progression engine — signal detection + progression rules.
 *
 * These test the pure-logic signal detectors and rule-matching without
 * requiring DB or LLM mocks. The detectors operate on in-memory
 * ActivityRecord arrays, making them fast and deterministic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectFirstMeetingScheduled,
  detectMeetingCompletedPositive,
  detectDemoCompletedWithFollowUp,
  detectProposalSent,
  detectPositiveReplyToProposal,
  detectContractOrVerbalYes,
  detectStalledNoActivity,
  detectAtRiskNegative,
  detectMultiplePositiveInteractions,
  detectChampionEngagement,
  detectAllSignals,
  type ActivityRecord,
  type Signal,
} from "@/lib/deal-progression/signals";
import {
  PROGRESSION_RULES,
  FLAG_RULES,
  type ProgressionRule,
} from "@/lib/deal-progression/engine";

// ── Helpers ──────────────────────────────────────────────────

function makeActivity(
  overrides: Partial<ActivityRecord> & { activityType: string },
): ActivityRecord {
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date(),
    channel: null,
    direction: null,
    sentiment: null,
    summary: null,
    metadata: null,
    intent: null,
    ...overrides,
  };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

// ── Signal Detectors ─────────────────────────────────────────

describe("detectFirstMeetingScheduled", () => {
  it("returns signal when meeting_scheduled activity exists", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "meeting_scheduled",
        summary: "Intro call with Sarah",
      }),
    ];
    const signal = detectFirstMeetingScheduled(activities);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("first_meeting_scheduled");
    expect(signal!.confidence).toBe(0.85);
    expect(signal!.evidence).toContain("scheduled");
    expect(signal!.evidence).toContain("Intro call with Sarah");
  });

  it("returns signal when meeting_completed activity exists (fallback)", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "meeting_completed",
        summary: "Discovery call completed",
      }),
    ];
    const signal = detectFirstMeetingScheduled(activities);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("first_meeting_scheduled");
    expect(signal!.evidence).toContain("completed");
  });

  it("returns null when no meeting activity exists", () => {
    const activities: ActivityRecord[] = [
      makeActivity({ activityType: "email_sent", summary: "Outreach" }),
    ];
    expect(detectFirstMeetingScheduled(activities)).toBeNull();
  });

  it("returns null for empty activity list", () => {
    expect(detectFirstMeetingScheduled([])).toBeNull();
  });
});

describe("detectMeetingCompletedPositive", () => {
  it("returns signal for meeting_completed with positive sentiment", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "meeting_completed",
        sentiment: "positive",
        summary: "Great discovery call",
      }),
    ];
    const signal = detectMeetingCompletedPositive(activities);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("meeting_completed_positive");
    expect(signal!.confidence).toBe(0.8);
    expect(signal!.evidence).toContain("positive sentiment");
  });

  it("returns null for meeting_completed with neutral sentiment", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "meeting_completed",
        sentiment: "neutral",
        summary: "Standard call",
      }),
    ];
    expect(detectMeetingCompletedPositive(activities)).toBeNull();
  });

  it("returns null for meeting_completed with negative sentiment", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "meeting_completed",
        sentiment: "negative",
        summary: "They were uninterested",
      }),
    ];
    expect(detectMeetingCompletedPositive(activities)).toBeNull();
  });

  it("returns null when no meeting_completed activity exists", () => {
    const activities: ActivityRecord[] = [
      makeActivity({ activityType: "meeting_scheduled" }),
    ];
    expect(detectMeetingCompletedPositive(activities)).toBeNull();
  });
});

describe("detectStalledNoActivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("returns stalled signal when no activity in 30+ days", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_sent",
        occurredAt: new Date("2026-03-15T12:00:00Z"), // 43 days ago
      }),
    ];
    const signal = detectStalledNoActivity(activities);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("stalled_no_activity");
    expect(signal!.evidence).toContain("No activity in");
    expect(signal!.evidence).toContain("43 days");
    // Confidence increases with stalled duration
    expect(signal!.confidence).toBeGreaterThanOrEqual(0.6);
    expect(signal!.confidence).toBeLessThanOrEqual(0.95);
  });

  it("returns null when recent activity exists within 30 days", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_sent",
        occurredAt: new Date("2026-04-10T12:00:00Z"), // 17 days ago
      }),
    ];
    expect(detectStalledNoActivity(activities)).toBeNull();
  });

  it("returns null for empty activity list (new deal, not stalled)", () => {
    expect(detectStalledNoActivity([])).toBeNull();
  });

  it("accepts custom stalledDays parameter", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_sent",
        occurredAt: new Date("2026-04-20T12:00:00Z"), // 7 days ago
      }),
    ];
    // Default 30 days: not stalled
    expect(detectStalledNoActivity(activities, 30)).toBeNull();
    // Custom 5 days: stalled
    const signal = detectStalledNoActivity(activities, 5);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("stalled_no_activity");
  });

  it("caps confidence at 0.95", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_sent",
        occurredAt: new Date("2025-01-01T12:00:00Z"), // ~480 days ago
      }),
    ];
    const signal = detectStalledNoActivity(activities);
    expect(signal).not.toBeNull();
    expect(signal!.confidence).toBe(0.95);
  });
});

describe("detectAtRiskNegative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("returns at-risk signal when negative reply with no follow-up past window", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_received",
        direction: "inbound",
        sentiment: "negative",
        summary: "Not interested right now",
        occurredAt: new Date("2026-04-01T12:00:00Z"), // 26 days ago (>14 day window)
      }),
    ];
    const signal = detectAtRiskNegative(activities);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("at_risk_negative");
    expect(signal!.evidence).toContain("Negative");
    expect(signal!.evidence).toContain("no follow-up");
  });

  it("returns null when follow-up was sent after negative reply", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_received",
        direction: "inbound",
        sentiment: "negative",
        summary: "Not interested",
        occurredAt: new Date("2026-04-01T12:00:00Z"),
      }),
      makeActivity({
        activityType: "email_sent",
        direction: "outbound",
        summary: "Following up on your concerns",
        occurredAt: new Date("2026-04-03T12:00:00Z"),
      }),
    ];
    expect(detectAtRiskNegative(activities)).toBeNull();
  });

  it("returns null when negative reply is within follow-up window", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_received",
        direction: "inbound",
        sentiment: "negative",
        summary: "Concerns about pricing",
        occurredAt: new Date("2026-04-20T12:00:00Z"), // 7 days ago, within 14-day window
      }),
    ];
    expect(detectAtRiskNegative(activities)).toBeNull();
  });

  it("returns null when no negative activity exists", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_received",
        direction: "inbound",
        sentiment: "positive",
        summary: "Looks great!",
        occurredAt: new Date("2026-04-01T12:00:00Z"),
      }),
    ];
    expect(detectAtRiskNegative(activities)).toBeNull();
  });

  it("accepts custom follow-up window", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_received",
        direction: "inbound",
        sentiment: "negative",
        summary: "Not sure about this",
        occurredAt: new Date("2026-04-20T12:00:00Z"), // 7 days ago
      }),
    ];
    // Default 14 days: within window, not at risk
    expect(detectAtRiskNegative(activities, 14)).toBeNull();
    // Custom 5 days: past window, at risk
    const signal = detectAtRiskNegative(activities, 5);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("at_risk_negative");
  });
});

describe("detectDemoCompletedWithFollowUp", () => {
  it("returns signal when demo completed and follow-up email sent after", () => {
    const demoDate = new Date("2026-04-20T14:00:00Z");
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "meeting_completed",
        sentiment: "positive",
        summary: "Product demo",
        occurredAt: demoDate,
      }),
      makeActivity({
        activityType: "email_sent",
        summary: "Demo follow-up with pricing",
        occurredAt: new Date("2026-04-21T10:00:00Z"),
      }),
    ];
    const signal = detectDemoCompletedWithFollowUp(activities);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("follow_up_sent_after_demo");
    expect(signal!.confidence).toBe(0.85); // positive demo = higher confidence
    expect(signal!.evidence).toContain("positive");
  });

  it("returns lower confidence for non-positive demo", () => {
    const demoDate = new Date("2026-04-20T14:00:00Z");
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "meeting_completed",
        sentiment: "neutral",
        summary: "Product demo",
        occurredAt: demoDate,
      }),
      makeActivity({
        activityType: "email_sent",
        summary: "Follow-up",
        occurredAt: new Date("2026-04-21T10:00:00Z"),
      }),
    ];
    const signal = detectDemoCompletedWithFollowUp(activities);
    expect(signal).not.toBeNull();
    expect(signal!.confidence).toBe(0.7);
  });

  it("returns null when no follow-up after demo", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "meeting_completed",
        summary: "Product demo",
        occurredAt: new Date("2026-04-20T14:00:00Z"),
      }),
    ];
    expect(detectDemoCompletedWithFollowUp(activities)).toBeNull();
  });
});

describe("detectProposalSent", () => {
  it("detects proposal email via summary keyword", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_sent",
        summary: "Sent pricing proposal for Q2",
      }),
    ];
    const signal = detectProposalSent(activities);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("proposal_sent");
    expect(signal!.confidence).toBe(0.8);
  });

  it("detects proposal via subject in metadata", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_sent",
        summary: "Email sent",
        metadata: { subject: "Your custom quote - Acme Corp" },
      }),
    ];
    const signal = detectProposalSent(activities);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("proposal_sent");
  });

  it("returns null for non-proposal emails", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_sent",
        summary: "Quick check-in on the project",
      }),
    ];
    expect(detectProposalSent(activities)).toBeNull();
  });
});

describe("detectPositiveReplyToProposal", () => {
  it("detects positive reply after proposal sent", () => {
    const proposalDate = new Date("2026-04-20T10:00:00Z");
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_sent",
        summary: "Sent pricing proposal",
        occurredAt: proposalDate,
      }),
      makeActivity({
        activityType: "email_received",
        direction: "inbound",
        sentiment: "positive",
        summary: "This looks great, let me review internally",
        occurredAt: new Date("2026-04-22T10:00:00Z"),
      }),
    ];
    const signal = detectPositiveReplyToProposal(activities);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("positive_reply_to_proposal");
    expect(signal!.confidence).toBe(0.85);
  });

  it("returns null when no proposal was sent", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_received",
        direction: "inbound",
        sentiment: "positive",
        summary: "We like your product",
        occurredAt: new Date("2026-04-22T10:00:00Z"),
      }),
    ];
    expect(detectPositiveReplyToProposal(activities)).toBeNull();
  });
});

describe("detectContractOrVerbalYes", () => {
  it("detects deal_won activity with high confidence", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "deal_won",
        summary: "Deal closed!",
      }),
    ];
    const signal = detectContractOrVerbalYes(activities);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("contract_or_verbal_yes");
    expect(signal!.confidence).toBe(0.95);
  });

  it("detects contract keywords in activity summaries", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "note_created",
        summary: "Contract signed by both parties",
      }),
    ];
    const signal = detectContractOrVerbalYes(activities);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("contract_or_verbal_yes");
    expect(signal!.confidence).toBe(0.75); // single signal = lower confidence
  });

  it("increases confidence with multiple contract signals", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "note_created",
        summary: "Verbal yes from CTO",
      }),
      makeActivity({
        activityType: "email_received",
        summary: "Ready to proceed with contract",
      }),
    ];
    const signal = detectContractOrVerbalYes(activities);
    expect(signal).not.toBeNull();
    expect(signal!.confidence).toBe(0.9); // 2+ signals = higher
  });

  it("returns null when no contract-related activity exists", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_sent",
        summary: "Follow-up on our discussion",
      }),
    ];
    expect(detectContractOrVerbalYes(activities)).toBeNull();
  });
});

describe("detectMultiplePositiveInteractions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("returns signal when 2+ positive interactions in window", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_received",
        sentiment: "positive",
        occurredAt: new Date("2026-04-20T10:00:00Z"),
      }),
      makeActivity({
        activityType: "meeting_completed",
        sentiment: "positive",
        occurredAt: new Date("2026-04-22T10:00:00Z"),
      }),
      makeActivity({
        activityType: "email_received",
        sentiment: "positive",
        occurredAt: new Date("2026-04-25T10:00:00Z"),
      }),
    ];
    const signal = detectMultiplePositiveInteractions(activities);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("multiple_positive_interactions");
    expect(signal!.evidence).toContain("3 positive interactions");
    expect(signal!.confidence).toBe(0.8); // 0.5 + 3*0.1
  });

  it("returns null for fewer than 2 positive interactions", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_received",
        sentiment: "positive",
        occurredAt: new Date("2026-04-25T10:00:00Z"),
      }),
    ];
    expect(detectMultiplePositiveInteractions(activities)).toBeNull();
  });
});

describe("detectChampionEngagement", () => {
  it("returns signal when 3+ inbound touches detected", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_received",
        direction: "inbound",
      }),
      makeActivity({
        activityType: "email_replied",
        direction: "inbound",
      }),
      makeActivity({
        activityType: "meeting_completed",
        direction: "inbound",
      }),
    ];
    const signal = detectChampionEngagement(activities);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("champion_engagement");
    expect(signal!.evidence).toContain("3 inbound touches");
  });

  it("returns null for fewer than 3 inbound touches", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "email_received",
        direction: "inbound",
      }),
      makeActivity({
        activityType: "email_sent",
        direction: "outbound",
      }),
    ];
    expect(detectChampionEngagement(activities)).toBeNull();
  });
});

describe("detectAllSignals", () => {
  it("runs all detectors and returns found signals", () => {
    const activities: ActivityRecord[] = [
      makeActivity({
        activityType: "meeting_scheduled",
        summary: "Intro call",
      }),
      makeActivity({
        activityType: "meeting_completed",
        sentiment: "positive",
        summary: "Great call",
      }),
    ];
    const signals = detectAllSignals(activities);
    expect(signals.length).toBeGreaterThanOrEqual(2);
    const types = signals.map((s) => s.type);
    expect(types).toContain("first_meeting_scheduled");
    expect(types).toContain("meeting_completed_positive");
  });

  it("returns empty array for empty activities", () => {
    expect(detectAllSignals([])).toEqual([]);
  });
});

// ── Progression Rules ────────────────────────────────────────

describe("PROGRESSION_RULES", () => {
  it("defines rules for all standard stage transitions", () => {
    const fromStages = PROGRESSION_RULES.map((r) => r.fromStage);
    expect(fromStages).toContain("lead");
    expect(fromStages).toContain("qualification");
    expect(fromStages).toContain("demo");
    expect(fromStages).toContain("proposal");
    expect(fromStages).toContain("negotiation");
  });

  it("lead -> qualification requires first_meeting_scheduled or meeting_completed_positive", () => {
    const rule = PROGRESSION_RULES.find(
      (r) => r.fromStage === "lead" && r.toStage === "qualification",
    );
    expect(rule).toBeDefined();
    expect(rule!.requiredSignals).toEqual([
      ["first_meeting_scheduled"],
      ["meeting_completed_positive"],
    ]);
    expect(rule!.minConfidence).toBe(0.7);
  });

  it("qualification -> demo requires meeting_completed_positive or multiple_positive_interactions", () => {
    const rule = PROGRESSION_RULES.find(
      (r) => r.fromStage === "qualification" && r.toStage === "demo",
    );
    expect(rule).toBeDefined();
    expect(rule!.requiredSignals).toEqual([
      ["meeting_completed_positive"],
      ["multiple_positive_interactions"],
    ]);
    expect(rule!.minConfidence).toBe(0.75);
  });

  it("negotiation -> won requires contract_or_verbal_yes with high confidence", () => {
    const rule = PROGRESSION_RULES.find(
      (r) => r.fromStage === "negotiation" && r.toStage === "won",
    );
    expect(rule).toBeDefined();
    expect(rule!.requiredSignals).toEqual([["contract_or_verbal_yes"]]);
    expect(rule!.minConfidence).toBe(0.85);
    // No boost signals — need high-confidence primary signal
    expect(rule!.boostSignals).toBeUndefined();
  });

  it("all rules have valid minConfidence between 0 and 1", () => {
    for (const rule of PROGRESSION_RULES) {
      expect(rule.minConfidence).toBeGreaterThan(0);
      expect(rule.minConfidence).toBeLessThanOrEqual(1);
    }
  });

  it("all rules have at least one required signal group", () => {
    for (const rule of PROGRESSION_RULES) {
      expect(rule.requiredSignals.length).toBeGreaterThanOrEqual(1);
      for (const group of rule.requiredSignals) {
        expect(group.length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("FLAG_RULES", () => {
  it("defines stalled and at_risk flags", () => {
    const flagTypes = FLAG_RULES.map((r) => r.flagType);
    expect(flagTypes).toContain("stalled");
    expect(flagTypes).toContain("at_risk");
  });

  it("stalled flag maps to stalled_no_activity signal", () => {
    const stalledRule = FLAG_RULES.find((r) => r.flagType === "stalled");
    expect(stalledRule).toBeDefined();
    expect(stalledRule!.signalType).toBe("stalled_no_activity");
    // Applies to all stages
    expect(stalledRule!.applicableStages).toEqual([]);
  });

  it("at_risk flag maps to at_risk_negative signal", () => {
    const riskRule = FLAG_RULES.find((r) => r.flagType === "at_risk");
    expect(riskRule).toBeDefined();
    expect(riskRule!.signalType).toBe("at_risk_negative");
    expect(riskRule!.applicableStages).toEqual([]);
  });
});

// ── Confidence calculation integration ──────────────────────

describe("confidence calculation (rule matching logic)", () => {
  /**
   * Simulate the engine's confidence calculation for a given rule
   * and set of signals. Mirrors evaluateDealProgression logic without
   * requiring DB access.
   */
  function simulateRuleMatch(
    rule: ProgressionRule,
    signals: Signal[],
  ): { matches: boolean; confidence: number } {
    let matchedGroup: string[] | null = null;
    for (const group of rule.requiredSignals) {
      const allPresent = group.every((st) =>
        signals.some((s) => s.type === st),
      );
      if (allPresent) {
        matchedGroup = group;
        break;
      }
    }

    if (!matchedGroup) return { matches: false, confidence: 0 };

    const matchedSignals = signals.filter((s) =>
      matchedGroup!.includes(s.type),
    );
    let avgConfidence =
      matchedSignals.reduce((sum, s) => sum + s.confidence, 0) /
      matchedSignals.length;

    if (rule.boostSignals && rule.boostPerSignal) {
      for (const boostType of rule.boostSignals) {
        if (signals.some((s) => s.type === boostType)) {
          avgConfidence += rule.boostPerSignal;
        }
      }
    }
    avgConfidence = Math.min(1, Math.max(0, avgConfidence));

    return {
      matches: avgConfidence >= rule.minConfidence,
      confidence: avgConfidence,
    };
  }

  it("lead with first_meeting_scheduled (0.85) should suggest qualification", () => {
    const rule = PROGRESSION_RULES.find(
      (r) => r.fromStage === "lead" && r.toStage === "qualification",
    )!;
    const signals: Signal[] = [
      {
        type: "first_meeting_scheduled",
        confidence: 0.85,
        evidence: "Meeting scheduled",
        detectedAt: new Date(),
      },
    ];
    const result = simulateRuleMatch(rule, signals);
    expect(result.matches).toBe(true);
    expect(result.confidence).toBe(0.85);
  });

  it("qualification with meeting_completed_positive should suggest demo", () => {
    const rule = PROGRESSION_RULES.find(
      (r) => r.fromStage === "qualification" && r.toStage === "demo",
    )!;
    const signals: Signal[] = [
      {
        type: "meeting_completed_positive",
        confidence: 0.8,
        evidence: "Meeting completed positively",
        detectedAt: new Date(),
      },
    ];
    const result = simulateRuleMatch(rule, signals);
    expect(result.matches).toBe(true);
    expect(result.confidence).toBe(0.8);
  });

  it("boost signal increases confidence", () => {
    const rule = PROGRESSION_RULES.find(
      (r) => r.fromStage === "lead" && r.toStage === "qualification",
    )!;
    const signalsWithBoost: Signal[] = [
      {
        type: "first_meeting_scheduled",
        confidence: 0.85,
        evidence: "Meeting scheduled",
        detectedAt: new Date(),
      },
      {
        type: "champion_engagement",
        confidence: 0.7,
        evidence: "Champion detected",
        detectedAt: new Date(),
      },
    ];
    const result = simulateRuleMatch(rule, signalsWithBoost);
    expect(result.confidence).toBe(0.9); // 0.85 + 0.05 boost
    expect(result.matches).toBe(true);
  });

  it("deal with no matching signals should not progress", () => {
    const rule = PROGRESSION_RULES.find(
      (r) => r.fromStage === "lead" && r.toStage === "qualification",
    )!;
    const signals: Signal[] = [
      {
        type: "proposal_sent",
        confidence: 0.8,
        evidence: "Wrong signal for this stage",
        detectedAt: new Date(),
      },
    ];
    const result = simulateRuleMatch(rule, signals);
    expect(result.matches).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("low confidence signal below minConfidence threshold does not match", () => {
    const rule = PROGRESSION_RULES.find(
      (r) => r.fromStage === "qualification" && r.toStage === "demo",
    )!;
    const signals: Signal[] = [
      {
        type: "meeting_completed_positive",
        confidence: 0.5, // Below 0.75 threshold
        evidence: "Questionable meeting",
        detectedAt: new Date(),
      },
    ];
    const result = simulateRuleMatch(rule, signals);
    expect(result.matches).toBe(false);
    expect(result.confidence).toBe(0.5);
  });

  it("confidence is clamped to [0, 1] even with many boosts", () => {
    const rule = PROGRESSION_RULES.find(
      (r) => r.fromStage === "demo" && r.toStage === "proposal",
    )!;
    const signals: Signal[] = [
      {
        type: "follow_up_sent_after_demo",
        confidence: 0.95,
        evidence: "Follow-up sent",
        detectedAt: new Date(),
      },
      {
        type: "multiple_positive_interactions",
        confidence: 0.9,
        evidence: "Boost",
        detectedAt: new Date(),
      },
      {
        type: "champion_engagement",
        confidence: 0.85,
        evidence: "Boost",
        detectedAt: new Date(),
      },
    ];
    const result = simulateRuleMatch(rule, signals);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.matches).toBe(true);
  });
});
