import { describe, it, expect, vi, beforeEach } from "vitest";

interface InsertCapture { values: Record<string, unknown> }
interface UpdateCapture { set: Record<string, unknown> }

const inserts: InsertCapture[] = [];
const updates: UpdateCapture[] = [];
let updateReturning: { id: string }[] = [{ id: "oe-1" }];

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        inserts.push({ values: v });
        return { returning: () => Promise.resolve([{ id: "oe-1" }]) };
      },
    })),
    update: vi.fn(() => ({
      set: (s: Record<string, unknown>) => {
        updates.push({ set: s });
        return { where: () => ({ returning: () => Promise.resolve(updateReturning) }) };
      },
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  outboundEmails: {
    id: "id", tenantId: "tenant_id", status: "status",
    holdUntil: "hold_until", queuedAt: "queued_at",
  },
}));

vi.mock("drizzle-orm", () => ({ and: (...a: unknown[]) => a, eq: (...a: unknown[]) => a }));

import { enqueueOutbound, cancelHeldOutbound } from "@/lib/emails/outbound-hold";

const base = {
  tenantId: "t1",
  to: "prospect@example.com",
  subject: "Hi",
  bodyHtml: "<p>hi</p>",
  bodyText: "hi",
};

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  updateReturning = [{ id: "oe-1" }];
});

describe("CLE-11 enqueueOutbound", () => {
  it("AC-8: window 60 → status held + holdUntil ~ now+60s, queuedAt null", async () => {
    const before = Date.now();
    const res = await enqueueOutbound({ ...base, settings: { outboundUndoWindowSeconds: 60 } });
    const after = Date.now();

    expect(res.held).toBe(true);
    expect(res.id).toBe("oe-1");
    const row = inserts[0].values;
    expect(row.status).toBe("held");
    expect(row.queuedAt).toBeNull();
    const holdUntil = row.holdUntil as Date;
    expect(holdUntil).toBeInstanceOf(Date);
    expect(holdUntil.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(holdUntil.getTime()).toBeLessThanOrEqual(after + 60_000 + 50);
  });

  it("AC-12: window 0 → status queued, holdUntil null, queuedAt set (today's shape)", async () => {
    const res = await enqueueOutbound({ ...base, settings: { outboundUndoWindowSeconds: 0 } });
    expect(res.held).toBe(false);
    expect(res.holdUntil).toBeNull();
    const row = inserts[0].values;
    expect(row.status).toBe("queued");
    expect(row.holdUntil).toBeNull();
    expect(row.queuedAt).toBeInstanceOf(Date);
  });

  it("AC-12: absent setting behaves like window 0 (queued, no hold)", async () => {
    await enqueueOutbound({ ...base, settings: {} });
    const row = inserts[0].values;
    expect(row.status).toBe("queued");
    expect(row.holdUntil).toBeNull();
  });

  it("AC-13: malformed window coerces to 0 → queued, no hold", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await enqueueOutbound({ ...base, settings: { outboundUndoWindowSeconds: -5 as any } });
    expect(inserts[0].values.status).toBe("queued");
    expect(inserts[0].values.holdUntil).toBeNull();
  });

  it("CLE-11 activation: a messageId dedup key is written through to message_id", async () => {
    await enqueueOutbound({ ...base, messageId: "draft:d1", settings: { outboundUndoWindowSeconds: 30 } });
    expect(inserts[0].values.messageId).toBe("draft:d1");
  });

  it("CLE-11 activation: messageId defaults to null when unset (byte-identical to today)", async () => {
    await enqueueOutbound({ ...base, settings: { outboundUndoWindowSeconds: 0 } });
    expect(inserts[0].values.messageId).toBeNull();
  });

  it("CLE-11 activation: qualityScore jsonb is written through (preserves the back-test column)", async () => {
    const qs = { composite: 0.82, framework: "PAS" };
    await enqueueOutbound({ ...base, qualityScore: qs, settings: { outboundUndoWindowSeconds: 30 } });
    expect(inserts[0].values.qualityScore).toEqual(qs);
  });

  it("CLE-11 activation: qualityScore defaults to null when unset", async () => {
    await enqueueOutbound({ ...base, settings: { outboundUndoWindowSeconds: 0 } });
    expect(inserts[0].values.qualityScore).toBeNull();
  });

  it("CLE-11 activation: errorMessage passthrough rides through (sendSequenceStep [fallback:] tag)", async () => {
    const tag = "[fallback:no_signal] sent with template-only personalisation";
    await enqueueOutbound({ ...base, errorMessage: tag, settings: { outboundUndoWindowSeconds: 30 } });
    expect(inserts[0].values.errorMessage).toBe(tag);
  });

  it("CLE-11 activation: errorMessage defaults to null when unset", async () => {
    await enqueueOutbound({ ...base, settings: { outboundUndoWindowSeconds: 0 } });
    expect(inserts[0].values.errorMessage).toBeNull();
  });

  it("E-7: an insert returning no row throws (no phantom send)", async () => {
    // Force the insert to return nothing.
    const dbMod = await import("@/db");
    vi.mocked(dbMod.db.insert).mockReturnValueOnce({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      values: () => ({ returning: () => Promise.resolve([]) }),
    } as any);
    await expect(enqueueOutbound({ ...base, settings: { outboundUndoWindowSeconds: 60 } })).rejects.toThrow();
  });
});

describe("CLE-11 cancelHeldOutbound", () => {
  it("AC-10: a still-held row → canceled, status set to canceled", async () => {
    updateReturning = [{ id: "oe-1" }];
    const res = await cancelHeldOutbound("t1", "oe-1");
    expect(res.canceled).toBe(true);
    expect(updates[0].set.status).toBe("canceled");
  });

  it("AC-11/E-5: a row no longer held (0 rows affected) → not canceled", async () => {
    updateReturning = [];
    const res = await cancelHeldOutbound("t1", "oe-1");
    expect(res.canceled).toBe(false);
    expect(res.reason).toBe("already_sending_or_sent");
  });
});
