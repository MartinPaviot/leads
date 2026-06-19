import { describe, it, expect } from "vitest";
import { classifyNoise, type NoiseInput } from "@/lib/inbox/noise";

function input(over: Partial<NoiseInput>): NoiseInput {
  return {
    isMachineSent: false,
    isBulk: false,
    generalIntent: "fyi_update",
    replyWorthy: false,
    importanceTier: 2,
    hasPriorHumanReply: false,
    overridden: false,
    ...over,
  };
}

describe("classifyNoise — KEEP guards (cardinal sin: never demote real human mail)", () => {
  it("override wins over every signal, including machine-sent", () => {
    expect(classifyNoise(input({ overridden: true, isMachineSent: true, isBulk: true })).noise).toBe(false);
  });
  it("reply-worthy human mail is never noise, even bulk-flagged + bottom-tier", () => {
    expect(classifyNoise(input({ replyWorthy: true, isBulk: true, importanceTier: 4 })).noise).toBe(false);
  });
  it("a prior 1:1 relationship keeps the thread", () => {
    expect(classifyNoise(input({ hasPriorHumanReply: true, isBulk: true, importanceTier: 4 })).noise).toBe(false);
  });
});

describe("classifyNoise — demotion signals", () => {
  it("machine-sent → noise", () => {
    expect(classifyNoise(input({ isMachineSent: true })).noise).toBe(true);
  });
  it("the four no-reply intents → noise", () => {
    for (const intent of ["promotion_newsletter", "notification", "automated_no_reply", "receipt_confirmation"] as const) {
      expect(classifyNoise(input({ generalIntent: intent })).noise, intent).toBe(true);
    }
  });
  it("bulk + not reply-worthy → noise", () => {
    expect(classifyNoise(input({ isBulk: true, generalIntent: "question" })).noise).toBe(true);
  });
  it("bottom-tier + cold + not reply-worthy → noise", () => {
    expect(classifyNoise(input({ importanceTier: 4 })).noise).toBe(true);
  });
});

describe("classifyNoise — OTP/invoice divergence (keep time-sensitive codes)", () => {
  it("invoice_billing (human, normal importance) is NOT demoted by the intent gate", () => {
    expect(classifyNoise(input({ generalIntent: "invoice_billing", importanceTier: 2 })).noise).toBe(false);
  });
  it("security_account (human, normal importance) is NOT demoted by the intent gate", () => {
    expect(classifyNoise(input({ generalIntent: "security_account", importanceTier: 2 })).noise).toBe(false);
  });
  it("a promotion at the same spot IS demoted (proves the set is narrower)", () => {
    expect(classifyNoise(input({ generalIntent: "promotion_newsletter", importanceTier: 2 })).noise).toBe(true);
  });
});

describe("classifyNoise — default recall bias", () => {
  it("ambiguous human mail (not machine, not bulk, mid-tier) is kept", () => {
    expect(classifyNoise(input({ generalIntent: "fyi_update", importanceTier: 2 })).noise).toBe(false);
    expect(classifyNoise(input({ generalIntent: null, importanceTier: 3 })).noise).toBe(false);
  });
  it("a reply-worthy thread is never noise across signal combinations", () => {
    for (const tier of [1, 2, 3, 4] as const) {
      for (const isBulk of [true, false]) {
        expect(classifyNoise(input({ replyWorthy: true, importanceTier: tier, isBulk })).noise).toBe(false);
      }
    }
  });
});
