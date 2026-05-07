import { describe, it, expect } from "vitest";
import { calculateFitScore, calculateContactFitScore, getGrade, GRADE_THRESHOLDS } from "@/lib/scoring/scoring";
import { parseSizeRange, parseRoleKeywords } from "@/lib/config/tenant-settings";
import { sizesToApolloRanges } from "@/lib/config/icp-constants";

// ─── Company Fit Scoring ────────────────────────────────────────────

describe("calculateFitScore", () => {
  const baseCompany = { industry: "Computer Software", name: "Acme" };
  const baseProps = {
    employee_count: 150,
    annual_revenue: 20_000_000,
    technologies: ["React", "AWS", "PostgreSQL"],
    country: "United States",
    enrichment_source: "apollo",
    linkedin_url: "https://linkedin.com/company/acme",
    total_funding: 5_000_000,
    latest_funding_stage: "Series A",
  };

  it("scores high when company matches ICP perfectly", () => {
    const icp = {
      industries: ["Computer Software"],
      sizeRange: [50, 500] as [number, number],
      geographies: ["United States"],
    };
    const { score, reasons } = calculateFitScore(baseCompany, baseProps, icp);

    expect(score).toBeGreaterThanOrEqual(70);
    expect(reasons).toContainEqual(expect.stringContaining("Industry match"));
    // Algorithm reason string is "Size match: <N> employees" when in range
    expect(reasons).toContainEqual(expect.stringContaining("Size match"));
    expect(reasons).toContainEqual(expect.stringContaining("Geography match"));
  });

  it("scores low when company doesn't match ICP", () => {
    const icp = {
      industries: ["Hospital & Health Care"],
      sizeRange: [1000, 10000] as [number, number],
      geographies: ["Japan"],
    };
    const { score } = calculateFitScore(baseCompany, baseProps, icp);

    // Industry mismatch (3), size out of range but close (10), geo mismatch (3)
    // + funding (10) + linkedin (5) + apollo (5) = ~36
    expect(score).toBeLessThan(50);
  });

  it("gives neutral scores when no ICP is set", () => {
    const { score } = calculateFitScore(baseCompany, baseProps);

    // No ICP → industry/geo/revenue ICP-pts skipped, replaced by neutral defaults.
    // Current algorithm yields ~40-60 for a fully-enriched company.
    expect(score).toBeGreaterThanOrEqual(30);
    expect(score).toBeLessThanOrEqual(60);
  });

  it("handles empty company gracefully", () => {
    const { score } = calculateFitScore({}, {});
    expect(score).toBe(0);
  });

  it("matches industry case-insensitively", () => {
    const company = { industry: "computer software" };
    const icp = { industries: ["Computer Software"] };
    const { reasons } = calculateFitScore(company, {}, icp);
    expect(reasons).toContainEqual(expect.stringContaining("Industry match"));
  });

  it("matches geography bidirectionally", () => {
    // "France" matches "France" and "United States" contains "states"
    const props = { country: "France" };
    const icp = { geographies: ["France", "Germany"] };
    const { reasons } = calculateFitScore({}, props, icp);
    expect(reasons).toContainEqual(expect.stringContaining("Geography match"));
  });

  it("gives partial score for size near range", () => {
    const props = { employee_count: 800 }; // 2x of max 500
    const icp = { sizeRange: [50, 500] as [number, number] };
    const { score } = calculateFitScore({}, props, icp);
    // Algorithm: in 0.5x-2x band → +12 (size adjacent), plus dq +1 (employee_count) = 13
    expect(score).toBe(13);
  });

  it("gives minimal score for size way out of range", () => {
    const props = { employee_count: 50000 };
    const icp = { sizeRange: [50, 500] as [number, number] };
    const { score } = calculateFitScore({}, props, icp);
    // Outside 0.5x-2x band → 0 size pts; only dq +1 from employee_count
    expect(score).toBe(1);
  });
});

// ─── Contact Fit Scoring ────────────────────────────────────────────

describe("calculateContactFitScore", () => {
  it("scores high for C-suite with matching role", () => {
    const contact = { title: "CTO" };
    const props = { seniority: "c-suite", email_status: "verified", enrichment_source: "apollo" };
    const company = { name: "Acme", score: 80 };
    const keywords = ["cto", "vp engineering"];

    const { score, grade, reasons } = calculateContactFitScore(contact, props, company, keywords);

    expect(score).toBeGreaterThanOrEqual(70);
    expect(grade).toMatch(/[AB]/);
    expect(reasons).toContainEqual(expect.stringContaining("Decision maker"));
    expect(reasons).toContainEqual(expect.stringContaining("ICP role match"));
  });

  it("scores low for junior with no role match", () => {
    const contact = { title: "Junior Developer" };
    const props = { seniority: "entry" };
    const keywords = ["cto", "vp engineering"];

    const { score, grade } = calculateContactFitScore(contact, props, null, keywords);

    expect(score).toBeLessThan(20);
    expect(grade).toMatch(/[DF]/);
  });

  it("gives neutral score when no target roles configured", () => {
    const contact = { title: "VP Sales" };
    const props = { seniority: "vp" };

    const withRoles = calculateContactFitScore(contact, props, null, ["vp sales"]);
    const withoutRoles = calculateContactFitScore(contact, props, null, []);

    // With roles should score higher due to role match bonus
    expect(withRoles.score).toBeGreaterThan(withoutRoles.score);
  });

  it("handles empty contact gracefully", () => {
    const { score, grade } = calculateContactFitScore({}, {}, null);
    expect(score).toBe(0);
    expect(grade).toBe("F");
  });
});

// ─── Tenant Settings Helpers ────────────────────────────────────────

describe("parseSizeRange", () => {
  it("parses Apollo size ranges correctly", () => {
    const result = parseSizeRange({
      targetCompanySizes: ["51-100", "101-200", "201-500"],
    });
    expect(result).toEqual([51, 500]);
  });

  it("handles ranges with commas", () => {
    const result = parseSizeRange({
      targetCompanySizes: ["1,001-2,000", "2,001-5,000"],
    });
    expect(result).toEqual([1001, 5000]);
  });

  it("handles 10,001+", () => {
    const result = parseSizeRange({
      targetCompanySizes: ["5,001-10,000", "10,001+"],
    });
    expect(result).toEqual([5001, 10001]);
  });

  it("returns null for empty", () => {
    expect(parseSizeRange({})).toBeNull();
    expect(parseSizeRange({ targetCompanySizes: [] })).toBeNull();
  });
});

describe("parseRoleKeywords", () => {
  it("parses comma-separated roles", () => {
    const result = parseRoleKeywords({ targetRoles: "VP Engineering, CTO, Head of Product" });
    expect(result).toEqual(["vp engineering", "cto", "head of product"]);
  });

  it("handles semicolons", () => {
    const result = parseRoleKeywords({ targetRoles: "CEO; Founder" });
    expect(result).toEqual(["ceo", "founder"]);
  });

  it("returns empty for no roles", () => {
    expect(parseRoleKeywords({})).toEqual([]);
    expect(parseRoleKeywords({ targetRoles: "" })).toEqual([]);
  });
});

// ─── ICP Constants ──────────────────────────────────────────────────

describe("sizesToApolloRanges", () => {
  it("converts UI sizes to Apollo API format", () => {
    expect(sizesToApolloRanges(["1-10"])).toEqual(["1,10"]);
    expect(sizesToApolloRanges(["501-1,000"])).toEqual(["501,1000"]);
    expect(sizesToApolloRanges(["1,001-2,000"])).toEqual(["1001,2000"]);
    expect(sizesToApolloRanges(["10,001+"])).toEqual(["10001,"]);
  });

  it("handles multiple ranges", () => {
    const result = sizesToApolloRanges(["11-20", "21-50", "51-100"]);
    expect(result).toEqual(["11,20", "21,50", "51,100"]);
  });
});

// ─── getGrade (shared threshold source of truth) ───────────────────

describe("getGrade", () => {
  it("maps score 65 to B (aligned with backend)", () => {
    expect(getGrade(65).grade).toBe("B");
  });

  it("maps score 92 to A+", () => {
    expect(getGrade(92).grade).toBe("A+");
  });

  it("maps exact boundaries correctly", () => {
    expect(getGrade(90).grade).toBe("A+");
    expect(getGrade(80).grade).toBe("A");
    expect(getGrade(60).grade).toBe("B");
    expect(getGrade(40).grade).toBe("C");
    expect(getGrade(20).grade).toBe("D");
    expect(getGrade(0).grade).toBe("F");
  });

  it("returns correct heat levels", () => {
    expect(getGrade(85).heat).toBe("Burning");
    expect(getGrade(65).heat).toBe("Warm");
    expect(getGrade(45).heat).toBe("Cool");
    expect(getGrade(10).heat).toBe("Cold");
  });

  it("returns no emoji at any tier (visual clichés purged in commit e03826c)", () => {
    expect(getGrade(80).icon).toBe("");
    expect(getGrade(60).icon).toBe("");
    expect(getGrade(40).icon).toBe("");
    expect(getGrade(10).icon).toBe("");
  });

  it("rounds fractional scores before grading", () => {
    expect(getGrade(79.5).grade).toBe("A"); // rounds to 80
    expect(getGrade(59.4).grade).toBe("C"); // rounds to 59
  });

  it("GRADE_THRESHOLDS is ordered descending", () => {
    for (let i = 1; i < GRADE_THRESHOLDS.length; i++) {
      expect(GRADE_THRESHOLDS[i - 1].min).toBeGreaterThan(GRADE_THRESHOLDS[i].min);
    }
  });
});
