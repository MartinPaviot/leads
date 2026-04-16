import { describe, expect, it } from "vitest";
import {
  emailExtractionSchema,
  buildEmailExtractionPrompt,
  truncateForLLM,
  looksAutomated,
  deriveActivityIntent,
} from "@/lib/enrichment/email-extract";

describe("enrichment/email-extract", () => {
  describe("schema", () => {
    it("validates a complete extraction", () => {
      const valid = emailExtractionSchema.parse({
        sentiment: "positive",
        sentimentConfidence: "high",
        intent: ["interested", "pricing_inquiry"],
        objections: [],
        competitorsMentioned: ["Salesforce"],
        budgetMentioned: "$50k/yr",
        timeframeMentioned: "by end of Q2",
        nextSteps: [
          { owner: "sender", action: "Send pricing doc", dueDate: "2026-04-20" },
        ],
        championSignals: ["I'll share with my team"],
        blockerSignals: [],
        decisionMakerMentioned: "CFO Alice",
        isAutomated: false,
      });
      expect(valid.sentiment).toBe("positive");
      expect(valid.nextSteps).toHaveLength(1);
    });
    it("rejects invalid sentiment values", () => {
      expect(() =>
        emailExtractionSchema.parse({
          sentiment: "ecstatic",
          sentimentConfidence: "high",
          intent: [],
          objections: [],
          competitorsMentioned: [],
          budgetMentioned: null,
          timeframeMentioned: null,
          nextSteps: [],
          championSignals: [],
          blockerSignals: [],
          decisionMakerMentioned: null,
          isAutomated: false,
        }),
      ).toThrow();
    });
  });

  describe("buildEmailExtractionPrompt", () => {
    it("includes all key context", () => {
      const p = buildEmailExtractionPrompt({
        subject: "Re: pricing",
        fromHeader: "Sarah <sarah@acme.com>",
        direction: "inbound",
        body: "Great, send us a quote.",
      });
      expect(p).toContain("FROM: Sarah <sarah@acme.com>");
      expect(p).toContain("SUBJECT: Re: pricing");
      expect(p).toContain("They emailed us");
      expect(p).toContain("Great, send us a quote.");
    });
    it("adds competitor hint when provided", () => {
      const p = buildEmailExtractionPrompt({
        subject: "hi",
        fromHeader: "x@y.com",
        direction: "outbound",
        body: "",
        competitorList: ["Attio", "Salesforce"],
      });
      expect(p).toContain("Attio, Salesforce");
    });
    it("uses We emailed them for outbound", () => {
      const p = buildEmailExtractionPrompt({
        subject: "hi",
        fromHeader: "x@y.com",
        direction: "outbound",
        body: "",
      });
      expect(p).toContain("We emailed them");
    });
  });

  describe("truncateForLLM", () => {
    it("returns body unchanged when short", () => {
      const short = "Hello";
      expect(truncateForLLM(short, 100)).toBe(short);
    });
    it("keeps head + tail when long", () => {
      const body = "A".repeat(10) + "B".repeat(100) + "C".repeat(10);
      const out = truncateForLLM(body, 20);
      expect(out).toContain("[...truncated...]");
      expect(out.startsWith("AAAA")).toBe(true);
      expect(out.endsWith("CCCCCC")).toBe(true);
    });
  });

  describe("looksAutomated", () => {
    it("flags typical auto-responders", () => {
      expect(looksAutomated({ subject: "Out of office", fromHeader: "s@acme.com" })).toBe(true);
      expect(looksAutomated({ subject: "Automatic reply", fromHeader: "s@acme.com" })).toBe(true);
      expect(looksAutomated({ subject: "Re: hi", fromHeader: "noreply@notify.com" })).toBe(true);
      expect(looksAutomated({ subject: "Re: hi", fromHeader: "mailer-daemon@x.com" })).toBe(true);
    });
    it("accepts normal business email", () => {
      expect(looksAutomated({ subject: "Re: intro", fromHeader: "sarah@acme.com" })).toBe(false);
    });
    it("flags calendar invites", () => {
      expect(looksAutomated({ subject: "Invitation: Demo @ Tue Apr 20", fromHeader: "sarah@acme.com" })).toBe(true);
    });
  });

  describe("deriveActivityIntent", () => {
    const base = {
      sentiment: "neutral" as const,
      sentimentConfidence: "medium" as const,
      intent: [] as any[],
      objections: [] as string[],
      competitorsMentioned: [] as string[],
      budgetMentioned: null as string | null,
      timeframeMentioned: null as string | null,
      nextSteps: [] as any[],
      championSignals: [] as string[],
      blockerSignals: [] as string[],
      decisionMakerMentioned: null as string | null,
      isAutomated: false,
    };
    it("surfaces extracted intents", () => {
      const out = deriveActivityIntent({
        ...base,
        intent: ["interested", "pricing_inquiry"],
      });
      expect(out).toContain("interested");
      expect(out).toContain("pricing_inquiry");
    });
    it("adds derived signals for objections, budget, etc.", () => {
      const out = deriveActivityIntent({
        ...base,
        objections: ["too expensive"],
        budgetMentioned: "$50k",
        championSignals: ["will advocate"],
      });
      expect(out).toContain("has_objection");
      expect(out).toContain("mentions_budget");
      expect(out).toContain("champion_signal");
    });
    it("caps at 6 signals", () => {
      const out = deriveActivityIntent({
        ...base,
        intent: ["interested", "pricing_inquiry", "demo_request", "follow_up"],
        objections: ["x"],
        competitorsMentioned: ["y"],
        budgetMentioned: "1",
        timeframeMentioned: "2",
        championSignals: ["z"],
      });
      expect(out.length).toBeLessThanOrEqual(6);
    });
  });
});
