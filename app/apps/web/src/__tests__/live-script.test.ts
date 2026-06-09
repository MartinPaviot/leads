import { describe, it, expect } from "vitest";
import { deriveOpeningReason, isVoiceableSignal, REASON_BRIDGE } from "@/lib/call-mode/live-script";

describe("isVoiceableSignal", () => {
  it("accepts real-world trigger events + explicit interactions", () => {
    for (const t of ["funding", "hiring", "leadership_change", "tech_adoption", "expansion", "reply_received", "trial_expiring"]) {
      expect(isVoiceableSignal(t)).toBe(true);
    }
  });
  it("rejects internal / behavioral signals (creepy or nonsensical on a cold call)", () => {
    for (const t of ["engagement_spike", "deal_stall", "stalled_no_activity", "positive_sentiment", "usage_increase", "deal_upsell_ready"]) {
      expect(isVoiceableSignal(t)).toBe(false);
    }
    expect(isVoiceableSignal(null)).toBe(false);
    expect(isVoiceableSignal(undefined)).toBe(false);
  });
});

describe("deriveOpeningReason", () => {
  it("uses a voiceable signal as the reason", () => {
    const r = deriveOpeningReason({ signal: { type: "funding", label: "Série A levée en mai" }, hiringRole: "DSI", fundingLastRound: "Série B" });
    expect(r).toEqual({ fact: "Série A levée en mai", source: "signal", sourceLabel: "Signal temps réel" });
  });

  it("IGNORES an internal signal and falls through to a real event (the fix)", () => {
    const r = deriveOpeningReason({ signal: { type: "engagement_spike", label: "Pic d'engagement détecté" }, hiringRole: "Responsable IT" });
    expect(r?.source).toBe("hiring");
    expect(r?.fact).toBe("Recrute Responsable IT");
  });

  it("returns null when the only signal is internal and there is no event to state", () => {
    expect(deriveOpeningReason({ signal: { type: "deal_stall", label: "Deal au point mort" } })).toBeNull();
  });

  it("uses hiring before funding", () => {
    expect(deriveOpeningReason({ hiringRole: "DSI", fundingLastRound: "Série B" })).toEqual({ fact: "Recrute DSI", source: "hiring", sourceLabel: "Recrutement" });
  });

  it("uses funding when it is the only event", () => {
    const r = deriveOpeningReason({ fundingLastRound: "Série B (2026)" });
    expect(r?.source).toBe("funding");
    expect(r?.fact).toBe("Série B (2026)");
  });

  it("returns null when nothing sayable is known — never invents a reason", () => {
    expect(deriveOpeningReason({})).toBeNull();
    expect(deriveOpeningReason({ signal: null, hiringRole: "", fundingLastRound: undefined })).toBeNull();
  });

  it("collapses whitespace in the grounded fact", () => {
    const r = deriveOpeningReason({ signal: { type: "leadership_change", label: "  Nouveau   DSI\n nommé " } });
    expect(r?.fact).toBe("Nouveau DSI nommé");
  });

  it("keeps the bridge a fixed, content-free connector", () => {
    expect(REASON_BRIDGE).toMatch(/pour ça que je vous appelle/i);
    expect(REASON_BRIDGE.endsWith(":")).toBe(true);
  });
});
