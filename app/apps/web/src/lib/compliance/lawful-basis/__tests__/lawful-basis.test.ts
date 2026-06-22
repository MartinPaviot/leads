import { describe, it, expect } from "vitest";
import {
  assertLawfulBasis,
  hasOptOut,
  assertMessageOptOut,
  sourcePolicy,
  acceptableBases,
  type ComplianceContact,
} from "../index";

const contact = (over: Partial<ComplianceContact> = {}): ComplianceContact => ({
  id: "c1",
  lawfulBasis: { type: "legitimate_interest", assessmentId: "lia-1" },
  source: "sirene",
  jurisdiction: "FR",
  ...over,
});

describe("assertLawfulBasis — AC1 basis recorded", () => {
  it("blocks when no basis is recorded (default deny)", () => {
    expect(assertLawfulBasis(contact({ lawfulBasis: null }))).toMatchObject({ allowed: false, reason: "no_lawful_basis" });
  });
  it("blocks legitimate interest without a documented assessment", () => {
    expect(assertLawfulBasis(contact({ lawfulBasis: { type: "legitimate_interest" } })).reason).toBe("li_without_assessment");
  });
  it("blocks consent without a consent record", () => {
    expect(assertLawfulBasis(contact({ lawfulBasis: { type: "consent" } })).reason).toBe("consent_without_record");
  });
  it("allows a valid LI with an assessment from a clean source", () => {
    expect(assertLawfulBasis(contact())).toMatchObject({ allowed: true });
  });
  it("allows a recorded consent", () => {
    expect(assertLawfulBasis(contact({ lawfulBasis: { type: "consent", consentAt: 1 } })).allowed).toBe(true);
  });
});

describe("assertLawfulBasis — AC2 source provenance", () => {
  it("blocks a contact sourced from a resale-restricted provider (Apollo)", () => {
    expect(assertLawfulBasis(contact({ source: "apollo" }))).toMatchObject({ allowed: false, reason: "prohibited_source" });
  });
  it("passes a registry-sourced contact", () => {
    for (const s of ["sirene", "pappers", "zefix", "recherche_entreprises", "manual"]) {
      expect(assertLawfulBasis(contact({ source: s })).allowed).toBe(true);
    }
  });
  it("blocks an unknown / missing source (default deny)", () => {
    expect(assertLawfulBasis(contact({ source: "mysteryvendor" })).reason).toBe("prohibited_source");
    expect(assertLawfulBasis(contact({ source: null })).reason).toBe("prohibited_source");
  });
  it("sourcePolicy is the SSOT", () => {
    expect(sourcePolicy("Apollo")).toBe("prohibited");
    expect(sourcePolicy("SIRENE")).toBe("clean");
    expect(sourcePolicy(undefined)).toBe("prohibited");
  });
});

describe("assertLawfulBasis — AC5 jurisdiction", () => {
  it("FR/CH/EU accept legitimate interest", () => {
    for (const j of ["FR", "CH", "EU"]) {
      expect(assertLawfulBasis(contact({ jurisdiction: j })).allowed).toBe(true);
    }
  });
  it("an unknown jurisdiction requires consent (LI not accepted)", () => {
    expect(assertLawfulBasis(contact({ jurisdiction: "US" })).reason).toBe("basis_invalid_for_jurisdiction");
    expect(assertLawfulBasis(contact({ jurisdiction: "US", lawfulBasis: { type: "consent", consentAt: 1 } })).allowed).toBe(true);
  });
  it("acceptableBases falls back to consent-only for unknown jurisdictions", () => {
    expect(acceptableBases("FR")).toContain("legitimate_interest");
    expect(acceptableBases("US")).toEqual(["consent"]);
    expect(acceptableBases(null)).toEqual(["consent"]);
  });
});

describe("AC4 audit", () => {
  it("the result carries basis + provenance for the audit log", () => {
    const r = assertLawfulBasis(contact({ source: "apollo" }));
    expect(r.audit).toMatchObject({ contactId: "c1", basis: "legitimate_interest", source: "apollo", sourcePolicy: "prohibited", jurisdiction: "FR" });
  });
});

describe("opt-out — AC3", () => {
  it("detects an opt-out mechanism in the message body", () => {
    expect(hasOptOut("... Reply STOP or click unsubscribe here.")).toBe(true);
    expect(hasOptOut("... {{unsubscribe_url}}")).toBe(true);
    expect(hasOptOut("... pour vous désinscrire ...")).toBe(true);
    expect(hasOptOut("No way out here.")).toBe(false);
  });
  it("blocks a message with no opt-out", () => {
    expect(assertMessageOptOut("Hi, quick idea.", "FR")).toMatchObject({ allowed: false, reason: "missing_opt_out" });
  });
  it("allows a message that includes an opt-out", () => {
    expect(assertMessageOptOut("Hi, quick idea. Unsubscribe: {{unsubscribe_url}}", "FR").allowed).toBe(true);
  });
});
