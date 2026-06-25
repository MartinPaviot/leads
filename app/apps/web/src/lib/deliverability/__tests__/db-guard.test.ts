import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({
  outboundEmails: { tenantId: "tenant_id", sentAt: "sent_at", bouncedAt: "bounced_at", bounceType: "bounce_type", toAddress: "to_address", repliedAt: "replied_at" },
  deliverabilityGuardState: { scope: "scope" },
}));
vi.mock("drizzle-orm", () => ({ and: (...a: unknown[]) => a, eq: () => ({}), gte: () => ({}), or: (...a: unknown[]) => a }));

import { rowsToEvents, evaluateGuard } from "../db-guard";

describe("rowsToEvents", () => {
  it("maps sent->send, permanent bounce->hard bounce w/ address, complaint->complaint, replied->reply", () => {
    const ev = rowsToEvents([
      { sentAt: new Date(1000), bouncedAt: new Date(2000), bounceType: "permanent", toAddress: "X@Y.com", repliedAt: null },
      { sentAt: new Date(3000), bouncedAt: new Date(4000), bounceType: "complaint", toAddress: "a@b.com", repliedAt: new Date(5000) },
      { sentAt: null, bouncedAt: null, bounceType: null, toAddress: "c@d.com", repliedAt: null },
    ]);
    expect(ev).toContainEqual({ type: "send", at: 1000 });
    expect(ev).toContainEqual({ type: "bounce", at: 2000, hard: true, address: "X@Y.com" });
    expect(ev).toContainEqual({ type: "complaint", at: 4000 });
    expect(ev).toContainEqual({ type: "reply", at: 5000 });
    expect(ev.filter((e) => e.type === "send")).toHaveLength(2);
  });

  it("classifies the EmailEngine 'hard'/'soft' vocabulary too (not just Resend's 'permanent'/'temporary')", () => {
    // EmailEngine (emailengine/route.ts:150) writes "hard"/"soft"; the guard must
    // treat "hard" as a hard bounce so hardBounceAddresses() doesn't under-report
    // it. "soft"/"temporary" are bounces but not hard.
    const ev = rowsToEvents([
      { sentAt: new Date(1000), bouncedAt: new Date(2000), bounceType: "hard", toAddress: "ee@hard.com", repliedAt: null },
      { sentAt: new Date(1000), bouncedAt: new Date(2000), bounceType: "soft", toAddress: "ee@soft.com", repliedAt: null },
      { sentAt: new Date(1000), bouncedAt: new Date(2000), bounceType: "temporary", toAddress: "rs@temp.com", repliedAt: null },
    ]);
    expect(ev).toContainEqual({ type: "bounce", at: 2000, hard: true, address: "ee@hard.com" });
    expect(ev).toContainEqual({ type: "bounce", at: 2000, hard: false, address: "ee@soft.com" });
    expect(ev).toContainEqual({ type: "bounce", at: 2000, hard: false, address: "rs@temp.com" });
  });
});

// Stub db: distinguishes the guard-state select (table has `.scope`) from the
// outbound select, and captures the upserted guard row.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubDb(outRows: any[], stateRow: any | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const thenable = (rows: any[]) => {
    const p: any = Promise.resolve(rows);
    p.limit = () => Promise.resolve(rows);
    return p;
  };
  let upserted: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  const dbObj = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: () => ({ from: (table: any) => ({ where: () => thenable(table?.scope ? (stateRow ? [stateRow] : []) : outRows) }) }),
    insert: () => ({ values: (v: any) => ({ onConflictDoUpdate: async () => { upserted = v; } }) }), // eslint-disable-line @typescript-eslint/no-explicit-any
    _upserted: () => upserted,
  };
  return dbObj as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe("evaluateGuard", () => {
  const now = 10_000_000;
  const recent = now - 1000;

  it("pauses a tenant whose bounce rate breaches with enough sample", async () => {
    // 20 sends, 2 hard bounces = 10% > 5% pause threshold, sample >= 20.
    const rows = Array.from({ length: 20 }, (_, i) => ({ sentAt: new Date(recent), bouncedAt: i < 2 ? new Date(recent) : null, bounceType: i < 2 ? "permanent" : null, toAddress: `u${i}@x.com`, repliedAt: null }));
    const db = stubDb(rows, null);
    const state = await evaluateGuard("t1", { now, database: db });
    expect(state.status).toBe("paused");
    expect(db._upserted().status).toBe("paused");
  });

  it("stays active when healthy (no breach) and does not write", async () => {
    const rows = Array.from({ length: 20 }, () => ({ sentAt: new Date(recent), bouncedAt: null, bounceType: null, toAddress: "u@x.com", repliedAt: null }));
    const db = stubDb(rows, null);
    const state = await evaluateGuard("t1", { now, database: db });
    expect(state.status).toBe("active");
    expect(db._upserted()).toBeNull(); // healthy active -> no transition -> no write
  });

  it("does not pause below the min sample even at a high rate", async () => {
    // 5 sends, 3 bounces = 60% but sample < 20 -> no breach.
    const rows = Array.from({ length: 5 }, (_, i) => ({ sentAt: new Date(recent), bouncedAt: i < 3 ? new Date(recent) : null, bounceType: i < 3 ? "permanent" : null, toAddress: `u${i}@x.com`, repliedAt: null }));
    const state = await evaluateGuard("t1", { now, database: stubDb(rows, null) });
    expect(state.status).toBe("active");
  });
});
