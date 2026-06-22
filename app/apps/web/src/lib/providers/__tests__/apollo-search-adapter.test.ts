import { describe, it, expect } from "vitest";
import { apolloCompanySearchAdapter as a } from "../apollo/search-adapter";
import type { OrgSearchOrganization } from "@/lib/integrations/apollo-client";

// Recorded Apollo search response fixture (no live call in CI — eval.md).
const FIXTURE: OrgSearchOrganization = {
  id: "5f1a2b3c",
  name: "Acme SAS",
  website_url: "https://www.acme.fr",
  linkedin_url: "https://linkedin.com/company/acme",
  primary_domain: "acme.fr",
  industry: "Computer Software",
  keywords: ["saas", "b2b"],
  estimated_num_employees: 150,
  annual_revenue: 12_000_000,
  total_funding: 5_000_000,
  total_funding_printed: "$5M",
  latest_funding_stage: "Series A",
  latest_funding_raised_at: "2026-01-15",
  founded_year: 2019,
  technology_names: ["Next.js", "Google Analytics", "HubSpot"],
  city: "Paris",
  state: "Île-de-France",
  country: "France",
  description: "B2B SaaS for founders.",
  logo_url: "https://logo.clearbit.com/acme.fr",
  investor_names: ["Partech"],
  num_current_job_openings: 4,
};

describe("ApolloCompanySearchAdapter — port contract (AC1/AC3)", () => {
  it("exposes the five port members + capabilities + cost + limiter", () => {
    expect(a.name).toBe("apollo");
    expect(typeof a.toProviderRequest).toBe("function");
    expect(typeof a.fromProviderResponse).toBe("function");
    expect(typeof a.confidenceFor).toBe("function");
    expect(a.capabilities.operations).toContain("company.search");
    expect(a.costModel.flatSubscription).toBe(true);
    expect(typeof a.limiter.acquire).toBe("function");
  });

  it("toProviderRequest maps the neutral query to Apollo params", () => {
    const req = a.toProviderRequest({
      name: "Acme",
      keywords: ["saas"],
      employees: { min: 50, max: 200 },
      locations: ["FR"],
      technologies: ["nextjs"],
      domains: ["acme.fr"],
      perPage: 25,
    });
    expect(req.q_organization_name).toBe("Acme");
    expect(req.q_organization_keyword_tags).toEqual(["saas"]);
    expect(req.organization_num_employees_ranges).toEqual(["50,200"]);
    expect(req.organization_locations).toEqual(["FR"]);
    expect(req.currently_using_any_of_technology_uids).toEqual(["nextjs"]);
    expect(req.q_organization_domains_list).toEqual(["acme.fr"]);
    expect(req.per_page).toBe(25);
  });

  it("fromProviderResponse normalizes into EnrichedCompany (country ISO, tech slugs, size range)", () => {
    const out = a.fromProviderResponse(FIXTURE);
    expect(out.domain).toBe("acme.fr");
    expect(out.name).toBe("Acme SAS");
    expect(out.country).toBe("FR"); // normalized from "France"
    expect(out.sizeRange).toBe("101-200"); // derived from 150
    expect(out.technologies).toEqual(["nextjs", "google-analytics", "hubspot"]); // slugged
    expect(out.fundingStage).toBe("Series A");
    expect(out.investors).toEqual(["Partech"]);
  });

  it("keeps vendor fields out of the neutral output except the forensic `raw` (AC3)", () => {
    const out = a.fromProviderResponse(FIXTURE);
    // No Apollo-shaped keys leak onto the neutral object.
    expect(out).not.toHaveProperty("estimated_num_employees");
    expect(out).not.toHaveProperty("primary_domain");
    expect(out).not.toHaveProperty("technology_names");
    // raw is the only place the vendor payload survives.
    expect((out.raw as unknown as OrgSearchOrganization).id).toBe("5f1a2b3c");
  });

  it("confidenceFor scores present fields and zeroes absent ones", () => {
    const out = a.fromProviderResponse(FIXTURE);
    expect(a.confidenceFor("domain", out)).toBeGreaterThan(0.9);
    expect(a.confidenceFor("country", out)).toBeCloseTo(0.7);
    expect(a.confidenceFor("revenueRange", out)).toBe(0); // null in output
  });
});

describe("ApolloCompanySearchAdapter — async capability (AC4)", () => {
  it("declares async + registers a webhook URL with the correlation id", () => {
    expect(a.capabilities.async).toBe(true);
    const reg = a.registerWebhook!({ baseUrl: "https://elevay.dev", correlationId: "contact_42" });
    expect(reg.url).toContain("https://elevay.dev/api/webhooks/apollo");
    expect(reg.url).toContain("cid=contact_42");
    expect(reg.correlationId).toBe("contact_42");
  });

  it("reconcile maps a webhook payload back to the neutral shape, or null", async () => {
    const ok = await a.reconcile!({ organization: FIXTURE }, { tenantId: "t1" });
    expect(ok?.domain).toBe("acme.fr");
    const miss = await a.reconcile!({ nothing: true }, { tenantId: "t1" });
    expect(miss).toBeNull();
  });
});
