import { describe, it, expect } from "vitest";
import { similarity } from "../similarity";
import { groupByIdentity, findReviewCandidates } from "../group";
import { collapseGroup } from "../merge";
import { dedupeContacts } from "../contacts";
import { dedupeRun } from "../run";
import type { DedupAccount, DedupContact, FieldSource, PickWinner } from "../types";

const RANK: Record<string, number> = { manual: 100, sirene: 80, apollo: 50 };
const pickWinner: PickWinner = (rows) =>
  rows.reduce<FieldSource | null>((best, r) => (!best || (RANK[r.provider] ?? 30) > (RANK[best.provider] ?? 30) ? r : best), null);

const fs = (field: string, provider: string, value: unknown): FieldSource => ({ field, provider, value, observedAt: new Date("2026-01-01") });
const acc = (id: string, key: string | null, name: string | null, sources: FieldSource[] = []): DedupAccount => ({ id, identityKey: key, normalizedName: name, country: "FR", sources });

describe("similarity (AC4)", () => {
  it("scores near names high, distinct names low", () => {
    expect(similarity("acme corp", "acme corporation")).toBeGreaterThan(0.5);
    expect(similarity("acme", "zeta")).toBeLessThan(0.5);
    expect(similarity("acme", "acme")).toBe(1);
  });
});

describe("groupByIdentity (AC1)", () => {
  it("groups by identity key, skips unkeyed", () => {
    const g = groupByIdentity([acc("a", "d:acme.fr", "acme"), acc("b", "d:acme.fr", "acme"), acc("c", null, "x")]);
    expect(g.get("d:acme.fr")?.length).toBe(2);
    expect(g.size).toBe(1);
  });
});

describe("collapseGroup (AC2)", () => {
  it("picks the smallest-id survivor, unions provenance, resolves by precedence", () => {
    const g = collapseGroup("d:acme.fr", [
      acc("a2", "d:acme.fr", "acme", [fs("name", "manual", "Acme"), fs("industry", "sirene", "Software")]),
      acc("a1", "d:acme.fr", "acme", [fs("name", "apollo", "Acme Inc")]),
    ], pickWinner);
    expect(g.survivorId).toBe("a1"); // deterministic
    expect(g.absorbedIds).toEqual(["a2"]);
    expect(g.canonicalFields.name).toEqual({ value: "Acme", provider: "manual" }); // manual beats apollo
    expect(g.canonicalFields.industry.value).toBe("Software");
  });
});

describe("dedupeContacts (AC3)", () => {
  it("dedups by email then linkedin", () => {
    const cs: DedupContact[] = [
      { id: "c1", email: "JANE@x.fr", linkedinUrl: null },
      { id: "c2", email: "jane@x.fr", linkedinUrl: null },
      { id: "c3", email: null, linkedinUrl: "linkedin.com/in/bob" },
      { id: "c4", email: null, linkedinUrl: "linkedin.com/in/bob/" },
    ];
    const groups = dedupeContacts(cs);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.by === "email")).toMatchObject({ survivorId: "c1", absorbedIds: ["c2"] });
    expect(groups.find((g) => g.by === "linkedin")).toMatchObject({ survivorId: "c3", absorbedIds: ["c4"] });
  });
});

describe("findReviewCandidates (AC4)", () => {
  it("flags same-name / different-key pairs for review, never guess-merges", () => {
    const reviews = findReviewCandidates([acc("x1", "d:acme.fr", "acme corp"), acc("x2", "d:acme-corp.com", "acme corp")], 0.85);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].ids).toEqual(["x1", "x2"]);
  });
});

describe("dedupeRun (AC1-AC5)", () => {
  const accounts = [
    acc("a1", "d:acme.fr", "acme", [fs("name", "apollo", "Acme Inc")]),
    acc("a2", "d:acme.fr", "acme", [fs("name", "manual", "Acme")]),
    acc("a3", "d:beta.fr", "beta", [fs("name", "apollo", "Beta")]),
  ];

  it("collapses dupes by key, merges by precedence, counts kept", () => {
    const r = dedupeRun(accounts, [], { pickWinner });
    expect(r.merged).toBe(1); // a2 absorbed into a1
    expect(r.kept).toBe(2); // two distinct keys
    expect(r.groups[0].canonicalFields.name).toEqual({ value: "Acme", provider: "manual" });
  });

  it("is idempotent — re-running over the collapsed set is a no-op", () => {
    const survivors = [acc("a1", "d:acme.fr", "acme"), acc("a3", "d:beta.fr", "beta")];
    const r = dedupeRun(survivors, [], { pickWinner });
    expect(r.merged).toBe(0);
    expect(r.kept).toBe(2);
    // deterministic: same input twice -> identical report
    expect(dedupeRun(accounts, [], { pickWinner })).toEqual(dedupeRun(accounts, [], { pickWinner }));
  });
});
