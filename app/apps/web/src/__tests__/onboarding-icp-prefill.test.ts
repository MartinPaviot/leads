import { describe, it, expect } from "vitest";
import {
  buildIcpPrefill,
  domainToCompanyName,
  extractDomain,
} from "@/lib/onboarding/icp-prefill";

describe("extractDomain", () => {
  it("returns the domain from a normal email", () => {
    expect(extractDomain("pat@acme.io")).toBe("acme.io");
  });

  it("lowercases", () => {
    expect(extractDomain("Pat@ACME.IO")).toBe("acme.io");
  });

  it("returns null for free-mail domains", () => {
    for (const e of [
      "x@gmail.com",
      "x@outlook.com",
      "x@hotmail.com",
      "x@yahoo.com",
      "x@icloud.com",
      "x@proton.me",
      "x@protonmail.com",
    ]) {
      expect(extractDomain(e)).toBeNull();
    }
  });

  it("returns null for malformed inputs", () => {
    expect(extractDomain(null)).toBeNull();
    expect(extractDomain(undefined)).toBeNull();
    expect(extractDomain("")).toBeNull();
    expect(extractDomain("no-at-sign")).toBeNull();
    expect(extractDomain("trailing@")).toBeNull();
  });

  it("handles multi-level domains", () => {
    expect(extractDomain("ceo@startup.co.uk")).toBe("startup.co.uk");
  });
});

describe("domainToCompanyName", () => {
  it("strips www + tld", () => {
    expect(domainToCompanyName("www.acme.io")).toBe("Acme");
    expect(domainToCompanyName("acme.io")).toBe("Acme");
  });

  it("strips https:// and any path", () => {
    expect(domainToCompanyName("https://acme.io/about")).toBe("Acme");
  });

  it("capitalises only the first letter (preserves casing within)", () => {
    expect(domainToCompanyName("kPMG.com")).toBe("KPMG");
  });

  it("returns empty for empty input", () => {
    expect(domainToCompanyName("")).toBe("");
  });
});

describe("buildIcpPrefill — with company row present", () => {
  it("uses company industry when set", () => {
    const result = buildIcpPrefill({
      name: "Acme",
      domain: "acme.io",
      industry: "Developer tools",
      size: "11-50",
      description: null,
    });
    expect(result.industry).toBe("Developer tools");
    expect(result.sources.industry).toBe("company");
  });

  it("uses company size when set", () => {
    const result = buildIcpPrefill({
      name: "Acme",
      domain: "acme.io",
      industry: "Developer tools",
      size: "51-200",
      description: null,
    });
    expect(result.sizeRange).toBe("51-200 employees");
    expect(result.sources.sizeRange).toBe("company");
  });

  it("falls back to size default when company size missing", () => {
    const result = buildIcpPrefill({
      name: "Acme",
      domain: "acme.io",
      industry: "Developer tools",
      size: null,
      description: null,
    });
    expect(result.sizeRange).toBe("11-50 employees");
    expect(result.sources.sizeRange).toBe("default");
  });

  it("buyerPersona reflects the playbook for devtools", () => {
    const result = buildIcpPrefill({
      name: "Acme",
      domain: "acme.io",
      industry: "Developer tools",
      size: null,
      description: null,
    });
    expect(result.buyerPersona).toBe("Head of Engineering");
  });

  it("fintech persona", () => {
    expect(
      buildIcpPrefill({
        name: "Plaid",
        domain: "plaid.com",
        industry: "fintech payments",
        size: null,
        description: null,
      }).buyerPersona,
    ).toBe("VP Finance");
  });

  it("composes a one-line ICP referencing the company name", () => {
    const result = buildIcpPrefill({
      name: "Acme",
      domain: "acme.io",
      industry: "Developer tools",
      size: "11-50",
      description: null,
    });
    expect(result.raw).toMatch(/Developer tools/);
    expect(result.raw).toMatch(/11-50/);
    expect(result.raw).toMatch(/Head of Engineering/);
    expect(result.raw).toMatch(/Acme/);
  });
});

describe("buildIcpPrefill — without company row", () => {
  it("returns playbook-driven defaults when company is null", () => {
    const result = buildIcpPrefill(null);
    // Default playbook is b2b-saas-ops → "VP Sales"
    expect(result.buyerPersona).toBe("VP Sales");
    expect(result.industry.length).toBeGreaterThan(0);
    expect(result.sizeRange).toBe("11-50 employees");
    expect(result.sources.industry).toBe("playbook");
    expect(result.sources.sizeRange).toBe("default");
  });

  it("infers playbook from description when industry is null", () => {
    const result = buildIcpPrefill({
      name: "Foo",
      domain: "foo.io",
      industry: null,
      size: null,
      description: "We build CI/CD platform for developer teams",
    });
    expect(result.buyerPersona).toBe("Head of Engineering");
  });

  it("does not include companyName in raw when company is null", () => {
    const result = buildIcpPrefill(null);
    expect(result.raw).not.toMatch(/same shape as/);
  });
});

describe("buildIcpPrefill — output contract", () => {
  it("always returns 4 string fields plus source attributions", () => {
    const result = buildIcpPrefill(null);
    expect(typeof result.industry).toBe("string");
    expect(typeof result.sizeRange).toBe("string");
    expect(typeof result.buyerPersona).toBe("string");
    expect(typeof result.raw).toBe("string");
    expect(result.sources.industry).toMatch(/company|playbook|none/);
    expect(result.sources.sizeRange).toMatch(/company|default|none/);
    expect(result.sources.buyerPersona).toMatch(/playbook|none/);
  });
});
