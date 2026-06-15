import { describe, it, expect } from "vitest";
import {
  resolveMoment,
  callTypeToMoment,
  hasDiscoveryTraces,
  momentInstructions,
} from "../moment-resolution";
import { MOMENTS, type Moment } from "@/lib/motion/moment";

describe("resolveMoment — precedence", () => {
  it("explicit input.moment wins over everything", () => {
    expect(
      resolveMoment({
        inputMoment: "proposal",
        momentHint: "demo",
        callType: "discovery",
        dealOverride: "close",
        hasDeal: true,
        dealStage: "qualification",
      }),
    ).toBe("proposal");
  });

  it("NL hint (extracted by the chat, canonicalized here) beats override and derived stage", () => {
    // The chat LLM maps the user's sentence to a moment word; normalizeMoment
    // canonicalizes case/spacing ("Demo", "cold call") but is otherwise strict.
    expect(
      resolveMoment({
        momentHint: "Demo",
        dealOverride: "close",
        hasDeal: true,
        dealStage: "qualification",
      }),
    ).toBe("demo");
  });

  it("deal override beats the derived stage", () => {
    expect(
      resolveMoment({ dealOverride: "demo", hasDeal: true, dealStage: "qualification" }),
    ).toBe("demo");
  });

  it("derives from the deal stage when no input/hint/override", () => {
    expect(resolveMoment({ hasDeal: true, dealStage: "negotiation" })).toBe("close");
    expect(resolveMoment({ hasDeal: true, dealStage: "qualification" })).toBe("discovery");
  });

  it("falls back to legacy callType only when there is no signal", () => {
    expect(resolveMoment({ hasDeal: false, callType: "demo" })).toBe("demo");
  });

  it("'auto' hint is ignored, derivation resumes", () => {
    expect(
      resolveMoment({ momentHint: "auto", hasDeal: true, dealStage: "proposal" }),
    ).toBe("proposal");
  });
});

describe("callTypeToMoment", () => {
  it("maps legacy types; follow_up/unknown → null", () => {
    expect(callTypeToMoment("discovery")).toBe("discovery");
    expect(callTypeToMoment("demo")).toBe("demo");
    expect(callTypeToMoment("negotiation")).toBe("close");
    expect(callTypeToMoment("close")).toBe("close");
    expect(callTypeToMoment("follow_up")).toBeNull();
    expect(callTypeToMoment(undefined)).toBeNull();
  });
});

describe("hasDiscoveryTraces — guards the no-discovery-no-demo refuse", () => {
  it("true when any trace exists (value / close date / summary / competitors / decision maker)", () => {
    expect(hasDiscoveryTraces({ value: 50000 })).toBe(true);
    expect(hasDiscoveryTraces({ expectedCloseDate: new Date() })).toBe(true);
    expect(hasDiscoveryTraces({ summary: "Met, mapped budget and timeline." })).toBe(true);
    expect(hasDiscoveryTraces({ properties: { competitors: ["Acme"] } })).toBe(true);
    expect(hasDiscoveryTraces({ properties: { decisionMakerContactId: "c1" } })).toBe(true);
  });

  it("false for a bare or missing deal (would refuse a demo)", () => {
    expect(hasDiscoveryTraces(null)).toBe(false);
    expect(hasDiscoveryTraces({})).toBe(false);
    expect(hasDiscoveryTraces({ value: null, summary: "  ", properties: {} })).toBe(false);
    expect(hasDiscoveryTraces({ properties: { competitors: [] } })).toBe(false);
  });
});

describe("momentInstructions — specialized + house-rule clean", () => {
  it("each moment has its own instructions", () => {
    for (const moment of MOMENTS) {
      expect(momentInstructions(moment).length).toBeGreaterThan(0);
    }
  });

  it("discovery demands the quantifying-question discipline", () => {
    expect(momentInstructions("discovery")).toContain("11 to 14");
  });

  it("demo demands 3 pain-mapped capabilities and the no-discovery block rule", () => {
    const d = momentInstructions("demo");
    expect(d).toContain("EXACTLY 3 capabilities");
    expect(d).toContain("No discovery captured");
  });

  it("close arms the champion", () => {
    expect(momentInstructions("close").toLowerCase()).toContain("champion");
  });

  it("no emoji in any moment's instructions (house rule)", () => {
    // Surrogate-pair range catches pictographic emoji.
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const moment of MOMENTS) {
      expect(emoji.test(momentInstructions(moment)), `moment ${moment}`).toBe(false);
    }
  });
});
