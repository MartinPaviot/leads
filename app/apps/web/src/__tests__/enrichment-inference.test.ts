import { describe, expect, it } from "vitest";
import {
  isFreeEmailDomain,
  parseFromHeader,
  detectPatternFromSamples,
  applyEmailPattern,
  inferDepartmentFromTitle,
  inferSeniorityFromTitle,
  isDecisionMaker,
  guessLinkedInPersonUrl,
  guessLinkedInCompanyUrl,
  extractTitleFromSignature,
} from "@/lib/enrichment/inference";

describe("enrichment/inference", () => {
  describe("isFreeEmailDomain", () => {
    it("flags common free providers", () => {
      expect(isFreeEmailDomain("gmail.com")).toBe(true);
      expect(isFreeEmailDomain("yahoo.fr")).toBe(true);
      expect(isFreeEmailDomain("protonmail.com")).toBe(true);
      expect(isFreeEmailDomain("orange.fr")).toBe(true);
    });
    it("accepts corporate domains", () => {
      expect(isFreeEmailDomain("acme.com")).toBe(false);
      expect(isFreeEmailDomain("stripe.com")).toBe(false);
    });
    it("handles null/empty", () => {
      expect(isFreeEmailDomain(null)).toBe(false);
      expect(isFreeEmailDomain("")).toBe(false);
    });
  });

  describe("parseFromHeader", () => {
    it("parses a well-formed header", () => {
      const r = parseFromHeader('"John Smith" <john@acme.com>');
      expect(r).toEqual({
        firstName: "John",
        lastName: "Smith",
        email: "john@acme.com",
        domain: "acme.com",
      });
    });
    it("parses header without quotes", () => {
      const r = parseFromHeader("Marie Dupont <marie.dupont@qonto.com>");
      expect(r.firstName).toBe("Marie");
      expect(r.lastName).toBe("Dupont");
      expect(r.domain).toBe("qonto.com");
    });
    it("handles email-only header", () => {
      const r = parseFromHeader("alice@stripe.com");
      expect(r.firstName).toBeNull();
      expect(r.lastName).toBeNull();
      expect(r.email).toBe("alice@stripe.com");
      expect(r.domain).toBe("stripe.com");
    });
    it("handles multi-part last names", () => {
      const r = parseFromHeader("Jean-Pierre de la Vega <jp@bnp.fr>");
      expect(r.firstName).toBe("Jean-Pierre");
      expect(r.lastName).toBe("de la Vega");
    });
    it("handles empty header", () => {
      expect(parseFromHeader("")).toEqual({
        firstName: null,
        lastName: null,
        email: null,
        domain: null,
      });
    });
  });

  describe("detectPatternFromSamples + applyEmailPattern", () => {
    it("detects first.last with consistent samples", () => {
      const samples = [
        { firstName: "John", lastName: "Smith", localPart: "john.smith" },
        { firstName: "Jane", lastName: "Doe", localPart: "jane.doe" },
      ];
      expect(detectPatternFromSamples(samples)).toBe("first.last");
    });
    it("detects flast (no dot)", () => {
      const samples = [
        { firstName: "John", lastName: "Smith", localPart: "jsmith" },
        { firstName: "Jane", lastName: "Doe", localPart: "jdoe" },
      ];
      expect(detectPatternFromSamples(samples)).toBe("flast");
    });
    it("returns unknown with 1 sample only if no match", () => {
      const samples = [
        { firstName: "Jay", lastName: "Zed", localPart: "random" },
      ];
      expect(detectPatternFromSamples(samples)).toBe("unknown");
    });
    it("accepts 1 sample if it matches a pattern", () => {
      const samples = [
        { firstName: "Alice", lastName: "Wong", localPart: "alice.wong" },
      ];
      expect(detectPatternFromSamples(samples)).toBe("first.last");
    });
    it("applies pattern to produce an email", () => {
      expect(applyEmailPattern("first.last", "Marie", "Dupont", "qonto.com"))
        .toBe("marie.dupont@qonto.com");
      expect(applyEmailPattern("flast", "John", "Smith", "acme.com"))
        .toBe("jsmith@acme.com");
      expect(applyEmailPattern("unknown", "A", "B", "c.com")).toBeNull();
    });
    it("strips diacritics and non-alphanum from names", () => {
      expect(applyEmailPattern("first.last", "François", "Müller", "co.fr"))
        .toBe("franois.mller@co.fr"); // Accented chars stripped — conservative
    });
  });

  describe("inferDepartmentFromTitle", () => {
    it("maps common titles to departments", () => {
      expect(inferDepartmentFromTitle("VP of Engineering")).toBe("Engineering");
      expect(inferDepartmentFromTitle("Directeur Commercial")).toBe("Sales");
      expect(inferDepartmentFromTitle("Head of Product")).toBe("Product");
      expect(inferDepartmentFromTitle("Chief Financial Officer")).toBe("Finance");
      expect(inferDepartmentFromTitle("Customer Success Manager")).toBe("Customer Success");
    });
    it("returns null when no match", () => {
      expect(inferDepartmentFromTitle("Philosopher in Residence")).toBeNull();
    });
    it("handles null", () => {
      expect(inferDepartmentFromTitle(null)).toBeNull();
    });
  });

  describe("inferSeniorityFromTitle", () => {
    it("classifies founders", () => {
      expect(inferSeniorityFromTitle("Co-Founder & CEO")).toBe("founder");
      expect(inferSeniorityFromTitle("Founder")).toBe("founder");
    });
    it("classifies C-level (no founder)", () => {
      expect(inferSeniorityFromTitle("CTO")).toBe("c_level");
      expect(inferSeniorityFromTitle("Chief Marketing Officer")).toBe("c_level");
    });
    it("classifies VP/Director/Manager", () => {
      expect(inferSeniorityFromTitle("VP Sales")).toBe("vp");
      expect(inferSeniorityFromTitle("Director of Product")).toBe("director");
      expect(inferSeniorityFromTitle("Engineering Manager")).toBe("manager");
      expect(inferSeniorityFromTitle("Head of Growth")).toBe("director");
    });
    it("falls back to senior/ic", () => {
      expect(inferSeniorityFromTitle("Senior Software Engineer")).toBe("senior");
      expect(inferSeniorityFromTitle("Software Engineer")).toBe("ic");
    });
    it("returns unknown on null/empty", () => {
      expect(inferSeniorityFromTitle(null)).toBe("unknown");
      expect(inferSeniorityFromTitle("")).toBe("unknown");
    });
  });

  describe("isDecisionMaker", () => {
    it("flags c_level/founder/vp as decision makers", () => {
      expect(isDecisionMaker("c_level")).toBe(true);
      expect(isDecisionMaker("founder")).toBe(true);
      expect(isDecisionMaker("vp")).toBe(true);
    });
    it("does not flag director/manager/ic", () => {
      expect(isDecisionMaker("director")).toBe(false);
      expect(isDecisionMaker("manager")).toBe(false);
      expect(isDecisionMaker("ic")).toBe(false);
    });
  });

  describe("guessLinkedInPersonUrl", () => {
    it("builds a slug from first + last", () => {
      expect(guessLinkedInPersonUrl("Marie", "Dupont")).toBe("https://www.linkedin.com/in/marie-dupont");
    });
    it("strips diacritics", () => {
      expect(guessLinkedInPersonUrl("François", "Müller")).toBe("https://www.linkedin.com/in/francois-muller");
    });
    it("drops non-alphanum", () => {
      expect(guessLinkedInPersonUrl("Anne-Sophie", "O'Brien")).toBe("https://www.linkedin.com/in/anne-sophie-obrien");
    });
    it("returns null with missing parts", () => {
      expect(guessLinkedInPersonUrl(null, "Smith")).toBeNull();
      expect(guessLinkedInPersonUrl("John", null)).toBeNull();
    });
  });

  describe("guessLinkedInCompanyUrl", () => {
    it("builds from root domain", () => {
      expect(guessLinkedInCompanyUrl("acme.com")).toBe("https://www.linkedin.com/company/acme");
      expect(guessLinkedInCompanyUrl("www.stripe.com")).toBe("https://www.linkedin.com/company/stripe");
    });
    it("returns null for tiny or missing", () => {
      expect(guessLinkedInCompanyUrl(null)).toBeNull();
      expect(guessLinkedInCompanyUrl("a.com")).toBeNull();
    });
  });

  describe("extractTitleFromSignature", () => {
    it("finds a title line in a typical signature", () => {
      const body = `Hello team,

Please see attached.

Thanks,
John Smith
Head of Engineering
Acme Corp
john@acme.com`;
      expect(extractTitleFromSignature(body)).toBe("Head of Engineering");
    });
    it("returns null when no signature block", () => {
      expect(extractTitleFromSignature("Just a body with no signature")).toBeNull();
    });
    it("handles null", () => {
      expect(extractTitleFromSignature(null)).toBeNull();
    });
  });
});
