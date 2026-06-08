import { describe, it, expect, vi } from "vitest";

// Pure helpers need no DB. filterAllowed/filterAllowedContacts hit the ledger,
// so we mock @/db to return a fixed suppression set and assert the matching.

let SUPP: Array<Record<string, unknown>> = [];

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => SUPP,
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  accountSuppressions: {
    tenantId: "tenant_id",
    domain: "domain",
    nativeId: "native_id",
    nameNormalized: "name_normalized",
    email: "email",
    linkedin: "linkedin",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  inArray: (...a: unknown[]) => a,
  or: (...a: unknown[]) => a,
}));

import {
  normalizeDomain,
  normalizeName,
  normalizeEmail,
  normalizeLinkedin,
  extractIdentity,
  filterAllowed,
  filterAllowedContacts,
} from "@/lib/accounts/suppression";

describe("suppression normalizers", () => {
  it("normalizes domains (scheme/www/path stripped, lowercased)", () => {
    expect(normalizeDomain("https://WWW.Acme.com/path")).toBe("acme.com");
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
  });
  it("normalizes names + emails + linkedin", () => {
    expect(normalizeName("  Acme   SA ")).toBe("acme sa");
    expect(normalizeEmail("  Jane@Acme.COM ")).toBe("jane@acme.com");
    expect(normalizeLinkedin("https://www.linkedin.com/in/jane/")).toBe("linkedin.com/in/jane");
  });
});

describe("extractIdentity", () => {
  it("prefers SIREN, then UID, then native_ids, then apollo_id", () => {
    expect(extractIdentity({ name: "A", domain: "a.com", properties: { siren: "123" } })).toMatchObject({ nativeId: "123", nativeIdType: "siren", domain: "a.com" });
    expect(extractIdentity({ properties: { uid: "CHE-1" } }).nativeIdType).toBe("zefix_uid");
    expect(extractIdentity({ properties: { native_ids: { siren: "9" } } })).toMatchObject({ nativeId: "9", nativeIdType: "siren" });
    expect(extractIdentity({ properties: { apollo_id: "ap1" } }).nativeIdType).toBe("apollo");
    expect(extractIdentity({ name: "X" }).nativeId).toBeNull();
  });
});

describe("filterAllowed (companies)", () => {
  it("drops candidates matching a suppressed domain, native id, or (domainless) name", async () => {
    SUPP = [
      { domain: "blocked.com", nativeId: null, nameNormalized: null },
      { domain: null, nativeId: "siren-x", nameNormalized: null },
      { domain: null, nativeId: null, nameNormalized: "blocked sarl" },
    ];
    const out = await filterAllowed("t1", [
      { domain: "blocked.com", name: "whatever", nativeId: null }, // domain match -> drop
      { domain: "ok.com", name: "fine", nativeId: "siren-x" }, // native match -> drop
      { domain: null, name: "Blocked SARL", nativeId: null }, // domainless name match -> drop
      { domain: "ok.com", name: "Blocked SARL", nativeId: null }, // has domain -> name NOT used -> keep
      { domain: "fresh.com", name: "fresh", nativeId: null }, // keep
    ]);
    expect(out.map((c) => c.domain)).toEqual(["ok.com", "fresh.com"]);
  });

  it("returns everything when there are no suppressions", async () => {
    SUPP = [];
    const cands = [{ domain: "a.com", name: "a", nativeId: null }];
    expect(await filterAllowed("t1", cands)).toHaveLength(1);
  });
});

describe("filterAllowedContacts", () => {
  it("drops candidates matching a suppressed email or linkedin", async () => {
    SUPP = [
      { email: "gone@x.com", linkedin: null },
      { email: null, linkedin: "linkedin.com/in/gone" },
    ];
    const out = await filterAllowedContacts("t1", [
      { email: "GONE@x.com", linkedin: null }, // email match (case-insensitive) -> drop
      { email: null, linkedin: "https://www.linkedin.com/in/gone/" }, // linkedin match -> drop
      { email: "keep@x.com", linkedin: "linkedin.com/in/keep" }, // keep
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].email).toBe("keep@x.com");
  });
});
