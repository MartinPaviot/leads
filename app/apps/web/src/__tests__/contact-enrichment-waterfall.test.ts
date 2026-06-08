import { describe, it, expect, beforeEach, vi } from "vitest";
import { enrichContact } from "@/lib/providers/contact-enrichment/waterfall";
import {
  registerContactProvider,
  resetContactRegistryForTest,
} from "@/lib/providers/contact-enrichment/registry";
import { deriveContactGeo } from "@/lib/providers/contact-enrichment/types";
import type {
  ContactEnrichInput,
  ContactEnrichmentProvider,
  EnrichedContact,
} from "@/lib/providers/contact-enrichment/types";
import { enrichPerson } from "@/lib/integrations/apollo-client";

// The waterfall calls enrichPerson directly for the apolloId identity reveal;
// stub just that export, keep the rest real.
vi.mock("@/lib/integrations/apollo-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/apollo-client")>();
  return { ...actual, enrichPerson: vi.fn() };
});
const mockedEnrichPerson = vi.mocked(enrichPerson);

const ctx = { tenantId: "t1" };
const calls: string[] = [];

function mock(
  name: string,
  priority: number,
  opts: {
    geoAffinity?: ContactEnrichmentProvider["geoAffinity"];
    available?: boolean;
    throws?: boolean;
    data?: Partial<EnrichedContact>;
  } = {},
): ContactEnrichmentProvider {
  return {
    name,
    priority,
    costCentsPerCall: 0,
    geoAffinity: opts.geoAffinity,
    isAvailable: () => opts.available ?? true,
    async enrich() {
      calls.push(name);
      if (opts.throws) throw new Error(`${name} boom`);
      return { ok: true, data: opts.data ?? {}, provider: name, durationMs: 1, costCents: 0 };
    },
  };
}

beforeEach(() => {
  resetContactRegistryForTest();
  calls.length = 0;
  mockedEnrichPerson.mockReset();
});

describe("deriveContactGeo", () => {
  it("prefers phone country, then domain TLD", () => {
    expect(deriveContactGeo({ knownPhoneE164: "+33612345678" })).toBe("FR");
    expect(deriveContactGeo({ knownPhoneE164: "+41791234567" })).toBe("CH");
    expect(deriveContactGeo({ companyDomain: "acme.fr" })).toBe("FR");
    expect(deriveContactGeo({ companyDomain: "acme.ch" })).toBe("CH");
    expect(deriveContactGeo({ companyDomain: "acme.de" })).toBe("EU");
    expect(deriveContactGeo({ companyDomain: "acme.com" })).toBe("OTHER");
    expect(deriveContactGeo({ geo: "CH", companyDomain: "acme.fr" })).toBe("CH");
  });
});

describe("contact-enrichment waterfall", () => {
  it("geo-routes FR prospects to Kaspr before Apollo", async () => {
    registerContactProvider(mock("apollo", 10, { data: { email: "a@x.fr", emailStatus: "unverified" } }));
    registerContactProvider(mock("kaspr", 20, { geoAffinity: ["FR"], data: { phones: [{ number: "+33612345678", type: "mobile" }] } }));
    registerContactProvider(mock("lusha", 30, { geoAffinity: ["FR", "CH", "EU"], data: {} }));

    await enrichContact({ companyDomain: "acme.fr", firstName: "A", lastName: "B" }, ctx);
    // Kaspr (FR-boosted) and Lusha (FR-boosted) run before Apollo.
    expect(calls.indexOf("kaspr")).toBeLessThan(calls.indexOf("apollo"));
    expect(calls.indexOf("lusha")).toBeLessThan(calls.indexOf("apollo"));
  });

  it("does NOT boost Kaspr for CH (Kaspr is FR-only); Lusha leads", async () => {
    registerContactProvider(mock("apollo", 10, { data: {} }));
    registerContactProvider(mock("kaspr", 20, { geoAffinity: ["FR"], data: {} }));
    registerContactProvider(mock("lusha", 30, { geoAffinity: ["FR", "CH", "EU"], data: {} }));

    await enrichContact({ companyDomain: "bank.ch", firstName: "A", lastName: "B" }, ctx);
    expect(calls.indexOf("lusha")).toBeLessThan(calls.indexOf("apollo"));
    expect(calls.indexOf("apollo")).toBeLessThan(calls.indexOf("kaspr"));
  });

  it("merges across providers: mobile beats direct, verified beats unverified", async () => {
    // OTHER prospect → no geo boost → apollo(10) runs before lusha(30).
    // apollo has only a direct line (no mobile) so it does NOT saturate,
    // letting lusha contribute the mobile + the verified email.
    registerContactProvider(mock("apollo", 10, { data: { email: "a@x.com", emailStatus: "unverified", phones: [{ number: "+33155667788", type: "direct" }] } }));
    registerContactProvider(mock("lusha", 30, { geoAffinity: ["EU"], data: { email: "a@x.com", emailStatus: "verified", phones: [{ number: "+33612345678", type: "mobile" }] } }));

    const r = await enrichContact({ companyDomain: "acme.com", firstName: "A", lastName: "B" }, ctx);
    expect(r.data.mobilePhone).toBe("+33612345678");
    expect(r.data.directPhone).toBe("+33155667788");
    expect(r.data.emailStatus).toBe("verified");
    expect(r.data.phones).toHaveLength(2);
  });

  it("de-dupes the same number across providers", async () => {
    registerContactProvider(mock("apollo", 10, { data: { phones: [{ number: "+33 6 12 34 56 78", type: "mobile" }] } }));
    registerContactProvider(mock("lusha", 30, { geoAffinity: ["EU"], data: { phones: [{ number: "+33612345678", type: "mobile" }] } }));

    const r = await enrichContact({ companyDomain: "acme.fr", firstName: "A", lastName: "B" }, ctx);
    expect(r.data.phones).toHaveLength(1);
  });

  it("stops once saturated (mobile + non-unverified email)", async () => {
    registerContactProvider(mock("kaspr", 20, { geoAffinity: ["FR"], data: { email: "a@x.fr", emailStatus: "verified", phones: [{ number: "+33612345678", type: "mobile" }] } }));
    registerContactProvider(mock("lusha", 30, { geoAffinity: ["FR"], data: { phones: [{ number: "+33611111111", type: "mobile" }] } }));
    registerContactProvider(mock("apollo", 10, { data: {} }));

    await enrichContact({ companyDomain: "acme.fr", firstName: "A", lastName: "B" }, ctx);
    // Kaspr saturates first → apollo never called.
    expect(calls).toContain("kaspr");
    expect(calls).not.toContain("apollo");
  });

  it("absorbs a throwing provider and still uses the others", async () => {
    registerContactProvider(mock("kaspr", 20, { geoAffinity: ["FR"], throws: true }));
    registerContactProvider(mock("apollo", 10, { data: { email: "a@x.fr", emailStatus: "likely" } }));

    const r = await enrichContact({ companyDomain: "acme.fr", firstName: "A", lastName: "B" }, ctx);
    expect(r.data.email).toBe("a@x.fr");
    expect(r.attempts.find((a) => a.provider === "kaspr")?.ok).toBe(false);
  });

  it("apolloId pre-resolves identity (reveal) once, skips the Apollo provider, and feeds linkedin to phone vendors", async () => {
    mockedEnrichPerson.mockResolvedValue({
      id: "APID", first_name: "Justin", last_name: "Davis", name: "Justin Davis",
      email: "jd@bank.ch", email_status: "verified", title: "CEO", headline: null,
      seniority: "c_suite", departments: [], linkedin_url: "http://li/in/x",
      phone_numbers: [], city: null, state: null, country: null, organization_id: null, organization: null,
    });

    const captured: { input?: ContactEnrichInput } = {};
    registerContactProvider({
      name: "lusha", priority: 30, costCentsPerCall: 0, geoAffinity: ["CH", "FR", "EU"],
      isAvailable: () => true,
      async enrich(input) {
        calls.push("lusha");
        captured.input = input;
        return { ok: true, data: { phones: [{ number: "+41 76 675 23 93", type: "mobile" }] }, provider: "lusha", durationMs: 1, costCents: 0 };
      },
    });
    // Apollo provider must be SKIPPED because the reveal already consumed it.
    registerContactProvider(mock("apollo", 10, { data: { email: "should-not-run@x" } }));

    const r = await enrichContact({ apolloId: "APID", companyDomain: "bank.ch" }, ctx);

    expect(mockedEnrichPerson).toHaveBeenCalledWith({ id: "APID", reveal_personal_emails: true });
    expect(r.data.lastName).toBe("Davis");
    expect(r.data.linkedinUrl).toBe("http://li/in/x");
    expect(r.data.email).toBe("jd@bank.ch");
    expect(r.data.mobilePhone).toBe("+41 76 675 23 93");
    expect(calls).not.toContain("apollo"); // provider skipped, no second reveal
    expect(captured.input?.linkedinUrl).toBe("http://li/in/x"); // reveal fed forward
  });

  it("skips unavailable providers (graceful degradation to Apollo-only)", async () => {
    registerContactProvider(mock("kaspr", 20, { geoAffinity: ["FR"], available: false }));
    registerContactProvider(mock("lusha", 30, { geoAffinity: ["FR"], available: false }));
    registerContactProvider(mock("apollo", 10, { data: { email: "a@x.fr", emailStatus: "verified", phones: [{ number: "+33611112222", type: "direct" }] } }));

    const r = await enrichContact({ companyDomain: "acme.fr", firstName: "A", lastName: "B" }, ctx);
    expect(calls).toEqual(["apollo"]);
    expect(r.enriched).toBe(true);
    expect(r.data.email).toBe("a@x.fr");
  });
});
