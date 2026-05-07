/**
 * Cascade tests — `applySignalsToProperties` (P0-5 tasks 5.3 + 5.4).
 *
 * Proof that an extracted-signals event lands the correct
 * PropertyEntry shape on the deal, with the right rule applied per
 * field. The DB layer is excluded — this exercises the pure cascade
 * exhaustively. The Inngest worker (deal-signal-sync.ts) is a thin
 * IO wrapper around this fn ; correctness of the cascade is proved
 * here.
 */

import { describe, it, expect } from "vitest";
import {
  applySignalsToProperties,
  type SignalsPayload,
} from "@/lib/deal-autofill/apply-signals";
import {
  isPropertyEntry,
  getDealProperty,
  getDealPropertyEntry,
} from "@/lib/deal-autofill/property-accessor";
import type { PropertyEntry } from "@/lib/deal-autofill/conflict-resolution";

const EVENT_DATE = new Date("2026-05-07T10:00:00Z");
const EARLIER = new Date("2026-04-01T08:00:00Z");

function entry(value: unknown, opts: Partial<PropertyEntry> = {}): PropertyEntry {
  const e: PropertyEntry = {
    value,
    source: opts.source ?? "email",
    date:
      opts.date instanceof Date
        ? opts.date.toISOString()
        : opts.date ?? EARLIER.toISOString(),
    manual: opts.manual ?? false,
  };
  if (opts.confidence !== undefined) e.confidence = opts.confidence;
  return e;
}

describe("applySignalsToProperties — task 5.3 budget extraction", () => {
  it("writes budget as PropertyEntry shape on first extraction", () => {
    const result = applySignalsToProperties({
      currentProperties: null,
      signals: { budget_mentions: ["$50K"] },
      eventDate: EVENT_DATE,
      source: "email",
    });

    expect(result.hasChanges).toBe(true);
    expect(isPropertyEntry(result.properties.budget)).toBe(true);
    expect(getDealProperty(result.properties, "budget")).toBe("$50K");

    const e = getDealPropertyEntry(result.properties, "budget");
    expect(e?.source).toBe("email");
    expect(e?.manual).toBe(false);
    expect(e?.date).toBe(EVENT_DATE.toISOString());
  });

  it("most-recent mention in batch wins for the canonical value", () => {
    const result = applySignalsToProperties({
      currentProperties: null,
      signals: { budget_mentions: ["$30K", "$45K", "$50K"] },
      eventDate: EVENT_DATE,
      source: "email",
    });
    expect(getDealProperty(result.properties, "budget")).toBe("$50K");
  });

  it("latest_wins when current entry is older auto-source", () => {
    const result = applySignalsToProperties({
      currentProperties: { budget: entry("$30K", { date: EARLIER }) },
      signals: { budget_mentions: ["$50K"] },
      eventDate: EVENT_DATE,
      source: "transcript",
    });
    expect(getDealProperty(result.properties, "budget")).toBe("$50K");
    const fu = result.fieldUpdates.find((f) => f.fieldName === "budget")!;
    expect(fu.ruleApplied).toBe("latest_wins");
    expect(fu.conflict).toBe(true);
    expect(fu.changed).toBe(true);
  });

  it("preserves manual budget against fresher auto signal", () => {
    const result = applySignalsToProperties({
      currentProperties: {
        budget: entry("$30K", { manual: true, date: EARLIER, source: "user" }),
      },
      signals: { budget_mentions: ["$50K"] },
      eventDate: EVENT_DATE,
      source: "email",
    });
    expect(getDealProperty(result.properties, "budget")).toBe("$30K");
    const fu = result.fieldUpdates.find((f) => f.fieldName === "budget")!;
    expect(fu.ruleApplied).toBe("preserve_manual");
    expect(fu.preservedManual).toBe(true);
    expect(fu.changed).toBe(false);
    expect(result.hasChanges).toBe(false);
  });

  it("rejects older auto signal against newer auto signal already on disk", () => {
    const newer = new Date("2026-05-06T10:00:00Z");
    const result = applySignalsToProperties({
      currentProperties: { budget: entry("$60K", { date: newer }) },
      signals: { budget_mentions: ["$30K"] },
      eventDate: EARLIER,
      source: "email",
    });
    expect(getDealProperty(result.properties, "budget")).toBe("$60K");
    expect(result.fieldUpdates.find((f) => f.fieldName === "budget")?.changed).toBe(false);
    expect(result.hasChanges).toBe(false);
  });

  it("appends prior entry to budget_history when overwriting", () => {
    const result = applySignalsToProperties({
      currentProperties: { budget: entry("$30K", { date: EARLIER, source: "email" }) },
      signals: { budget_mentions: ["$50K"] },
      eventDate: EVENT_DATE,
      source: "transcript",
    });
    expect(getDealProperty(result.properties, "budget")).toBe("$50K");
    const history = result.properties.budget_history as PropertyEntry[];
    expect(history).toHaveLength(1);
    expect(history[0].value).toBe("$30K");
    expect(history[0].source).toBe("email");
  });

  it("migrates legacy primitive budget into new shape on first cascade", () => {
    // Existing prod row : raw string under .budget.
    const result = applySignalsToProperties({
      currentProperties: { budget: "$30K" },
      signals: { budget_mentions: ["$50K"] },
      eventDate: EVENT_DATE,
      source: "email",
    });
    expect(isPropertyEntry(result.properties.budget)).toBe(true);
    expect(getDealProperty(result.properties, "budget")).toBe("$50K");
  });

  it("returns hasChanges=false when budget is unchanged", () => {
    const result = applySignalsToProperties({
      currentProperties: { budget: entry("$50K", { date: EARLIER, source: "email" }) },
      signals: { budget_mentions: ["$50K"] },
      eventDate: EVENT_DATE,
      source: "email",
    });
    expect(result.hasChanges).toBe(false);
    const fu = result.fieldUpdates.find((f) => f.fieldName === "budget")!;
    expect(fu.changed).toBe(false);
  });
});

describe("applySignalsToProperties — task 5.4 extended fields", () => {
  it("team_size : highest_confidence rule respects 0.8 threshold", () => {
    const result = applySignalsToProperties({
      currentProperties: { team_size: entry("50", { confidence: 0.9 }) },
      signals: {
        team_size_mentions: [{ value: "100", confidence: 0.6 }],
      },
      eventDate: EVENT_DATE,
      source: "transcript",
    });
    // 0.6 < 0.8 → ignored.
    expect(getDealProperty(result.properties, "team_size")).toBe("50");
    const fu = result.fieldUpdates.find((f) => f.fieldName === "team_size")!;
    expect(fu.ruleApplied).toBe("highest_confidence");
    expect(fu.changed).toBe(false);
  });

  it("team_size : higher confidence above threshold replaces", () => {
    const result = applySignalsToProperties({
      currentProperties: { team_size: entry("50", { confidence: 0.85 }) },
      signals: {
        team_size_mentions: [{ value: "120", confidence: 0.95 }],
      },
      eventDate: EVENT_DATE,
      source: "transcript",
    });
    expect(getDealProperty(result.properties, "team_size")).toBe("120");
  });

  it("team_size : picks best-confidence mention from a noisy batch", () => {
    const result = applySignalsToProperties({
      currentProperties: null,
      signals: {
        team_size_mentions: [
          { value: "10", confidence: 0.4 },
          { value: "100", confidence: 0.92 },
          { value: "75", confidence: 0.7 },
        ],
      },
      eventDate: EVENT_DATE,
      source: "transcript",
    });
    expect(getDealProperty(result.properties, "team_size")).toBe("100");
    const fu = result.fieldUpdates.find((f) => f.fieldName === "team_size")!;
    expect(fu.confidence).toBeCloseTo(0.92, 5);
  });

  it("competitors : union rule merges and dedups", () => {
    const result = applySignalsToProperties({
      currentProperties: { competitors: entry(["Salesforce", "HubSpot"]) },
      signals: { competitor_mentions: ["HubSpot", "Pipedrive"] },
      eventDate: EVENT_DATE,
      source: "email",
    });
    const list = getDealProperty<string[]>(result.properties, "competitors")!;
    expect(list).toEqual(["Salesforce", "HubSpot", "Pipedrive"]);
    expect(result.fieldUpdates.find((f) => f.fieldName === "competitors")?.ruleApplied).toBe("union");
  });

  it("competitors : no change when all incoming already present", () => {
    const result = applySignalsToProperties({
      currentProperties: { competitors: entry(["Salesforce", "HubSpot"]) },
      signals: { competitor_mentions: ["HubSpot"] },
      eventDate: EVENT_DATE,
      source: "email",
    });
    // Same array post-dedup → no value change ; source attribution
    // refreshes only when it shifts. Same source ("email") → no write.
    expect(result.hasChanges).toBe(false);
  });

  it("timeline : latest_wins on every fresh extraction", () => {
    const result = applySignalsToProperties({
      currentProperties: { timeline: entry("Q3 2026", { date: EARLIER }) },
      signals: { timeline_mentions: ["Q4 2026 latest"] },
      eventDate: EVENT_DATE,
      source: "email",
    });
    expect(getDealProperty(result.properties, "timeline")).toBe("Q4 2026 latest");
  });

  it("current_crm : latest_wins replaces stale value", () => {
    const result = applySignalsToProperties({
      currentProperties: { current_crm: entry("Salesforce", { date: EARLIER }) },
      signals: { current_crm_mentions: ["HubSpot"] },
      eventDate: EVENT_DATE,
      source: "transcript",
    });
    expect(getDealProperty(result.properties, "current_crm")).toBe("HubSpot");
  });

  it("point_solutions : union rule accumulates", () => {
    const result = applySignalsToProperties({
      currentProperties: { point_solutions: entry(["Outreach"]) },
      signals: { point_solutions: ["Apollo", "Outreach", "Salesloft"] },
      eventDate: EVENT_DATE,
      source: "email",
    });
    const list = getDealProperty<string[]>(result.properties, "point_solutions")!;
    expect(list).toEqual(["Outreach", "Apollo", "Salesloft"]);
  });

  it("stakeholders : union rule accumulates", () => {
    const result = applySignalsToProperties({
      currentProperties: null,
      signals: { stakeholders: ["VP Sales", "RevOps Lead"] },
      eventDate: EVENT_DATE,
      source: "transcript",
    });
    const list = getDealProperty<string[]>(result.properties, "stakeholders")!;
    expect(list).toEqual(["VP Sales", "RevOps Lead"]);
  });

  it("why_now : llm_synthesize flags pending field, keeps current placeholder", () => {
    const result = applySignalsToProperties({
      currentProperties: { why_now: entry("compliance audit Q4", { date: EARLIER }) },
      signals: { why_now: "GDPR fines incoming" },
      eventDate: EVENT_DATE,
      source: "email",
    });
    expect(result.pendingLlmFields).toContain("why_now");
    // Sync resolver returns current placeholder ; LLM follow-up
    // produces the synthesized version asynchronously.
    expect(getDealProperty(result.properties, "why_now")).toBe("compliance audit Q4");
  });

  it("why_now : no LLM follow-up when no conflict (same content)", () => {
    const result = applySignalsToProperties({
      currentProperties: { why_now: entry("budget cycle Jan", { date: EARLIER }) },
      signals: { why_now: "budget cycle Jan" },
      eventDate: EVENT_DATE,
      source: "email",
    });
    expect(result.pendingLlmFields).not.toContain("why_now");
  });
});

describe("applySignalsToProperties — accumulator fields", () => {
  it("objections : appends new, dedups existing", () => {
    const result = applySignalsToProperties({
      currentProperties: { objections: ["price too high"] },
      signals: { objections: ["price too high", "implementation timeline"] },
      eventDate: EVENT_DATE,
      source: "email",
    });
    expect(result.properties.objections).toEqual([
      "price too high",
      "implementation timeline",
    ]);
    expect(result.hasChanges).toBe(true);
  });

  it("objections : no-op when nothing new", () => {
    const result = applySignalsToProperties({
      currentProperties: { objections: ["price too high"] },
      signals: { objections: ["price too high"] },
      eventDate: EVENT_DATE,
      source: "email",
    });
    expect(result.hasChanges).toBe(false);
  });

  it("championSignals : accumulates dedup", () => {
    const result = applySignalsToProperties({
      currentProperties: null,
      signals: { champion_signals: ["mentioned us in board deck", "asked for trial extension"] },
      eventDate: EVENT_DATE,
      source: "transcript",
    });
    expect(result.properties.championSignals).toEqual([
      "mentioned us in board deck",
      "asked for trial extension",
    ]);
  });
});

describe("applySignalsToProperties — bookkeeping", () => {
  it("stamps lastSignalUpdate when at least one field changes", () => {
    const result = applySignalsToProperties({
      currentProperties: null,
      signals: { budget_mentions: ["$50K"] },
      eventDate: EVENT_DATE,
      source: "email",
    });
    expect(result.properties.lastSignalUpdate).toBe(EVENT_DATE.toISOString());
  });

  it("does not stamp lastSignalUpdate when nothing changes", () => {
    const props = { budget: entry("$50K", { date: EARLIER, source: "email" }) };
    const result = applySignalsToProperties({
      currentProperties: props,
      signals: { budget_mentions: ["$50K"] },
      eventDate: EVENT_DATE,
      source: "email",
    });
    expect(result.hasChanges).toBe(false);
    expect(result.properties.lastSignalUpdate).toBeUndefined();
  });

  it("returns empty fieldUpdates + hasChanges=false on empty signals", () => {
    const result = applySignalsToProperties({
      currentProperties: null,
      signals: {},
      eventDate: EVENT_DATE,
      source: "email",
    });
    expect(result.fieldUpdates).toEqual([]);
    expect(result.hasChanges).toBe(false);
    expect(result.pendingLlmFields).toEqual([]);
  });

  it("emits one fieldUpdate per touched field for telemetry", () => {
    const result = applySignalsToProperties({
      currentProperties: null,
      signals: {
        budget_mentions: ["$50K"],
        competitor_mentions: ["Salesforce"],
        timeline_mentions: ["Q4 2026"],
      },
      eventDate: EVENT_DATE,
      source: "email",
    });
    const fields = result.fieldUpdates.map((f) => f.fieldName).sort();
    expect(fields).toEqual(["budget", "competitors", "timeline"]);
    for (const fu of result.fieldUpdates) {
      expect(fu.changed).toBe(true);
    }
  });

  it("does not mutate the input properties object", () => {
    const input = { budget: entry("$30K", { date: EARLIER }) };
    const inputCopy = JSON.parse(JSON.stringify(input));
    applySignalsToProperties({
      currentProperties: input,
      signals: { budget_mentions: ["$50K"] },
      eventDate: EVENT_DATE,
      source: "email",
    });
    expect(input).toEqual(inputCopy);
  });
});
