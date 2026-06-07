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

  it("every script carries 1-3 problems + a booking ask", () => {
    for (const s of ["Santé", "Fondation", "Public", "Industrie", "xyz"]) {
      const sc = pickCallScript(s);
      expect(sc.problems.length).toBeGreaterThanOrEqual(1);
      expect(sc.problems.length).toBeLessThanOrEqual(3);
      expect(sc.bookingAsk.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveCallScript", () => {
  it("interpolates geo / sector / contact into the opener", () => {
    const r = resolveCallScript({ sector: "Santé", geo: "Genève", contactName: "Mme Rochat" });
    expect(r.opener).toContain("Mme Rochat");
    expect(r.opener).toContain("Genève");
    expect(r.opener).toContain("Santé");
    expect(r.problems.length).toBeGreaterThanOrEqual(1);
    expect(r.permissionCheck.toLowerCase()).toContain("résonne");
  });

  it("uses safe fallbacks when fields are missing", () => {
    const r = resolveCallScript({});
    expect(r.opener).toContain("votre secteur");
    expect(r.opener).toContain("votre région");
    expect(r.guidance.length).toBeGreaterThan(0);
  });
});
