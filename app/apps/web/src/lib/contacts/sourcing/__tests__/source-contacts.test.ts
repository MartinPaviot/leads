import { describe, it, expect } from "vitest";
import {
  sourceContacts,
  matchesPersona,
  contactIdentityKey,
  DEFAULT_PER_ACCOUNT_CAP,
  type ContactCandidate,
  type SourcingAccount,
  type SourcingPersona,
} from "../source-contacts";

const cand = (over: Partial<ContactCandidate> = {}): ContactCandidate => ({
  externalId: over.externalId ?? "x1",
  provider: over.provider ?? "apollo",
  ...over,
});
const qualified: SourcingAccount = { id: "acct-1", qualification: "qualified" };
const persona: SourcingPersona = { titles: ["ceo", "head of marketing"], seniorities: ["c_suite"], departments: ["executive"] };

describe("sourceContacts — AC1 qualified-only", () => {
  it("a disqualified account sources nothing", () => {
    const c = cand({ email: "a@x.com", emailVerified: true, title: "ceo", seniority: "c_suite", department: "executive" });
    expect(sourceContacts({ id: "a", qualification: "disqualified" }, persona, [c])).toEqual([]);
  });
  it("a needs-review account sources nothing", () => {
    const c = cand({ email: "a@x.com", emailVerified: true, title: "ceo", seniority: "c_suite", department: "executive" });
    expect(sourceContacts({ id: "a", qualification: "needs-review" }, persona, [c])).toEqual([]);
  });
});

describe("sourceContacts — AC2 persona filter", () => {
  it("keeps a contact matching all specified facets, drops a title mismatch", () => {
    const ceo = cand({ externalId: "ceo", email: "ceo@x.com", emailVerified: true, title: "CEO & Founder", seniority: "c_suite", department: "executive" });
    const eng = cand({ externalId: "eng", email: "eng@x.com", emailVerified: true, title: "Software Engineer", seniority: "c_suite", department: "executive" });
    const out = sourceContacts(qualified, persona, [ceo, eng]);
    expect(out.map((o) => o.externalId)).toEqual(["ceo"]);
  });
  it("drops a seniority mismatch even when the title matches", () => {
    const c = cand({ email: "a@x.com", emailVerified: true, title: "ceo", seniority: "manager", department: "executive" });
    expect(sourceContacts(qualified, persona, [c])).toEqual([]);
  });
  it("an empty persona facet imposes no constraint", () => {
    const c = cand({ email: "a@x.com", emailVerified: true, title: "anything", seniority: "whatever", department: "whatever" });
    expect(sourceContacts(qualified, {}, [c])).toHaveLength(1);
  });
  it("matchesPersona is substring both ways (label terser or richer than the title)", () => {
    expect(matchesPersona(cand({ title: "Group CEO" }), { titles: ["ceo"] })).toBe(true);
    expect(matchesPersona(cand({ title: "Marketing Director" }), { titles: ["marketing"] })).toBe(true);
    expect(matchesPersona(cand({ title: "Accountant" }), { titles: ["ceo"] })).toBe(false);
  });
});

describe("sourceContacts — AC3 per-account cap", () => {
  const many = Array.from({ length: 6 }, (_, i) =>
    cand({ externalId: `c${i}`, email: `c${i}@x.com`, emailVerified: true, title: "ceo", seniority: "c_suite", department: "executive", rank: i }),
  );
  it("caps at the default (3), highest rank first", () => {
    const out = sourceContacts(qualified, persona, many);
    expect(out).toHaveLength(DEFAULT_PER_ACCOUNT_CAP);
    expect(out.map((o) => o.externalId)).toEqual(["c5", "c4", "c3"]); // rank desc
  });
  it("honors a configured lower cap (1)", () => {
    const out = sourceContacts(qualified, persona, many, { perAccountCap: 1 });
    expect(out.map((o) => o.externalId)).toEqual(["c5"]);
  });
  it("equal ranks break ties by externalId for determinism", () => {
    const flat = ["b", "a", "c"].map((id) => cand({ externalId: id, email: `${id}@x.com`, emailVerified: true, title: "ceo", seniority: "c_suite", department: "executive" }));
    const out = sourceContacts(qualified, persona, flat, { perAccountCap: 2 });
    expect(out.map((o) => o.externalId)).toEqual(["a", "b"]);
  });
});

describe("sourceContacts — AC4 dedup + anti-collision", () => {
  it("dedups within the call by identity (same verified email)", () => {
    const a = cand({ externalId: "a", email: "DUP@x.com", emailVerified: true, title: "ceo", seniority: "c_suite", department: "executive" });
    const b = cand({ externalId: "b", email: "dup@x.com", emailVerified: true, title: "ceo", seniority: "c_suite", department: "executive" });
    expect(sourceContacts(qualified, persona, [a, b])).toHaveLength(1);
  });
  it("skips contacts already sourced (cross-campaign/account)", () => {
    const c = cand({ email: "seen@x.com", emailVerified: true, title: "ceo", seniority: "c_suite", department: "executive" });
    const out = sourceContacts(qualified, persona, [c], { alreadySourced: new Set(["email:seen@x.com"]) });
    expect(out).toEqual([]);
  });
  it("skips contacts locked by another active enrollment (spec 14)", () => {
    const c = cand({ email: "locked@x.com", emailVerified: true, title: "ceo", seniority: "c_suite", department: "executive" });
    const out = sourceContacts(qualified, persona, [c], { isCollised: (k) => k === "email:locked@x.com" });
    expect(out).toEqual([]);
  });
  it("drops unidentifiable candidates (no email, no linkedin)", () => {
    const c = cand({ title: "ceo", seniority: "c_suite", department: "executive" });
    expect(sourceContacts(qualified, persona, [c])).toEqual([]);
  });
});

describe("contactIdentityKey — verified email > linkedin > unverified email", () => {
  it("prefers a verified email", () => {
    expect(contactIdentityKey(cand({ email: "A@X.com", emailVerified: true, linkedinUrl: "https://li/x" }))).toBe("email:a@x.com");
  });
  it("uses linkedin when the email is unverified", () => {
    expect(contactIdentityKey(cand({ email: "a@x.com", linkedinUrl: "https://LI/x/" }))).toBe("li:https://li/x");
  });
  it("falls back to an unverified email when there is no linkedin", () => {
    expect(contactIdentityKey(cand({ email: "a@x.com" }))).toBe("email:a@x.com");
  });
  it("null when neither email nor linkedin", () => {
    expect(contactIdentityKey(cand({ title: "ceo" }))).toBeNull();
  });
});

describe("sourceContacts — AC5 provenance", () => {
  it("stamps provider + reason on each sourced contact", () => {
    const c = cand({ externalId: "c1", email: "a@x.com", emailVerified: true, title: "ceo", seniority: "c_suite", department: "executive", provider: "apollo" });
    const [out] = sourceContacts(qualified, persona, [c]);
    expect(out.provenance).toEqual({ provider: "apollo", reason: "sourced:acct-1" });
    expect(out.identityKey).toBe("email:a@x.com");
    expect(out.accountId).toBe("acct-1");
  });
});
