import { describe, it, expect, vi, beforeEach } from "vitest";

let rows: Array<Record<string, unknown>> = [];
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }) },
}));
vi.mock("@/db/schema", () => ({
  connectedMailboxes: {
    id: "id", domain: "domain", provider: "provider", dailyLimit: "daily_limit",
    warmupStartedAt: "warmup_started_at", sentToday: "sent_today", tenantId: "tenant_id", status: "status",
  },
}));
vi.mock("drizzle-orm", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  and: (...a: any[]) => ({ op: "and", a }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq: (c: any, v: any) => ({ op: "eq", c, v }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inArray: (c: any, v: any) => ({ op: "inArray", c, v }),
}));

import { loadTenantCapacity, managedAuthByDomain } from "../capacity-source";
import { getWarmupDailyTarget, isWarmupComplete } from "@/lib/campaign-engine/deliverability/warmup";

const DAY = 24 * 60 * 60 * 1000;
const mb = (over: Record<string, unknown> = {}) => ({
  id: "m1", domain: "send.elevay.dev", provider: "gmail", dailyLimit: 50,
  warmupStartedAt: null, sentToday: 0, ...over,
});

beforeEach(() => { rows = []; });

describe("managedAuthByDomain", () => {
  it("OAuth providers (gmail/outlook) are sendable; smtp_custom and instantly are not", () => {
    const m = managedAuthByDomain([
      { domain: "b.com", provider: "gmail" },
      { domain: "c.com", provider: "outlook" },
      { domain: "d.com", provider: "smtp_custom" },
      { domain: "i.com", provider: "instantly" }, // no longer a managed cold-send provider
    ]);
    expect(m.get("b.com")?.sendable).toBe(true);
    expect(m.get("c.com")?.sendable).toBe(true);
    expect(m.get("d.com")?.sendable).toBe(false);
    expect(m.get("d.com")?.failures).toContain("unverified-self-managed-domain");
    expect(m.get("i.com")?.sendable).toBe(false); // instantly is not Elevay cold-send transport
  });

  it("de-dupes by domain (first wins)", () => {
    const m = managedAuthByDomain([{ domain: "x.com", provider: "gmail" }, { domain: "x.com", provider: "smtp_custom" }]);
    expect(m.size).toBe(1);
    expect(m.get("x.com")?.sendable).toBe(true);
  });
});

describe("loadTenantCapacity", () => {
  it("a warmed managed (gmail) mailbox reports effectiveCap - sentToday", async () => {
    rows = [mb({ dailyLimit: 50, sentToday: 10 })]; // warmupStartedAt null = fully warmed
    const cap = await loadTenantCapacity("t1");
    expect(cap.totalAvailable).toBe(40);
    expect(cap.byProvider.gmail).toBe(40);
  });

  it("an Instantly box contributes 0 capacity — no Elevay-controlled send transport", async () => {
    rows = [mb({ provider: "instantly", dailyLimit: 50, sentToday: 0 })];
    expect((await loadTenantCapacity("t1")).totalAvailable).toBe(0);
  });

  it("a self-managed smtp_custom mailbox reports 0 (not provider-auth-managed)", async () => {
    rows = [mb({ provider: "smtp_custom", domain: "own.com", dailyLimit: 50, sentToday: 0 })];
    const cap = await loadTenantCapacity("t1");
    expect(cap.totalAvailable).toBe(0);
  });

  it("a mid-warmup managed mailbox is clamped to the ramp target, never the steady cap", async () => {
    const started = new Date(Date.now() - 1 * DAY); // ~day 1-2 of the ramp
    rows = [mb({ warmupStartedAt: started, dailyLimit: 50, sentToday: 0 })];
    const expectedCap = isWarmupComplete(started) ? 50 : Math.min(getWarmupDailyTarget(started), 50);
    const cap = await loadTenantCapacity("t1");
    expect(cap.totalAvailable).toBe(expectedCap);
    expect(cap.totalAvailable).toBeLessThan(50); // the ramp constrains, not the steady cap
  });

  it("sums available across a pool, zeroing the unauthenticated ones", async () => {
    rows = [
      mb({ id: "a", domain: "d1.elevay.dev", provider: "gmail", dailyLimit: 50, sentToday: 5 }), // 45
      mb({ id: "b", domain: "d2.elevay.dev", provider: "gmail", dailyLimit: 50, sentToday: 0 }), // 50
      mb({ id: "c", domain: "own.com", provider: "smtp_custom", dailyLimit: 50, sentToday: 0 }), // 0 (unverified)
      mb({ id: "x", domain: "pool.instantly", provider: "instantly", dailyLimit: 50, sentToday: 0 }), // 0 (no Elevay transport, filtered)
    ];
    const cap = await loadTenantCapacity("t1");
    expect(cap.totalAvailable).toBe(95);
    expect(cap.byProvider.gmail).toBe(95);
  });

  it("no mailboxes → 0 capacity", async () => {
    rows = [];
    expect((await loadTenantCapacity("t1")).totalAvailable).toBe(0);
  });
});
