import { describe, it, expect } from "vitest";
import {
  resolveConflict,
  requiresLlmSynthesis,
  FIELD_CONFLICT_RULES,
  type PropertyEntry,
} from "@/lib/deal-autofill/conflict-resolution";

const MAR_1 = new Date("2026-03-01T10:00:00Z");
const MAR_15 = new Date("2026-03-15T10:00:00Z");
const APR_1 = new Date("2026-04-01T10:00:00Z");

describe("resolveConflict — preserve_manual", () => {
  it("manual current always wins, even against more recent incoming", () => {
    const current: PropertyEntry<number> = {
      value: 30000,
      source: "manual",
      date: MAR_1,
      manual: true,
    };
    const incoming: PropertyEntry<number> = {
      value: 50000,
      source: "email",
      date: APR_1,
      manual: false,
      confidence: 0.95,
    };
    const r = resolveConflict("budget", current, incoming);
    expect(r.value).toBe(30000);
    expect(r.preservedManual).toBe(true);
    expect(r.conflict).toBe(true);
    expect(r.ruleApplied).toBe("preserve_manual");
  });

  it("manual current with same value as incoming → no conflict reported", () => {
    const current: PropertyEntry<number> = {
      value: 30000,
      source: "manual",
      date: MAR_1,
      manual: true,
    };
    const incoming: PropertyEntry<number> = {
      value: 30000,
      source: "email",
      date: APR_1,
      manual: false,
    };
    const r = resolveConflict("budget", current, incoming);
    expect(r.preservedManual).toBe(true);
    expect(r.conflict).toBe(false);
  });
});

describe("resolveConflict — latest_wins", () => {
  it("budget field — newer incoming overrides older current", () => {
    const current: PropertyEntry<number> = {
      value: 30000,
      source: "meeting",
      date: MAR_1,
      manual: false,
    };
    const incoming: PropertyEntry<number> = {
      value: 50000,
      source: "email",
      date: APR_1,
      manual: false,
    };
    const r = resolveConflict("budget", current, incoming);
    expect(r.value).toBe(50000);
    expect(r.source).toBe("email");
    expect(r.conflict).toBe(true);
    expect(r.ruleApplied).toBe("latest_wins");
  });

  it("budget field — older incoming does NOT override newer current", () => {
    const current: PropertyEntry<number> = {
      value: 50000,
      source: "email",
      date: APR_1,
      manual: false,
    };
    const incoming: PropertyEntry<number> = {
      value: 30000,
      source: "meeting",
      date: MAR_1,
      manual: false,
    };
    const r = resolveConflict("budget", current, incoming);
    expect(r.value).toBe(50000);
    expect(r.source).toBe("email");
    expect(r.conflict).toBe(true);
  });

  it("unknown field defaults to latest_wins", () => {
    const current: PropertyEntry<string> = {
      value: "old",
      source: "import",
      date: MAR_1,
      manual: false,
    };
    const incoming: PropertyEntry<string> = {
      value: "new",
      source: "email",
      date: APR_1,
      manual: false,
    };
    const r = resolveConflict("custom_field_xyz", current, incoming);
    expect(r.value).toBe("new");
    expect(r.ruleApplied).toBe("latest_wins");
  });
});

describe("resolveConflict — union", () => {
  it("competitors merges arrays without dups", () => {
    const current: PropertyEntry<string[]> = {
      value: ["Datadog", "Splunk"],
      source: "meeting",
      date: MAR_1,
      manual: false,
    };
    const incoming: PropertyEntry<string[]> = {
      value: ["New Relic", "Datadog"],
      source: "email",
      date: APR_1,
      manual: false,
    };
    const r = resolveConflict("competitors", current, incoming);
    expect(r.value).toEqual(["Datadog", "Splunk", "New Relic"]);
    expect(r.ruleApplied).toBe("union");
    expect(r.source).toBe("email"); // latest source for attribution
  });

  it("stakeholders preserves order from current then appends new", () => {
    const current: PropertyEntry<string[]> = {
      value: ["alice@acme.com", "bob@acme.com"],
      source: "import",
      date: MAR_1,
      manual: false,
    };
    const incoming: PropertyEntry<string[]> = {
      value: ["bob@acme.com", "carol@acme.com"],
      source: "email",
      date: APR_1,
      manual: false,
    };
    const r = resolveConflict("stakeholders", current, incoming);
    expect(r.value).toEqual([
      "alice@acme.com",
      "bob@acme.com",
      "carol@acme.com",
    ]);
  });

  it("falls back to latest_wins when both sides aren't arrays", () => {
    const current: PropertyEntry<string> = {
      value: "x",
      source: "meeting",
      date: MAR_1,
      manual: false,
    };
    const incoming: PropertyEntry<string> = {
      value: "y",
      source: "email",
      date: APR_1,
      manual: false,
    };
    const r = resolveConflict("competitors", current, incoming);
    expect(r.value).toBe("y");
    expect(r.ruleApplied).toBe("latest_wins");
  });

  it("identical arrays → no conflict reported", () => {
    const arr = ["A", "B"];
    const current: PropertyEntry<string[]> = {
      value: [...arr],
      source: "meeting",
      date: MAR_1,
      manual: false,
    };
    const incoming: PropertyEntry<string[]> = {
      value: [...arr],
      source: "email",
      date: APR_1,
      manual: false,
    };
    const r = resolveConflict("competitors", current, incoming);
    expect(r.conflict).toBe(false);
  });
});

describe("resolveConflict — highest_confidence", () => {
  it("incoming above 0.8 with higher conf than current wins", () => {
    const current: PropertyEntry<number> = {
      value: 25,
      source: "meeting",
      date: MAR_1,
      manual: false,
      confidence: 0.7,
    };
    const incoming: PropertyEntry<number> = {
      value: 50,
      source: "email",
      date: APR_1,
      manual: false,
      confidence: 0.92,
    };
    const r = resolveConflict("team_size", current, incoming);
    expect(r.value).toBe(50);
    expect(r.ruleApplied).toBe("highest_confidence");
  });

  it("incoming below 0.8 confidence does NOT win", () => {
    const current: PropertyEntry<number> = {
      value: 25,
      source: "meeting",
      date: MAR_1,
      manual: false,
      confidence: 0.6,
    };
    const incoming: PropertyEntry<number> = {
      value: 50,
      source: "email",
      date: APR_1,
      manual: false,
      confidence: 0.75, // below threshold
    };
    const r = resolveConflict("team_size", current, incoming);
    expect(r.value).toBe(25); // current sticks
    expect(r.conflict).toBe(true);
  });

  it("missing confidence treated as 0", () => {
    const current: PropertyEntry<number> = {
      value: 30,
      source: "meeting",
      date: MAR_1,
      manual: false,
      confidence: 0.9,
    };
    const incoming: PropertyEntry<number> = {
      value: 60,
      source: "email",
      date: APR_1,
      manual: false,
      // no confidence
    };
    const r = resolveConflict("team_size", current, incoming);
    expect(r.value).toBe(30);
  });
});

describe("resolveConflict — llm_synthesize", () => {
  it("returns current as placeholder, marks rule applied", () => {
    const current: PropertyEntry<string> = {
      value: "old narrative",
      source: "meeting",
      date: MAR_1,
      manual: false,
    };
    const incoming: PropertyEntry<string> = {
      value: "new narrative",
      source: "email",
      date: APR_1,
      manual: false,
    };
    const r = resolveConflict("why_now", current, incoming);
    expect(r.value).toBe("old narrative");
    expect(r.conflict).toBe(true);
    expect(r.ruleApplied).toBe("llm_synthesize");
  });

  it("requiresLlmSynthesis returns true for narrative fields", () => {
    expect(requiresLlmSynthesis("why_now")).toBe(true);
    expect(requiresLlmSynthesis("summary")).toBe(true);
    expect(requiresLlmSynthesis("budget")).toBe(false);
    expect(requiresLlmSynthesis("competitors")).toBe(false);
  });
});

describe("FIELD_CONFLICT_RULES — registry shape", () => {
  it("covers the canonical fields from the spec", () => {
    const required = [
      "budget",
      "team_size",
      "current_crm",
      "competitors",
      "point_solutions",
      "stakeholders",
      "next_step",
      "timeline",
      "why_now",
      "summary",
    ];
    for (const f of required) {
      expect(FIELD_CONFLICT_RULES[f]).toBeDefined();
    }
  });

  it("each rule type has the right type field", () => {
    expect(FIELD_CONFLICT_RULES.budget.type).toBe("latest_wins");
    expect(FIELD_CONFLICT_RULES.team_size.type).toBe("highest_confidence");
    expect(FIELD_CONFLICT_RULES.competitors.type).toBe("union");
    expect(FIELD_CONFLICT_RULES.why_now.type).toBe("llm_synthesize");
  });
});

describe("date input flexibility", () => {
  it("accepts ISO string dates", () => {
    const current: PropertyEntry<number> = {
      value: 30000,
      source: "meeting",
      date: "2026-03-01T10:00:00Z",
      manual: false,
    };
    const incoming: PropertyEntry<number> = {
      value: 50000,
      source: "email",
      date: "2026-04-01T10:00:00Z",
      manual: false,
    };
    const r = resolveConflict("budget", current, incoming);
    expect(r.value).toBe(50000);
    expect(r.date).toBeInstanceOf(Date);
  });
});
