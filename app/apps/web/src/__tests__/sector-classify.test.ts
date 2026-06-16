import { describe, it, expect } from "vitest";
import { classifyScriptSector } from "@/lib/call-mode/sector-classify";

describe("classifyScriptSector — crossing signals (waterfall)", () => {
  it("a health SCHOOL resolves to education: NAICS+name beat the Apollo industry", () => {
    const c = classifyScriptSector({
      name: "Haute école de santé Fribourg",
      industry: "hospital & health care", // Apollo's misleading tag
      naics: ["61131"], // colleges/universities
      icpSector: "Santé",
    });
    expect(c.key).toBe("education");
    expect(c.confidence).toBe("high"); // name(5)+naics(5)=10
    expect(c.via).toEqual(expect.arrayContaining(["code NAICS", "nom"]));
  });

  it("a real care institution stays santé (all signals agree)", () => {
    const c = classifyScriptSector({
      name: "Clinique de La Source",
      industry: "hospital & health care",
      naics: ["62211"],
      icpSector: "Santé",
    });
    expect(c.key).toBe("sante");
  });

  it("social-assistance NAICS (624) → fondations even when named a Fondation", () => {
    const c = classifyScriptSector({ name: "Fondation de Vernand", naics: ["62419"], icpSector: "Santé" });
    expect(c.key).toBe("fondations");
  });

  it("international affairs NAICS / federation name → international", () => {
    expect(classifyScriptSector({ name: "Fédération Internationale de Volleyball", industry: "international affairs" }).key).toBe("international");
    expect(classifyScriptSector({ name: "X", naics: ["928120"] }).key).toBe("international");
  });

  it("NAICS alone decides when the name is uninformative", () => {
    expect(classifyScriptSector({ name: "ACME SA", naics: ["611310"] }).key).toBe("education");
    expect(classifyScriptSector({ name: "ACME SA", naics: ["541512"] }).key).toBe("it");
    expect(classifyScriptSector({ name: "ACME SA", naics: ["236220"] }).key).toBe("low-tech");
  });

  it("our icp_sector label is used when present", () => {
    expect(classifyScriptSector({ name: "ACME SA", icpSector: "Éducation / formation" }).key).toBe("education");
  });

  it("no telling signal → generic, low confidence", () => {
    const c = classifyScriptSector({ name: "ACME SA", industry: null, naics: null });
    expect(c.key).toBe("generic");
    expect(c.confidence).toBe("low");
  });

  it("conflicting weak signals: the higher-weight one wins", () => {
    // industry says santé (+2), name says education (+5) → education
    const c = classifyScriptSector({ name: "Geneva Business School", industry: "hospital & health care" });
    expect(c.key).toBe("education");
  });
});
