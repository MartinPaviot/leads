import { describe, it, expect } from "vitest";
import {
  classifySignalConfidence,
  isVisibleInDefaultView,
  SIGNAL_STATE_COLORS,
} from "@/lib/signals/confidence-state";

describe("classifySignalConfidence", () => {
  it("verified URL → verified, regardless of LLM confidence", () => {
    expect(
      classifySignalConfidence({
        urlOutcome: { status: "verified", httpStatus: 200, reason: "ok" },
        llmConfidence: 0.1,
      }),
    ).toBe("verified");
    expect(
      classifySignalConfidence({
        urlOutcome: { status: "verified", httpStatus: 999, reason: "blocked_cdn" },
        llmConfidence: null,
      }),
    ).toBe("verified");
  });

  it("unverified URL → unverified, even with high LLM confidence", () => {
    // Critical anti-hallucination property: a broken URL invalidates
    // the citation. We don't let high LLM confidence rescue it.
    expect(
      classifySignalConfidence({
        urlOutcome: { status: "unverified", httpStatus: 404, reason: "http_404" },
        llmConfidence: 0.99,
      }),
    ).toBe("unverified");
  });

  it("no URL + high confidence → likely", () => {
    expect(
      classifySignalConfidence({ urlOutcome: null, llmConfidence: 0.85 }),
    ).toBe("likely");
    expect(
      classifySignalConfidence({ urlOutcome: null, llmConfidence: 0.70 }),
    ).toBe("likely"); // boundary inclusive
  });

  it("no URL + low confidence → uncertain", () => {
    expect(
      classifySignalConfidence({ urlOutcome: null, llmConfidence: 0.69 }),
    ).toBe("uncertain");
    expect(
      classifySignalConfidence({ urlOutcome: null, llmConfidence: 0 }),
    ).toBe("uncertain");
  });

  it("treats null/undefined LLM confidence as 0 → uncertain", () => {
    expect(
      classifySignalConfidence({ urlOutcome: null, llmConfidence: null }),
    ).toBe("uncertain");
    expect(
      classifySignalConfidence({ urlOutcome: null, llmConfidence: undefined }),
    ).toBe("uncertain");
  });

  it("custom likelyThreshold tunes the no-URL split", () => {
    // Stricter: 0.70 input no longer crosses 0.80.
    expect(
      classifySignalConfidence(
        { urlOutcome: null, llmConfidence: 0.75 },
        { likelyThreshold: 0.80 },
      ),
    ).toBe("uncertain");
    // Looser: 0.50 input crosses 0.40.
    expect(
      classifySignalConfidence(
        { urlOutcome: null, llmConfidence: 0.50 },
        { likelyThreshold: 0.40 },
      ),
    ).toBe("likely");
  });
});

describe("isVisibleInDefaultView", () => {
  it("includes verified and likely", () => {
    expect(isVisibleInDefaultView("verified")).toBe(true);
    expect(isVisibleInDefaultView("likely")).toBe(true);
  });

  it("hides uncertain and unverified", () => {
    expect(isVisibleInDefaultView("uncertain")).toBe(false);
    expect(isVisibleInDefaultView("unverified")).toBe(false);
  });
});

describe("SIGNAL_STATE_COLORS", () => {
  it("has a color spec for each state", () => {
    for (const state of ["verified", "likely", "uncertain", "unverified"] as const) {
      expect(SIGNAL_STATE_COLORS[state]).toBeDefined();
      expect(SIGNAL_STATE_COLORS[state].dot).toBeTruthy();
      expect(SIGNAL_STATE_COLORS[state].bg).toBeTruthy();
      expect(SIGNAL_STATE_COLORS[state].label).toBeTruthy();
    }
  });
});
