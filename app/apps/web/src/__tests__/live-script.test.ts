import { describe, it, expect } from "vitest";
import { deriveOpeningReason, REASON_BRIDGE } from "@/lib/call-mode/live-script";

describe("deriveOpeningReason", () => {
  it("prefers a live signal over every other source", () => {
    const r = deriveOpeningReason({
      signalLabel: "Essai expirant dans 3 jours",
      messagingAngle: "Réduire le coût logiciel",
      hiringRole: "Responsable IT",
      fundingLastRound: "Série A",
    });
    expect(r).toEqual({
      fact: "Essai expirant dans 3 jours",
      source: "signal",
      sourceLabel: "Signal temps réel",
    });
  });

  it("falls back to the research angle when there is no signal", () => {
    const r = deriveOpeningReason({
      messagingAngle: "Vous payez plusieurs SaaS remplaçables",
      hiringRole: "Responsable IT",
    });
    expect(r?.source).toBe("research");
    expect(r?.fact).toBe("Vous payez plusieurs SaaS remplaçables");
  });

  it("uses hiring before funding", () => {
    const r = deriveOpeningReason({ hiringRole: "DSI", fundingLastRound: "Série B" });
    expect(r).toEqual({ fact: "Recrute DSI", source: "hiring", sourceLabel: "Recrutement" });
  });

  it("uses funding when it is the only grounded fact", () => {
    const r = deriveOpeningReason({ fundingLastRound: "Série B (2026)" });
    expect(r?.source).toBe("funding");
    expect(r?.fact).toBe("Série B (2026)");
  });

  it("returns null when nothing is grounded — never invents a reason", () => {
    expect(deriveOpeningReason({})).toBeNull();
    expect(
      deriveOpeningReason({ signalLabel: "  ", messagingAngle: "", hiringRole: null, fundingLastRound: undefined }),
    ).toBeNull();
  });

  it("collapses whitespace in the grounded fact", () => {
    const r = deriveOpeningReason({ signalLabel: "  Nouveau   DSI\n nommé " });
    expect(r?.fact).toBe("Nouveau DSI nommé");
  });

  it("keeps the bridge a fixed, content-free connector", () => {
    expect(REASON_BRIDGE).toMatch(/pour ça que je vous appelle/i);
    expect(REASON_BRIDGE.endsWith(":")).toBe(true);
  });
});
