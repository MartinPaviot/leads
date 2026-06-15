import { describe, it, expect } from "vitest";
import {
  phoneGeo,
  computeReachability,
  reachStateLabel,
} from "@/lib/calllist/reachability";

const NOW = new Date("2026-06-15T12:00:00Z");
const labels = (i: Parameters<typeof computeReachability>[0]) =>
  computeReachability({ now: NOW, ...i }).facts.map((f) => f.label);

describe("phoneGeo", () => {
  it("recognises a Swiss E.164 mobile", () => {
    const g = phoneGeo("+41 79 658 97 85");
    expect(g).toMatchObject({ hasNumber: true, isCH: true, cc: "41" });
  });
  it("recognises a Swiss national 07x number without +", () => {
    expect(phoneGeo("0791234567").isCH).toBe(true);
  });
  it("labels common foreign codes in French", () => {
    expect(phoneGeo("+33 6 49 11 99 21")).toMatchObject({ isCH: false, cc: "33", countryLabel: "français" });
    expect(phoneGeo("+39 347 540 9538").countryLabel).toBe("italien");
  });
  it("flags an unknown foreign code as non-CH without a label", () => {
    const g = phoneGeo("+7946600-69-41");
    expect(g.isCH).toBe(false);
    expect(g.countryLabel).toBeNull();
  });
  it("treats a too-short string as no number", () => {
    expect(phoneGeo("12345").hasNumber).toBe(false);
    expect(phoneGeo("").hasNumber).toBe(false);
    expect(phoneGeo(null).hasNumber).toBe(false);
  });
});

describe("computeReachability", () => {
  it("a Swiss direct mobile + verified role = joignable", () => {
    const r = computeReachability({
      now: NOW,
      phone: "+41 79 658 97 85",
      accessibilityScore: 0.9,
      roleVerification: { status: "confirmed", at: "2026-06-13T12:00:00Z", title: null, company: null },
      lastEnrichedAt: "2026-06-14T12:00:00Z",
    });
    expect(r.state).toBe("joignable");
    expect(r.facts[0]).toMatchObject({ tone: "good", label: "Mobile suisse" });
    expect(r.facts.some((f) => f.label.startsWith("Poste vérifié"))).toBe(true);
    expect(r.facts.some((f) => f.label.startsWith("Coordonnées via Elevay"))).toBe(true);
  });

  it("a low accessibility score flags a likely switchboard", () => {
    const r = computeReachability({ now: NOW, phone: "+41 22 555 00 00", accessibilityScore: 0.3 });
    expect(r.state).toBe("a_verifier");
    expect(r.facts[0].label).toBe("Numéro suisse — standard probable");
  });

  it("a foreign number is flagged for a look", () => {
    expect(labels({ phone: "+33 6 49 11 99 21" })[0]).toBe("Numéro français (hors-CH)");
    expect(computeReachability({ now: NOW, phone: "+33 6 49 11 99 21" }).state).toBe("a_verifier");
  });

  it("no number = sans_mobile", () => {
    const r = computeReachability({ now: NOW, phone: null });
    expect(r.state).toBe("sans_mobile");
    expect(r.facts[0]).toMatchObject({ tone: "muted", label: "Pas de mobile" });
  });

  it("a left role downgrades even a good Swiss mobile", () => {
    const r = computeReachability({
      now: NOW,
      phone: "+41 79 658 97 85",
      accessibilityScore: 0.9,
      roleVerification: { status: "left", at: "2026-06-10T12:00:00Z", title: "CFO", company: "Ailleurs SA" },
    });
    expect(r.state).toBe("a_verifier");
    expect(r.facts.some((f) => f.label === "A quitté ce poste")).toBe(true);
  });

  it("never names a vendor in provenance", () => {
    const all = computeReachability({
      now: NOW,
      phone: "+41 79 000 00 00",
      lastEnrichedAt: "2026-06-14T12:00:00Z",
    }).facts.map((f) => f.label).join(" ");
    expect(all.toLowerCase()).not.toMatch(/apollo|fullenrich|lusha|kaspr/);
    expect(all).toContain("via Elevay");
  });

  it("reachStateLabel is human", () => {
    expect(reachStateLabel("joignable")).toBe("Joignable");
    expect(reachStateLabel("a_verifier")).toBe("À vérifier");
    expect(reachStateLabel("sans_mobile")).toBe("Sans mobile");
  });
});
