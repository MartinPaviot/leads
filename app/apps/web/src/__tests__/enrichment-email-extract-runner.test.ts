import { describe, expect, it } from "vitest";
import {
  deriveContactAttrsFromExtraction,
  deriveDealAttrsFromExtraction,
  type EmailExtraction,
} from "@/lib/enrichment/email-extract";

const baseExtraction: EmailExtraction = {
  sentiment: "positive",
  sentimentConfidence: "high",
  intent: ["interested"],
  objections: [],
  competitorsMentioned: [],
  budgetMentioned: null,
  timeframeMentioned: null,
  nextSteps: [],
  championSignals: [],
  blockerSignals: [],
  decisionMakerMentioned: null,
  isAutomated: false,
};

describe("email-extract-runner > derive helpers", () => {
  describe("deriveContactAttrsFromExtraction", () => {
    it("records the latest sentiment", () => {
      const out = deriveContactAttrsFromExtraction({}, baseExtraction);
      expect(out.latestSentiment).toBe("positive");
      expect(out.latestSentimentConfidence).toBe("high");
    });
    it("increments champion/blocker counters", () => {
      const out = deriveContactAttrsFromExtraction(
        { championSignalCount: 3 },
        { ...baseExtraction, championSignals: ["I'll push internally"] },
      );
      expect(out.championSignalCount).toBe(4);
    });
    it("initializes blocker counter when absent", () => {
      const out = deriveContactAttrsFromExtraction(
        {},
        { ...baseExtraction, blockerSignals: ["we paused"] },
      );
      expect(out.blockerSignalCount).toBe(1);
    });
    it("merges objections dedupes and caps at 20", () => {
      const existing = { objectionsMentioned: ["too expensive"] };
      const out = deriveContactAttrsFromExtraction(existing, {
        ...baseExtraction,
        objections: ["too expensive", "need CFO approval"],
      });
      expect(out.objectionsMentioned).toEqual(["too expensive", "need CFO approval"]);
    });
    it("merges competitors dedupes", () => {
      const out = deriveContactAttrsFromExtraction(
        { competitorsMentioned: ["Salesforce"] },
        { ...baseExtraction, competitorsMentioned: ["Salesforce", "HubSpot"] },
      );
      expect(out.competitorsMentioned).toEqual(["Salesforce", "HubSpot"]);
    });
  });

  describe("deriveDealAttrsFromExtraction", () => {
    it("fills extractedBudget only when empty", () => {
      const out = deriveDealAttrsFromExtraction({}, {
        ...baseExtraction,
        budgetMentioned: "$50k/yr",
      });
      expect(out.extractedBudget).toBe("$50k/yr");
      expect(out.extractedBudgetFromEmail).toBe(true);
    });
    it("does not overwrite existing budget", () => {
      const out = deriveDealAttrsFromExtraction(
        { extractedBudget: "$30k" },
        { ...baseExtraction, budgetMentioned: "$50k" },
      );
      expect(out.extractedBudget).toBeUndefined();
    });
    it("appends next steps capped at 10", () => {
      const prev = new Array(9).fill({ owner: "sender", action: "x", dueDate: null });
      const out = deriveDealAttrsFromExtraction(
        { extractedNextSteps: prev },
        {
          ...baseExtraction,
          nextSteps: [
            { owner: "sender", action: "a", dueDate: null },
            { owner: "recipient", action: "b", dueDate: null },
          ],
        },
      );
      expect((out.extractedNextSteps as unknown[]).length).toBe(10);
    });
    it("merges blockers unique", () => {
      const out = deriveDealAttrsFromExtraction(
        { blockers: ["budget frozen"] },
        { ...baseExtraction, blockerSignals: ["budget frozen", "waiting for CFO"] },
      );
      expect(out.blockers).toEqual(["budget frozen", "waiting for CFO"]);
    });
  });
});
