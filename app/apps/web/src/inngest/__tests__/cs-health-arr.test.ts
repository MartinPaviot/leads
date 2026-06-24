import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", () => ({ inngest: { createFunction: vi.fn(() => ({})) } }));
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({
  accountHealthSnapshots: {},
  companies: { id: "c.id", tenantId: "c.tenantId" },
  tenants: { id: "t.id" },
  activities: { occurredAt: "a.o", tenantId: "a.t", entityType: "a.et", entityId: "a.ei", sentiment: "a.s" },
  deals: { value: "d.value", platformArr: "d.platformArr", tenantId: "d.tenantId", companyId: "d.companyId", stage: "d.stage", updatedAt: "d.updatedAt" },
}));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), desc: vi.fn(), eq: vi.fn(), gte: vi.fn(), sql: Object.assign(() => ({}), { raw: () => ({}) }) }));
vi.mock("@/lib/cs/health-score", () => ({ computeHealthScore: vi.fn(), defaultNextActionFor: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

import { db } from "@/db";
const mod = await import("@/inngest/cs-health-cron");

function chain(rows: unknown[]) {
  const c: Record<string, any> = {};
  c.from = () => c;
  c.where = () => Promise.resolve(rows);
  return c;
}

describe("computeAccountArrExposure (R5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when the account has no open deals", async () => {
    vi.mocked(db.select).mockReturnValue(chain([]) as never);
    expect(await mod.computeAccountArrExposure("t1", "a1")).toBeNull();
  });

  it("sums platformArr (the ARR-eligible recurring booking) across open deals", async () => {
    vi.mocked(db.select).mockReturnValue(chain([
      { value: 5000, platformArr: 2400 },
      { value: 1000, platformArr: 1200 },
    ]) as never);
    expect(await mod.computeAccountArrExposure("t1", "a1")).toBe(3600);
  });

  it("falls back to legacy value when a deal has no platformArr", async () => {
    vi.mocked(db.select).mockReturnValue(chain([
      { value: 5000, platformArr: null },
      { value: 1000, platformArr: null },
    ]) as never);
    expect(await mod.computeAccountArrExposure("t1", "a1")).toBe(6000);
  });

  it("returns null when open deals exist but sum to zero", async () => {
    vi.mocked(db.select).mockReturnValue(chain([{ value: 0, platformArr: null }]) as never);
    expect(await mod.computeAccountArrExposure("t1", "a1")).toBeNull();
  });
});
