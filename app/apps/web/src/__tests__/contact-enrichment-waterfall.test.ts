import { describe, it, expect, beforeEach } from "vitest";
import { enrichContact } from "@/lib/providers/contact-enrichment/waterfall";
import {
  registerContactProvider,
  resetContactRegistryForTest,
} from "@/lib/providers/contact-enrichment/registry";
import { deriveContactGeo } from "@/lib/providers/contact-enrichment/types";
import type {
  ContactEnrichmentProvider,
  EnrichedContact,
} from "@/lib/providers/contact-enrichment/types";

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
