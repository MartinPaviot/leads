import { describe, it, expect } from "vitest";
import { validateIcpInput, type CatalogEntry } from "@/lib/icp/validation";

/**
 * Phase 0 guard (_specs/icp-unification R8.1): an ACTIVE ICP with zero
 * criteria matches nothing and accumulates as an inert shell — the
 * 2026-06-01 migration left 96 of them in prod. Active now requires
 * at least one criterion; drafts stay free.
 */

const CATALOG: CatalogEntry[] = [
  { fieldKey: "industry", operators: ["in", "eq"], valueType: "multi_select" },
];

describe("validateIcpInput — active requires criteria", () => {
  it("rejects status active with an empty criteria set", () => {
    const res = validateIcpInput({ name: "Empty", status: "active", criteria: [] }, CATALOG);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/active ICP needs at least one criterion/i);
  });

  it("rejects status active with criteria omitted entirely", () => {
    const res = validateIcpInput({ name: "Empty", status: "active" }, CATALOG);
    expect(res.ok).toBe(false);
  });

  it("accepts a draft with no criteria", () => {
    const res = validateIcpInput({ name: "WIP", status: "draft", criteria: [] }, CATALOG);
    expect(res.ok).toBe(true);
  });

  it("accepts active with one valid criterion", () => {
    const res = validateIcpInput(
      {
        name: "Real",
        status: "active",
        criteria: [{ fieldKey: "industry", operator: "in", value: ["Banking"] }],
      },
      CATALOG,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.criteria).toHaveLength(1);
  });
});
