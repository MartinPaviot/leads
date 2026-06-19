import { describe, it, expect } from "vitest";
import {
  parseInstitutionVerdicts,
  formatCompanyLine,
  buildInstitutionPrompt,
  type CompanyToClassify,
} from "@/lib/icp/institution-classifier-core";

describe("parseInstitutionVerdicts", () => {
  const refToId = new Map<number, string>([
    [1, "id-a"],
    [2, "id-b"],
    [3, "id-c"],
  ]);

  it("maps refs to company ids", () => {
    const out = parseInstitutionVerdicts(
      [
        { ref: 1, isInstitution: true, kind: "ngo", confidence: 0.9 },
        { ref: 2, isInstitution: false, kind: "commercial", confidence: 0.8 },
      ],
      refToId,
    );
    expect(out.get("id-a")).toEqual({ isInstitution: true, kind: "ngo", confidence: 0.9 });
    expect(out.get("id-b")).toEqual({ isInstitution: false, kind: "commercial", confidence: 0.8 });
  });

  it("drops hallucinated refs (out of range)", () => {
    const out = parseInstitutionVerdicts(
      [{ ref: 99, isInstitution: true, kind: "ngo", confidence: 1 }],
      refToId,
    );
    expect(out.size).toBe(0);
  });

  it("collapses an unknown kind string to unknown + not-an-institution", () => {
    const out = parseInstitutionVerdicts(
      [{ ref: 1, isInstitution: true, kind: "charity_lol", confidence: 0.7 }],
      refToId,
    );
    expect(out.get("id-a")).toEqual({ isInstitution: false, kind: "unknown", confidence: 0.7 });
  });

  it("forces isInstitution=false when kind is commercial even if the model said true", () => {
    const out = parseInstitutionVerdicts(
      [{ ref: 1, isInstitution: true, kind: "commercial", confidence: 0.6 }],
      refToId,
    );
    expect(out.get("id-a")?.isInstitution).toBe(false);
  });

  it("clamps confidence to [0,1] and tolerates junk", () => {
    const out = parseInstitutionVerdicts(
      [
        { ref: 1, isInstitution: true, kind: "ngo", confidence: 5 },
        { ref: 2, isInstitution: true, kind: "igo_un", confidence: Number.NaN },
      ],
      refToId,
    );
    expect(out.get("id-a")?.confidence).toBe(1);
    expect(out.get("id-b")?.confidence).toBe(0);
  });

  it("leaves an unanswered company absent (unresolved, not a negative)", () => {
    const out = parseInstitutionVerdicts(
      [{ ref: 1, isInstitution: true, kind: "ngo", confidence: 0.9 }],
      refToId,
    );
    expect(out.has("id-c")).toBe(false);
  });

  it("handles undefined results", () => {
    expect(parseInstitutionVerdicts(undefined, refToId).size).toBe(0);
  });
});

describe("formatCompanyLine / buildInstitutionPrompt", () => {
  const company: CompanyToClassify = {
    id: "x",
    name: "World Gymnastics",
    industry: "sports",
    domain: "gymnastics.sport",
    description: "  International   federation governing the sport of gymnastics worldwide. ".repeat(5),
  };

  it("renders ref, name, industry, domain and a truncated about", () => {
    const line = formatCompanyLine(7, company);
    expect(line).toContain("[7] World Gymnastics");
    expect(line).toContain("industry: sports");
    expect(line).toContain("domain: gymnastics.sport");
    expect(line).toContain("about:");
    // about is collapsed + capped at 160 chars
    const about = line.split("about: ")[1];
    expect(about.length).toBeLessThanOrEqual(160);
    expect(about).not.toMatch(/\s{2,}/);
  });

  it("omits about when there is no description and tolerates null fields", () => {
    const line = formatCompanyLine(1, { id: "y", name: null, industry: null, domain: null });
    expect(line).toContain("[1] (no name)");
    expect(line).toContain("industry: ?");
    expect(line).toContain("domain: ?");
    expect(line).not.toContain("about:");
  });

  it("prompt lists every company and states the core rule", () => {
    const prompt = buildInstitutionPrompt([
      { ref: 1, company },
      { ref: 2, company: { id: "z", name: "Acme Bank", industry: "banking", domain: "acme.com" } },
    ]);
    expect(prompt).toContain("[1] World Gymnastics");
    expect(prompt).toContain("[2] Acme Bank");
    expect(prompt).toContain("INTERNATIONAL INSTITUTION");
    expect(prompt).toContain("isInstitution=false");
  });
});
