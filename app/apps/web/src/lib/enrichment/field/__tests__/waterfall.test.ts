import { describe, it, expect, vi } from "vitest";
import { enrichField, enrichAccount } from "../waterfall";
import { InMemoryFieldCache } from "../cache";
import { fieldTtlMs } from "../ttl";
import type { EnrichDeps, FieldProvider, MeterOp } from "../types";

const NOW = new Date("2026-06-22T00:00:00Z").getTime();
const now = () => NOW;

function provider(name: string, cost: number, conf: number, value: unknown): FieldProvider {
  return {
    name, cost,
    supports: () => true,
    expectedConfidence: () => conf,
    fetchField: async () => (value === undefined ? null : { value, confidence: conf }),
  };
}

function mk(over: Partial<EnrichDeps> & { providers: FieldProvider[] }) {
  const meterOps: MeterOp[] = [];
  const persisted: Array<{ field: string; provider: string }> = [];
  const deps: EnrichDeps = {
    tenantId: "t1",
    providers: over.providers,
    cache: over.cache ?? new InMemoryFieldCache(now),
    meter: over.meter ?? (async (op, fn) => { meterOps.push(op); return fn(); }),
    persist: over.persist ?? (async (_a, field, e) => { persisted.push({ field, provider: e.provider }); }),
    budgetOk: over.budgetOk,
    threshold: over.threshold,
    now,
  };
  return { deps, meterOps, persisted };
}

describe("enrichField — cache-first (AC1)", () => {
  it("serves a fresh cache entry without calling any provider", async () => {
    const cache = new InMemoryFieldCache(now);
    await cache.set("acc1", "industry", { value: "Software", provider: "sirene", confidence: 0.9, costCredits: 0, ttlExpiresAt: new Date(NOW + 1000) });
    const throwing = { ...provider("apollo", 5, 0.9, "X"), fetchField: vi.fn() } as unknown as FieldProvider;
    const { deps, meterOps } = mk({ providers: [throwing], cache });
    const r = await enrichField("acc1", "industry", deps);
    expect(r.status).toBe("cached");
    expect(r.fromCache).toBe(true);
    expect(r.value).toBe("Software");
    expect((throwing.fetchField as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(meterOps).toHaveLength(0);
  });
});

describe("enrichField — ordered waterfall + threshold stop (AC2)", () => {
  it("skips a below-threshold cheaper provider and accepts the next that clears the bar", async () => {
    const { deps, meterOps } = mk({ providers: [provider("free", 0, 0.5, "lo"), provider("paid", 10, 0.9, "hi")] });
    const r = await enrichField("a", "industry", deps);
    expect(r.status).toBe("filled");
    expect(r.provider).toBe("paid");
    expect(r.value).toBe("hi");
    expect(meterOps.map((m) => m.provider)).toEqual(["free", "paid"]); // tried free first (better ratio), then paid
  });
  it("stops at the first acceptable provider (cheapest-first)", async () => {
    const { deps, meterOps } = mk({ providers: [provider("free", 0, 0.7, "ok"), provider("paid", 10, 0.9, "hi")] });
    const r = await enrichField("a", "industry", deps);
    expect(r.provider).toBe("free");
    expect(meterOps).toHaveLength(1); // paid never called
  });
  it("returns unknown when nothing clears the threshold", async () => {
    const { deps } = mk({ providers: [provider("weak", 1, 0.3, "x")] });
    expect((await enrichField("a", "industry", deps)).status).toBe("unknown");
  });
});

describe("enrichField — provenance + per-field TTL (AC3/AC5)", () => {
  it("persists provenance and stamps the field's TTL", async () => {
    const { deps, persisted } = mk({ providers: [provider("sirene", 0, 0.9, "Software")] });
    const r = await enrichField("a", "employeeCount", deps);
    expect(persisted).toEqual([{ field: "employeeCount", provider: "sirene" }]);
    expect(r.ttlExpiresAt?.getTime()).toBe(NOW + fieldTtlMs("employeeCount")); // long TTL
    expect(fieldTtlMs("fundingStage")).toBeLessThan(fieldTtlMs("employeeCount")); // funding shorter
  });
});

describe("budget guard + partial results (AC4)", () => {
  it("stops before spending when the budget is exhausted", async () => {
    const { deps, meterOps } = mk({ providers: [provider("paid", 10, 0.9, "x")], budgetOk: () => false });
    expect((await enrichField("a", "industry", deps)).status).toBe("budget-exhausted");
    expect(meterOps).toHaveLength(0);
  });
  it("enrichAccount emits partial results, never fails", async () => {
    const { deps } = mk({ providers: [provider("paid", 10, 0.9, "x")], budgetOk: () => false });
    const out = await enrichAccount("a", ["industry", "employeeCount"], deps);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.status === "budget-exhausted")).toBe(true);
  });
});
