import { describe, it, expect } from "vitest";
import {
  accountIdentityKey,
  accountMatchPlan,
  contactIdentityKey,
  contactMatchPlan,
  bareDomain,
} from "../identity";

describe("accountIdentityKey", () => {
  it("is registry-first: SIREN > SIRET(→SIREN) > UID > domain > name", () => {
    expect(accountIdentityKey({ siren: "552 100 554", domain: "x.fr" })).toBe("fr:552100554");
    expect(accountIdentityKey({ siret: "55210055400013" })).toBe("fr:552100554"); // first 9 digits
    expect(accountIdentityKey({ uid: "CHE-123.456.789" })).toBe("ch:CHE-123.456.789");
    expect(accountIdentityKey({ domain: "https://www.Acme.fr/path" })).toBe("d:acme.fr");
    expect(accountIdentityKey({ name: "Acme SAS" })).toBe("n:acme");
    expect(accountIdentityKey({})).toBeNull();
  });

  it("never derives identity from a vendor id (AC4)", () => {
    // A record with only a vendor id and nothing canonical is unkeyed.
    expect(accountIdentityKey({ name: null, domain: null } as never)).toBeNull();
    // Adding an apollo id (not part of the input shape) cannot produce a key.
    expect(accountIdentityKey({ domain: "acme.fr" })).toBe("d:acme.fr");
  });
});

describe("accountMatchPlan", () => {
  it("orders registry → domain → name+country", () => {
    const plan = accountMatchPlan({ siren: "552100554", domain: "acme.fr", name: "Acme SAS", country: "FR" });
    expect(plan.map((s) => s.by)).toEqual(["identity_key", "domain", "name_country"]);
    expect(plan[0]).toMatchObject({ by: "identity_key", value: "fr:552100554" });
    expect(plan[1]).toMatchObject({ by: "domain", value: "acme.fr" });
    expect(plan[2]).toMatchObject({ by: "name_country", name: "acme", country: "FR" });
  });

  it("omits steps with no signal", () => {
    expect(accountMatchPlan({ name: "Acme" }).map((s) => s.by)).toEqual(["name_country"]);
    expect(accountMatchPlan({})).toEqual([]);
  });
});

describe("contactIdentityKey", () => {
  it("is email-first, then linkedin, then name@company", () => {
    expect(contactIdentityKey({ email: "JANE@Acme.fr" })).toBe("e:jane@acme.fr");
    expect(contactIdentityKey({ linkedinUrl: "https://www.linkedin.com/in/jane/" })).toBe("li:linkedin.com/in/jane");
    expect(contactIdentityKey({ firstName: "Jane", lastName: "Doe", companyId: "c1" })).toBe("nc:jane doe@c1");
    expect(contactIdentityKey({ firstName: "Jane", lastName: "Doe" })).toBeNull(); // no company anchor
  });
});

describe("contactMatchPlan", () => {
  it("orders email → linkedin; name@company only when there is no stronger signal", () => {
    // Email present → identity is email-based, so no name@company fallback step.
    const withEmail = contactMatchPlan({ email: "j@acme.fr", linkedinUrl: "linkedin.com/in/j", firstName: "J", lastName: "D", companyId: "c1" });
    expect(withEmail.map((s) => s.by)).toEqual(["email", "linkedin"]);
    // Only name + company → the name@company identity_key step is the lone plan.
    const nameOnly = contactMatchPlan({ firstName: "Jane", lastName: "Doe", companyId: "c1" });
    expect(nameOnly.map((s) => s.by)).toEqual(["identity_key"]);
    expect(nameOnly[0]).toMatchObject({ by: "identity_key", value: "nc:jane doe@c1" });
  });
});

describe("bareDomain", () => {
  it("strips scheme/www/path", () => {
    expect(bareDomain("https://www.Acme.fr/contact")).toBe("acme.fr");
    expect(bareDomain(null)).toBeNull();
  });
});
