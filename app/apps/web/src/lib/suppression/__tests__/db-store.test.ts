import { describe, it, expect } from "vitest";
import { isSuppressedDb, suppressedDb, rowToEntry, type SuppressionRowLoader } from "../db-store";
import type { SuppressionEntry } from "../suppression";

const loaderOf = (entries: SuppressionEntry[]): SuppressionRowLoader => async () => entries;

describe("isSuppressedDb — DB adapter reuses the pure spec-22 logic", () => {
  it("hits when a loaded address row matches", async () => {
    const rows: SuppressionEntry[] = [{ scope: "ws1", level: "address", value: "jane@acme.com", type: "manual_dnc", permanent: true, createdAt: 1 }];
    const hit = await isSuppressedDb({ email: "jane@acme.com", tenantId: "ws1" }, loaderOf(rows));
    expect(hit?.entry.type).toBe("manual_dnc");
    expect(hit?.matchedKey).toContain("address");
  });

  it("a domain-level row suppresses any address on the domain", async () => {
    const rows: SuppressionEntry[] = [{ scope: "global", level: "domain", value: "competitor.com", type: "competitor", permanent: true, createdAt: 1 }];
    expect(await suppressedDb({ email: "anyone@competitor.com", tenantId: "ws1" }, loaderOf(rows))).toBe(true);
  });

  it("no loaded rows → not suppressed", async () => {
    expect(await isSuppressedDb({ email: "fresh@lead.com", tenantId: "ws1" }, loaderOf([]))).toBeNull();
  });

  it("an expired cool-off row does not suppress; within it does", async () => {
    const rows: SuppressionEntry[] = [{ scope: "ws1", level: "address", value: "x@y.com", type: "hard_bounce", permanent: false, createdAt: 0, expiresAt: 1000 }];
    expect(await suppressedDb({ email: "x@y.com", tenantId: "ws1" }, loaderOf(rows), 5000)).toBe(false);
    expect(await suppressedDb({ email: "x@y.com", tenantId: "ws1" }, loaderOf(rows), 500)).toBe(true);
  });

  it("rowToEntry maps NULL tenant_id → global scope and dates → ms", () => {
    const e = rowToEntry({ tenantId: null, level: "address", value: "x@y.com", type: "opt_out", reason: null, permanent: true, expiresAt: null, createdAt: new Date(1000) });
    expect(e).toMatchObject({ scope: "global", level: "address", value: "x@y.com", type: "opt_out", permanent: true, createdAt: 1000 });
    expect(e.expiresAt).toBeUndefined();
  });

  it("rowToEntry keeps a workspace tenant_id as the scope", () => {
    expect(rowToEntry({ tenantId: "ws9", level: "domain", value: "a.com", type: "competitor", reason: "x", permanent: true, expiresAt: null, createdAt: null }).scope).toBe("ws9");
  });
});
