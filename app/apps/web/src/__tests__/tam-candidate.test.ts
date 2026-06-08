import { describe, it, expect } from "vitest";
import { normalizeDomain, orgToAddPayload } from "@/lib/tam/candidate";

describe("normalizeDomain", () => {
  it("strips protocol, www and path; lowercases", () => {
    expect(normalizeDomain("https://www.Acme.com/about")).toBe("acme.com");
    expect(normalizeDomain("HTTP://Foo.IO")).toBe("foo.io");
    expect(normalizeDomain("bar.co.uk")).toBe("bar.co.uk");
  });

  it("returns null for empty / nullish", () => {
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain(undefined)).toBeNull();
    expect(normalizeDomain("")).toBeNull();
  });
});

describe("orgToAddPayload", () => {
  it("maps an apollo org into an add-proposal payload", () => {
    const p = orgToAddPayload(
      {
        id: "a1",
        name: "Acme",
        industry: "SaaS",
        estimated_num_employees: 120,
        logo_url: "https://logo",
        country: "France",
      } as never,
      "acme.com",
    );
    expect(p).toMatchObject({
      name: "Acme",
      domain: "acme.com",
      industry: "SaaS",
      source: "apollo",
    });
    expect((p.properties as Record<string, unknown>).apollo_id).toBe("a1");
    expect((p.properties as Record<string, unknown>).country).toBe("France");
  });

  it("falls back to the domain when the org has no name", () => {
    const p = orgToAddPayload({ id: "a2" } as never, "foo.com");
    expect(p.name).toBe("foo.com");
    expect(p.industry).toBeNull();
  });
});
