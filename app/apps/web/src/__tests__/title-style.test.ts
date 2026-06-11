/**
 * title-style pins the contact-title chip contract:
 *  - the tier comes ONLY from the stored Apollo seniority enum — every enum
 *    value (API snake_case form AND the ICP-picker display form) resolves to
 *    a styled tier with a tooltip label;
 *  - anything else (null, empty, free text, a job title passed by mistake)
 *    degrades to the neutral "unknown" style — no icon, no guessing, no throw.
 */
import { describe, it, expect } from "vitest";
import { seniorityStyle, SENIORITY_VOCABULARY } from "@/lib/ui/title-style";
import { JOB_SENIORITIES } from "@/lib/config/icp-constants";

describe("curated coverage", () => {
  it("covers the full Apollo seniority enum", () => {
    const missing = SENIORITY_VOCABULARY.filter((v) => seniorityStyle(v).tier === "unknown");
    expect(missing).toEqual([]);
  });

  it("covers the ICP picker display spellings", () => {
    const missing = JOB_SENIORITIES.filter((v) => seniorityStyle(v).tier === "unknown");
    expect(missing).toEqual([]);
  });

  it("every curated value gets a label and theme tokens", () => {
    for (const v of SENIORITY_VOCABULARY) {
      const s = seniorityStyle(v);
      expect(s.label).toBeTruthy();
      expect(s.color).toMatch(/^var\(--sen-/);
      expect(s.bg).toMatch(/^var\(--sen-.*-bg\)$/);
    }
  });

  it("ranks decision-makers on the exec tier", () => {
    for (const v of ["owner", "founder", "c_suite", "partner"]) {
      expect(seniorityStyle(v).tier, v).toBe("exec");
    }
    expect(seniorityStyle("director").tier).toBe("lead");
  });

  it("is case- and separator-insensitive (C-Suite ≡ c_suite)", () => {
    expect(seniorityStyle("C-Suite").tier).toBe("exec");
    expect(seniorityStyle(" VP ").tier).toBe("lead");
  });
});

describe("unknown fallback", () => {
  it("gives null/empty/out-of-enum values the neutral style with no tier label", () => {
    for (const v of [null, undefined, "", "   ", "Chief Executive Officer", "Directeur Général"]) {
      const s = seniorityStyle(v);
      expect(s.tier, String(v)).toBe("unknown");
      expect(s.label).toBeNull();
      expect(s.color).toBeTruthy();
      expect(s.bg).toBeTruthy();
    }
  });
});
