import { describe, it, expect } from "vitest";
import {
  normalizeCompanyName,
  canonicalIdentityKey,
  isActionable,
  auditAccountQuality,
  type CompanyLike,
} from "@/lib/companies/identity";

describe("normalizeCompanyName", () => {
  it("strips legal suffixes, accents, punctuation", () => {
    expect(normalizeCompanyName("Acme SAS")).toBe("acme");
    expect(normalizeCompanyName("Société Générale S.A.")).toBe("societe generale");
    expect(normalizeCompanyName("Foo-Bar GmbH")).toBe("foo bar");
  });
});

describe("canonicalIdentityKey", () => {
  it("prefers SIREN, then UID, then domain, then name", () => {
    expect(canonicalIdentityKey({ properties: { siren: "552 100 554" }, domain: "x.fr" })).toBe("fr:552100554");
    expect(canonicalIdentityKey({ properties: { uid: "CHE-123.456.789" } })).toBe("ch:CHE-123.456.789");
    expect(canonicalIdentityKey({ domain: "https://www.Acme.fr/path" })).toBe("d:acme.fr");
    expect(canonicalIdentityKey({ name: "Acme SAS" })).toBe("n:acme");
    expect(canonicalIdentityKey({})).toBeNull();
  });
});

describe("isActionable", () => {
  it("requires a domain, active, not excluded", () => {
    expect(isActionable({ domain: "acme.fr" })).toBe(true);
    expect(isActionable({ domain: null })).toBe(false);
    expect(isActionable({ domain: "acme.fr", excludedReason: "anti_icp" })).toBe(false);
    expect(isActionable({ domain: "acme.fr", deletedAt: new Date() })).toBe(false);
  });
});

describe("auditAccountQuality", () => {
  it("counts duplicates by canonical key + hygiene gaps", () => {
    const companies: CompanyLike[] = [
      { id: "1", name: "Acme", domain: "acme.fr", industry: "software", properties: { source: "tam" } },
      { id: "2", name: "Acme", domain: "www.acme.fr", industry: "software", properties: { source: "tam" } }, // dup of 1 by domain
      { id: "3", name: "Acme SAS", domain: null, industry: null, properties: { siren: "111" } },
      { id: "4", name: "Beta", domain: null, industry: null, properties: {} }, // keyed by name only
      { id: "5", name: "Gamma", domain: "gamma.ch", industry: "finance", properties: { uid: "CHE-9", source: "pappers" }, excludedReason: "anti_icp" },
    ];
    const r = auditAccountQuality(companies);
    expect(r.total).toBe(5);
    expect(r.duplicateRows).toBe(1); // 1 & 2 collapse
    expect(r.missingDomain).toBe(2); // 3 & 4
    expect(r.missingIndustry).toBe(2); // 3 & 4
    expect(r.excludedOrDeleted).toBe(1); // 5
    expect(r.bySource.tam).toBe(2);
    expect(r.duplicateGroups[0].count).toBe(2);
  });
});
