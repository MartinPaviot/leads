import { describe, it, expect } from "vitest";
import { companyIsKnowable, isKnowlessStub } from "@/lib/companies/knowable";

describe("companyIsKnowable", () => {
  it("is knowable with a domain (enrichable)", () => {
    expect(companyIsKnowable({ domain: "siop-online.org" })).toBe(true);
  });

  it("is knowable with a firmographic column even without a domain", () => {
    expect(companyIsKnowable({ industry: "Nonprofit Organization Management" })).toBe(true);
    expect(companyIsKnowable({ size: "51-200" })).toBe(true);
    expect(companyIsKnowable({ revenue: "1000000" })).toBe(true);
  });

  it("is knowable with a firmographic in properties (country/state/employee_count)", () => {
    expect(companyIsKnowable({ properties: { country: "Switzerland" } })).toBe(true);
    expect(companyIsKnowable({ properties: { state: "Geneva" } })).toBe(true);
    expect(companyIsKnowable({ properties: { employee_count: 120 } })).toBe(true);
  });

  it("is NOT knowable with no domain and no firmographic (the stub case)", () => {
    expect(companyIsKnowable({ properties: { apollo_id: "x", source: "apollo" } })).toBe(false);
    expect(companyIsKnowable({ domain: "", industry: "" })).toBe(false);
    expect(companyIsKnowable({})).toBe(false);
    expect(isKnowlessStub({ properties: { apollo_id: "x" } })).toBe(true);
  });

  it("treats whitespace/empty strings as absent", () => {
    expect(companyIsKnowable({ domain: "   ", industry: "  " })).toBe(false);
    expect(companyIsKnowable({ properties: { country: "" } })).toBe(false);
  });
});
