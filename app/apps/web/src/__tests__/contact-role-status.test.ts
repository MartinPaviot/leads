import { describe, it, expect } from "vitest";
import {
  isRoleObsolete,
  roleObsoleteAt,
  withRoleObsolete,
  withoutRoleObsolete,
  normalizeTitle,
  roleFreshnessNote,
  relativeFr,
  ROLE_OBSOLETE_KEY,
} from "@/lib/contacts/role-status";

describe("role obsolete flag", () => {
  it("reads the flag from properties", () => {
    expect(isRoleObsolete(null)).toBe(false);
    expect(isRoleObsolete({})).toBe(false);
    expect(isRoleObsolete({ [ROLE_OBSOLETE_KEY]: "" })).toBe(false);
    expect(isRoleObsolete({ [ROLE_OBSOLETE_KEY]: "2026-06-12T00:00:00Z" })).toBe(true);
  });

  it("exposes the timestamp", () => {
    expect(roleObsoleteAt({})).toBeNull();
    expect(roleObsoleteAt({ [ROLE_OBSOLETE_KEY]: "2026-06-12T00:00:00Z" })).toBe(
      "2026-06-12T00:00:00Z",
    );
  });

  it("sets and clears immutably, preserving other keys", () => {
    const props = { source: "icp_sourcing", apolloId: "x" };
    const set = withRoleObsolete(props, "2026-06-12T00:00:00Z");
    expect(set).toEqual({ source: "icp_sourcing", apolloId: "x", [ROLE_OBSOLETE_KEY]: "2026-06-12T00:00:00Z" });
    expect(props).not.toHaveProperty(ROLE_OBSOLETE_KEY); // original untouched
    expect(isRoleObsolete(set)).toBe(true);

    const cleared = withoutRoleObsolete(set);
    expect(cleared).toEqual({ source: "icp_sourcing", apolloId: "x" });
    expect(isRoleObsolete(cleared)).toBe(false);
  });
});

describe("normalizeTitle", () => {
  it("strips a trailing company name glued onto the title", () => {
    expect(normalizeTitle("Directeur Général Afiro", "Afiro")).toBe("Directeur Général");
    expect(normalizeTitle("Directeur Général - Afiro", "Afiro")).toBe("Directeur Général");
    expect(normalizeTitle("Directeur Général @ Afiro", "Afiro")).toBe("Directeur Général");
    expect(normalizeTitle("Directeur Général chez Afiro", "Afiro")).toBe("Directeur Général");
    expect(normalizeTitle("CEO · Acme Corp", "Acme Corp")).toBe("CEO");
  });

  it("is case-insensitive on the company token", () => {
    expect(normalizeTitle("Directrice Marketing AFIRO", "Afiro")).toBe("Directrice Marketing");
  });

  it("leaves mid-title company mentions intact", () => {
    expect(normalizeTitle("Responsable Afiro Centre", "Afiro")).toBe("Responsable Afiro Centre");
  });

  it("never strips the whole title away when title equals company", () => {
    expect(normalizeTitle("Afiro", "Afiro")).toBe("Afiro");
  });

  it("trims and collapses whitespace; empty → null", () => {
    expect(normalizeTitle("  Head   of  Sales ", null)).toBe("Head of Sales");
    expect(normalizeTitle("", "Afiro")).toBeNull();
    expect(normalizeTitle(null)).toBeNull();
    expect(normalizeTitle("  ", "X")).toBeNull();
  });

  it("no-ops without a company name", () => {
    expect(normalizeTitle("Directeur Général Afiro")).toBe("Directeur Général Afiro");
  });
});

describe("freshness note", () => {
  const now = new Date("2026-06-12T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  it("flags a never-sourced role", () => {
    expect(roleFreshnessNote(null, now)).toBe("poste non vérifié");
  });

  it("asks for confirmation with recency", () => {
    expect(roleFreshnessNote(daysAgo(5), now)).toBe("poste à confirmer · sourcé il y a 5 j");
  });

  it("relativeFr scales by magnitude", () => {
    expect(relativeFr(null, now)).toBeNull();
    expect(relativeFr("not-a-date", now)).toBeNull();
    expect(relativeFr(new Date(now.getTime() - 30 * 60000).toISOString(), now)).toBe("il y a 30 min");
    expect(relativeFr(new Date(now.getTime() - 3 * 3600_000).toISOString(), now)).toBe("il y a 3 h");
    expect(relativeFr(daysAgo(5), now)).toBe("il y a 5 j");
    expect(relativeFr(daysAgo(120), now)).toBe("il y a 4 mois");
    expect(relativeFr(daysAgo(800), now)).toBe("il y a 2 ans");
  });
});
