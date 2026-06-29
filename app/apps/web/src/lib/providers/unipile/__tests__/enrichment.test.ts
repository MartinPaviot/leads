import { describe, it, expect } from "vitest";
import { mapHeadcountGrowth, type UnipileCompanyProfile, type UnipileFullProfile } from "../http";
import {
  domainFromWebsite,
  sizeLabel,
  companyProfileToAccount,
  primaryIndustry,
  companyProfileExtras,
  fullProfileToContact,
  currentRole,
  seniorityFromTitle,
  confirmCompanyMatch,
  icpSegmentToPreserve,
} from "../enrichment";

// Trimmed from the LIVE GET /linkedin/company/{id} response (2026-06-29, Testbytes).
const COMPANY: UnipileCompanyProfile = {
  object: "CompanyProfile",
  name: "Software Testing and QA Company | Testbytes",
  public_identifier: "softwaretestingcompany",
  description: "Welcome to Testbytes…",
  tagline: "Making Quality A Habit",
  website: "https://www.testbytes.net/",
  industry: ["IT Services and IT Consulting"],
  employee_count: 455,
  employee_count_range: { from: 51, to: 200 },
  foundation_date: "01/01/2013",
  activities: ["Software Testing Services", "Game Testing Company", "QA Services"],
  locations: [
    { is_headquarter: false, city: "Pune", country: "IN" },
    { is_headquarter: true, city: "New York", country: "US", area: "NY", postalCode: "10006" },
  ],
  insights: {
    employeesCount: {
      totalCount: 455,
      averageTenure: "3.5 years",
      growthGraph: [
        { monthRange: 6, growthPercentage: 9 },
        { monthRange: 12, growthPercentage: 17 },
        { monthRange: 24, growthPercentage: 36 },
      ],
      employeesCountGraph: [
        { count: 335, date: "2024-06-01" },
        { count: 455, date: "2026-06-01" },
      ],
    },
  },
};

// Trimmed from the LIVE GET /users/{id}?linkedin_sections=* response (relation Emile).
const PROFILE: UnipileFullProfile = {
  provider_id: "ACoAACSveJwB-0hg7070__pISiYA6Q7mfw_Sfk0",
  public_identifier: "emile-geeraert",
  public_profile_url: "https://www.linkedin.com/in/emile-geeraert",
  first_name: "Emile",
  last_name: "Geeraert",
  headline: "Growth @ Hexa",
  summary: "I do 0 to 1 GTM…",
  location: "San Francisco Bay Area",
  is_open_profile: true,
  shared_connections_count: 70,
  network_distance: "FIRST_DEGREE",
  is_relationship: true,
  work_experience: [
    { company_id: "1934114", company: "Hexa", position: "Venture growth", start: "5/1/2026", end: null },
    { company_id: "82061147", company: "Pada1", position: "Founder & CEO", start: "12/1/2021", end: "4/1/2025" },
  ],
};

describe("domainFromWebsite", () => {
  it("strips scheme + www and lowercases", () => {
    expect(domainFromWebsite("https://www.testbytes.net/")).toBe("testbytes.net");
    expect(domainFromWebsite("Acme.IO")).toBe("acme.io");
    expect(domainFromWebsite("http://sub.example.com/x?y=1")).toBe("sub.example.com");
  });
  it("returns null on empty / unparseable", () => {
    expect(domainFromWebsite(null)).toBeNull();
    expect(domainFromWebsite("")).toBeNull();
  });
});

describe("sizeLabel", () => {
  it("prefers the headcount range", () => {
    expect(sizeLabel(COMPANY)).toBe("51-200");
  });
  it("falls back to the exact count, then null", () => {
    expect(sizeLabel({ employee_count: 12 })).toBe("12");
    expect(sizeLabel({ employee_count_range: { from: 5000 } })).toBe("5000+");
    expect(sizeLabel({})).toBeNull();
  });
});

describe("companyProfileToAccount", () => {
  it("maps the canonical writable account fields from a live company profile", () => {
    expect(companyProfileToAccount(COMPANY)).toEqual({
      name: "Software Testing and QA Company | Testbytes",
      domain: "testbytes.net",
      industry: "IT Services and IT Consulting",
      size: "51-200",
      description: "Welcome to Testbytes…",
    });
  });
});

describe("confirmCompanyMatch — gate a name search against a false bind", () => {
  it("confirms by domain, scheme/www-insensitive (wins over a name mismatch)", () => {
    expect(confirmCompanyMatch({ website: "https://www.ramp.com/", name: "Ramp" }, { domain: "ramp.com", name: "Totally Different" })).toBe("domain");
  });
  it("confirms by normalized name when no domain match", () => {
    expect(confirmCompanyMatch({ name: "Testbytes", website: "https://other.com" }, { name: "Testbytes", domain: "acme.io" })).toBe("name");
  });
  it("rejects an unrelated company (the Camouflet→Restaurants trap)", () => {
    expect(confirmCompanyMatch({ name: "Some Restaurant Group", website: "https://resto.fr" }, { name: "Camouflet", domain: "camouflet.io" })).toBe("none");
  });
  it("returns none when neither side has a comparable signal", () => {
    expect(confirmCompanyMatch({ name: "Acme" }, { domain: "acme.io" })).toBe("none");
  });
});

describe("icpSegmentToPreserve — keep the coarse ICP label off the industry column", () => {
  it("preserves the old label when the new precise industry differs", () => {
    expect(icpSegmentToPreserve("B2B SaaS", "Financial Services")).toBe("B2B SaaS");
  });
  it("returns null when nothing is worth preserving", () => {
    expect(icpSegmentToPreserve(null, "Financial Services")).toBeNull();
    expect(icpSegmentToPreserve("   ", "X")).toBeNull();
    expect(icpSegmentToPreserve("Financial Services", "Financial Services")).toBeNull();
    expect(icpSegmentToPreserve("B2B SaaS", null)).toBeNull();
  });
});

describe("industry fidelity — primary column vs full list + specialties", () => {
  it("keeps ONE primary industry for the canonical column", () => {
    expect(primaryIndustry(COMPANY)).toBe("IT Services and IT Consulting");
    expect(companyProfileToAccount(COMPANY).industry).toBe("IT Services and IT Consulting");
  });
  it("preserves the full industry list + specialties + HQ in extras (not flattened)", () => {
    const x = companyProfileExtras(COMPANY);
    expect(x.industries).toEqual(["IT Services and IT Consulting"]);
    expect(x.specialties).toEqual(["Software Testing Services", "Game Testing Company", "QA Services"]);
    expect({ city: x.hqCity, country: x.hqCountry }).toEqual({ city: "New York", country: "US" });
    expect(x.foundationDate).toBe("01/01/2013");
  });
  it("drops empties and tolerates a company with no industry/activities", () => {
    expect(companyProfileExtras({}).industries).toEqual([]);
    expect(companyProfileExtras({}).specialties).toEqual([]);
    expect(primaryIndustry({ industry: ["", "  "] })).toBeNull();
  });
});

describe("mapHeadcountGrowth — the Sales-Nav growth signal", () => {
  it("distils growth %, tenure and the newest-last series", () => {
    const g = mapHeadcountGrowth(COMPANY.insights);
    expect(g.totalCount).toBe(455);
    expect(g.averageTenure).toBe("3.5 years");
    expect(g.growth6moPct).toBe(9);
    expect(g.growth12moPct).toBe(17);
    expect(g.growth24moPct).toBe(36);
    expect(g.series.at(-1)).toEqual({ date: "2026-06-01", count: 455 });
  });
  it("is null-safe on a company with no insights", () => {
    expect(mapHeadcountGrowth(undefined)).toEqual({
      totalCount: null,
      averageTenure: null,
      growth6moPct: null,
      growth12moPct: null,
      growth24moPct: null,
      series: [],
    });
  });
});

describe("currentRole + fullProfileToContact", () => {
  it("picks the open (end==null) role as current", () => {
    expect(currentRole(PROFILE)).toEqual({ title: "Venture growth", company: "Hexa", companyId: "1934114" });
  });
  it("maps the canonical contact fields with a clean linkedin url", () => {
    expect(fullProfileToContact(PROFILE)).toEqual({
      firstName: "Emile",
      lastName: "Geeraert",
      title: "Venture growth",
      linkedinUrl: "https://www.linkedin.com/in/emile-geeraert",
    });
  });
});

describe("seniorityFromTitle", () => {
  it.each([
    ["Founder & CEO", "founder_c_suite"],
    ["Co-Founder", "founder_c_suite"],
    ["VP of Sales", "vp_head"],
    ["Head of Growth", "vp_head"],
    ["Director of Engineering", "director"],
    ["Account Manager", "manager"],
    ["Growth", "individual"],
  ])("%s → %s", (title, bucket) => {
    expect(seniorityFromTitle(title)).toBe(bucket);
  });
  it("returns null on empty", () => {
    expect(seniorityFromTitle(null)).toBeNull();
  });
});
