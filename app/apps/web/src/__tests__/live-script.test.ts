import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  deriveOpeningReason,
  isVoiceableSignal,
  INTERNAL_SIGNAL_TYPES,
  mergeTechStacks,
  REASON_BRIDGE,
} from "@/lib/call-mode/live-script";

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

  it("dates the funding reason so an old round is never presented as current", () => {
    const r = deriveOpeningReason({ fundingLastRound: "Série B", fundingDate: "2026" });
    expect(r?.fact).toBe("Série B (2026)");
  });

  it("ignores the dossier's 'Unknown' date marker and avoids double-dating", () => {
    expect(deriveOpeningReason({ fundingLastRound: "Série B", fundingDate: "Unknown" })?.fact).toBe("Série B");
    expect(deriveOpeningReason({ fundingLastRound: "Série B (2026)", fundingDate: "2026" })?.fact).toBe("Série B (2026)");
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

describe("mergeTechStacks", () => {
  it("unions dossier + enriched, dossier order first", () => {
    expect(mergeTechStacks(["Salesforce", "SAP"], ["WordPress", "HubSpot"])).toEqual([
      "Salesforce",
      "SAP",
      "WordPress",
      "HubSpot",
    ]);
  });

  it("dedupes case-insensitively (keeps the first spelling)", () => {
    expect(mergeTechStacks(["WordPress"], ["wordpress", "Wix"])).toEqual(["WordPress", "Wix"]);
  });

  it("handles null/empty sides and blank entries", () => {
    expect(mergeTechStacks(null, ["Wix", " ", ""])).toEqual(["Wix"]);
    expect(mergeTechStacks(undefined, undefined)).toEqual([]);
  });

  it("caps the merged list", () => {
    const many = Array.from({ length: 20 }, (_, i) => `T${i}`);
    expect(mergeTechStacks(many, []).length).toBe(12);
  });
});

// ── Drift guard ─────────────────────────────────────────────────
// Every signal type a producer can emit must be EXPLICITLY classified:
// voiceable (sayable as a reason to call) XOR internal (never voiced).
// Reads the producers' zod enums from source so adding a new type without
// classifying it here fails CI instead of silently leaking into the script.
describe("signal-type classification covers every producer type", () => {
  const SCHEMAS = [
    "src/skills/signals/signal-scanner/schema.ts",
    "src/skills/signals/expansion-signal-spotter/schema.ts",
  ];

  function producerTypes(): string[] {
    const out = new Set<string>();
    for (const path of SCHEMAS) {
      const src = readFileSync(path, "utf8");
      // Tolerate the z.array( wrapper: scanner declares z.array(z.enum([...])).
      const enums = src.match(/signalTypes?:\s*z\s*\.(?:array\(\s*z\s*\.)?enum\(\[([\s\S]*?)\]/g) ?? [];
      for (const block of enums) {
        for (const lit of block.match(/"([^"]+)"/g) ?? []) out.add(lit.slice(1, -1));
      }
    }
    // The campaign queue's synthesized cadence breadcrumb.
    out.add("call");
    return [...out];
  }

  it("classifies every type exactly once (voiceable XOR internal)", () => {
    const types = producerTypes();
    expect(types.length).toBeGreaterThanOrEqual(13); // scanner 8 + spotter 5 (+ call)
    const unclassified = types.filter((t) => isVoiceableSignal(t) === INTERNAL_SIGNAL_TYPES.has(t));
    expect(unclassified).toEqual([]);
  });
});
