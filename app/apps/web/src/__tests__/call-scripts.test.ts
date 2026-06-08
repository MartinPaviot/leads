import { describe, it, expect } from "vitest";
import { pickCallScript, resolveCallScript } from "@/lib/call-mode/call-scripts";

describe("pickCallScript", () => {
  it("matches a sector by keyword (accent/case-insensitive)", () => {
    expect(pickCallScript("Santé / EMS").key).toBe("sante");
    expect(pickCallScript("Fondation d'utilité publique").key).toBe("fondations");
    expect(pickCallScript("Administration cantonale").key).toBe("parapublic");
    expect(pickCallScript("Industrie / manufacturing").key).toBe("low-tech");
  });

  it("falls back to generic for unknown / empty", () => {
    expect(pickCallScript("Quantum widgets").key).toBe("generic");
    expect(pickCallScript(null).key).toBe("generic");
    expect(pickCallScript("").key).toBe("generic");
  });

  it("every script carries 1-3 enjeux, qualifiers + a booking ask", () => {
    for (const s of ["Santé", "Fondation", "Public", "Industrie", "xyz"]) {
      const sc = pickCallScript(s);
      expect(sc.problems.length).toBeGreaterThanOrEqual(1);
      expect(sc.problems.length).toBeLessThanOrEqual(3);
      expect(sc.qualifiers.length).toBeGreaterThanOrEqual(1);
      expect(sc.bookingAsk.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveCallScript", () => {
  it("builds a permission-based opener with the contact name + 2-min ask", () => {
    const r = resolveCallScript({ sector: "Santé", geo: "Genève", contactName: "Mme Rochat" });
    expect(r.opener).toContain("Mme Rochat");
    expect(r.opener.toLowerCase()).toContain("deux minutes");
    expect(r.opener).toContain("Pilae");
    expect(r.opener).not.toContain("{name}");
    expect(r.problems.length).toBeGreaterThanOrEqual(1);
    // The check is asked per-enjeu ("est-ce un sujet chez vous ?"), not "ça résonne ?".
    expect(r.permissionCheck.toLowerCase()).toContain("sujet");
    // Qualifiers ride along in the guidance.
    expect(r.guidance.some((g) => g.toLowerCase().includes("qualifier"))).toBe(true);
  });

  it("uses safe fallbacks when fields are missing (clean greeting, no leftover placeholders)", () => {
    const r = resolveCallScript({});
    expect(r.opener.toLowerCase()).toContain("deux minutes");
    expect(r.opener).not.toContain("{name}");
    expect(r.opener.startsWith("Bonjour,")).toBe(true);
    expect(r.opener).not.toMatch(/\s{2,}/); // no double spaces left by the empty name
    expect(r.guidance.length).toBeGreaterThan(0);
  });
});
