import { describe, it, expect } from "vitest";
import {
  countryToIso,
  toE164,
  titleToRole,
  industryToNaics,
  techToSlug,
  employeesToRange,
} from "../normalizers";

describe("countryToIso (AC2)", () => {
  it("resolves EN/FR names, alpha-2, alpha-3, aliases", () => {
    expect(countryToIso("France")).toBe("FR");
    expect(countryToIso("Suisse")).toBe("CH");
    expect(countryToIso("Switzerland")).toBe("CH");
    expect(countryToIso("CH")).toBe("CH");
    expect(countryToIso("CHE")).toBe("CH");
    expect(countryToIso("United States of America")).toBe("US");
    expect(countryToIso("Royaume-Uni")).toBe("GB");
    expect(countryToIso("UK")).toBe("GB");
  });
  it("returns null for unknown / empty", () => {
    expect(countryToIso("Atlantis")).toBeNull();
    expect(countryToIso(null)).toBeNull();
    expect(countryToIso("")).toBeNull();
  });
});

describe("toE164 (AC2)", () => {
  it("converts national format to E.164 given a region", () => {
    expect(toE164("06 12 34 56 78", "FR")).toBe("+33612345678");
    expect(toE164("044 668 18 00", "CH")).toBe("+41446681800");
  });
  it("accepts already-E.164 and ignores the region", () => {
    expect(toE164("+33612345678")).toBe("+33612345678");
  });
  it("returns null for unparseable / empty", () => {
    expect(toE164("not a phone", "FR")).toBeNull();
    expect(toE164(null)).toBeNull();
  });
});

describe("titleToRole (AC2)", () => {
  it("maps to the canonical seniority vocab + department", () => {
    expect(titleToRole("Co-founder & CEO")).toEqual({ seniority: "founder", department: "Executive" });
    expect(titleToRole("VP of Sales")).toEqual({ seniority: "vp", department: "Sales" });
    expect(titleToRole("Software Engineer")).toEqual({ seniority: "entry", department: "Engineering" });
    expect(titleToRole("Chief Financial Officer")).toMatchObject({ seniority: "c_suite" });
  });
  it("handles empty", () => {
    expect(titleToRole(null)).toEqual({ seniority: "unknown", department: null });
  });
});

describe("industryToNaics (AC2)", () => {
  it("maps free-form industry to a NAICS sector", () => {
    expect(industryToNaics("Computer Software")?.code).toBe("51");
    expect(industryToNaics("Fintech")?.code).toBe("52");
    expect(industryToNaics("Healthcare")?.code).toBe("62");
    expect(industryToNaics("Construction")?.code).toBe("23");
  });
  it("returns null for unknown", () => {
    expect(industryToNaics("???")).toBeNull();
    expect(industryToNaics(null)).toBeNull();
  });
});

describe("techToSlug (AC2)", () => {
  it("canonicalizes known aliases and slugifies the rest", () => {
    expect(techToSlug("Next.js")).toBe("nextjs");
    expect(techToSlug("Google Analytics")).toBe("google-analytics");
    expect(techToSlug("GTM")).toBe("google-tag-manager");
    expect(techToSlug("Some New Tool")).toBe("some-new-tool");
  });
  it("returns null for empty", () => {
    expect(techToSlug(null)).toBeNull();
    expect(techToSlug("")).toBeNull();
  });
});

describe("employeesToRange (AC2)", () => {
  it("buckets counts; null for 0/empty", () => {
    expect(employeesToRange(7)).toBe("1-10");
    expect(employeesToRange(150)).toBe("101-200");
    expect(employeesToRange(50000)).toBe("10,001+");
    expect(employeesToRange(0)).toBeNull();
    expect(employeesToRange(null)).toBeNull();
  });
});
