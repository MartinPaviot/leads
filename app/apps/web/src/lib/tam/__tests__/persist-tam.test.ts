import { describe, it, expect } from "vitest";
import { passesFundingStage, tamCompanyToAccountInput, tamPersonToContactInput } from "../persist-tam";
import type { TamBuilderOutput } from "@/skills/enrichment/tam-builder/schema";

const company = (over: Partial<TamBuilderOutput["companies"][number]> = {}): TamBuilderOutput["companies"][number] => ({
  apolloId: "org_1",
  name: "Acme",
  domain: "acme.com",
  industry: "Software",
  employeeCount: 42,
  annualRevenue: 5_000_000,
  fundingStage: "Series A",
  city: "Paris",
  country: "France",
  score: 80,
  tier: 1,
  ...over,
});

const person = (over: Partial<TamBuilderOutput["watchlist"][number]> = {}): TamBuilderOutput["watchlist"][number] => ({
  apolloId: "person_1",
  name: "Jane Doe",
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@acme.com",
  title: "CEO",
  seniority: "c_suite",
  linkedinUrl: "https://www.LinkedIn.com/in/Jane-Doe/",
  companyName: "Acme",
  companyDomain: "acme.com",
  ...over,
});

describe("passesFundingStage (the Elevay ICP funding gate)", () => {
  it("no gate => everything passes", () => {
    expect(passesFundingStage("Series B", [])).toBe(true);
    expect(passesFundingStage(null, [])).toBe(true);
  });
  it("keeps seed / series a, drops the rest", () => {
    expect(passesFundingStage("Seed", ["seed", "series a"])).toBe(true);
    expect(passesFundingStage("Series A", ["seed", "series a"])).toBe(true);
    expect(passesFundingStage("Series B", ["seed", "series a"])).toBe(false);
    expect(passesFundingStage(null, ["seed", "series a"])).toBe(false);
  });
});

describe("canonical mappers (provider=apollo, vendor ids)", () => {
  it("tamCompanyToAccountInput maps the column-bound fields + apollo vendor id", () => {
    expect(tamCompanyToAccountInput(company())).toEqual({
      name: "Acme",
      domain: "acme.com",
      industry: "Software",
      provider: "apollo",
      vendorIds: { apollo: "org_1" },
    });
  });

  it("tamPersonToContactInput normalizes linkedin_url (dedup key) + carries email/companyId", () => {
    expect(tamPersonToContactInput(person(), "company-123")).toEqual({
      email: "jane@acme.com",
      linkedinUrl: "linkedin.com/in/jane-doe",
      firstName: "Jane",
      lastName: "Doe",
      title: "CEO",
      companyId: "company-123",
      provider: "apollo",
      vendorIds: { apollo: "person_1" },
    });
  });

  it("a person with no linkedin_url still maps (email-only identity)", () => {
    const m = tamPersonToContactInput(person({ linkedinUrl: null }), undefined);
    expect(m.linkedinUrl).toBeUndefined();
    expect(m.email).toBe("jane@acme.com");
  });
});
