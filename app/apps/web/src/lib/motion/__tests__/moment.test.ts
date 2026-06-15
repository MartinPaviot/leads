import { describe, it, expect } from "vitest";
import { deriveMoment, normalizeMoment, MOMENTS } from "../moment";

describe("deriveMoment", () => {
  it("qualification stage → discovery (high)", () => {
    expect(deriveMoment({ hasDeal: true, dealStage: "qualification" })).toEqual({
      moment: "discovery",
      confidence: "high",
      source: "deal-stage",
    });
  });

  it("demo stage → demo", () => {
    expect(deriveMoment({ hasDeal: true, dealStage: "demo" }).moment).toBe("demo");
  });

  it("proposal / negotiation → proposal / close", () => {
    expect(deriveMoment({ hasDeal: true, dealStage: "proposal" }).moment).toBe("proposal");
    expect(deriveMoment({ hasDeal: true, dealStage: "negotiation" }).moment).toBe("close");
  });

  it("lead stage → outbound", () => {
    expect(deriveMoment({ hasDeal: true, dealStage: "lead" }).moment).toBe("outbound");
  });

  it("live cold dial with no deal → cold_call", () => {
    expect(deriveMoment({ hasDeal: false, liveCallMode: true }).moment).toBe("cold_call");
  });

  it("customer lifecycle → expansion (beats a stale won stage)", () => {
    expect(
      deriveMoment({ hasDeal: true, dealStage: "won", lifecycleStage: "customer" }).moment,
    ).toBe("expansion");
  });

  it("conflict: qualification stage but a demo already happened → demo (low)", () => {
    expect(
      deriveMoment({ hasDeal: true, dealStage: "qualification", hasDemoActivity: true }),
    ).toEqual({ moment: "demo", confidence: "low", source: "conflict-later" });
  });

  it("no spurious downgrade when the stage is already past demo", () => {
    const d = deriveMoment({ hasDeal: true, dealStage: "proposal", hasDemoActivity: true });
    expect(d.moment).toBe("proposal");
    expect(d.confidence).toBe("high");
  });

  it("no usable signal → discovery (low), never a confidently-wrong specialization", () => {
    expect(deriveMoment({ hasDeal: false })).toEqual({
      moment: "discovery",
      confidence: "low",
      source: "no-signal",
    });
  });

  it("NL override wins over signals", () => {
    expect(
      deriveMoment({ hasDeal: true, dealStage: "qualification", override: "demo" }),
    ).toEqual({ moment: "demo", confidence: "high", source: "override" });
  });

  it("override 'auto' is ignored, derivation resumes from signals", () => {
    expect(
      deriveMoment({ hasDeal: true, dealStage: "qualification", override: "auto" }).source,
    ).toBe("deal-stage");
  });

  it("invalid override is ignored", () => {
    expect(
      deriveMoment({ hasDeal: true, dealStage: "lead", override: "lunch" }).moment,
    ).toBe("outbound");
  });
});

describe("normalizeMoment", () => {
  it("canonical, spaced, and hyphenated variants normalize", () => {
    expect(normalizeMoment("Discovery")).toBe("discovery");
    expect(normalizeMoment("cold call")).toBe("cold_call");
    expect(normalizeMoment(" COLD-CALL ")).toBe("cold_call");
  });

  it("'auto' sentinel passes through", () => {
    expect(normalizeMoment("auto")).toBe("auto");
  });

  it("invalid input → null (no throw)", () => {
    expect(normalizeMoment("lunch")).toBeNull();
    expect(normalizeMoment("follow up")).toBeNull();
  });

  it("there are exactly 7 moments", () => {
    expect(MOMENTS).toHaveLength(7);
  });
});
