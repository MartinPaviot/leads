import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn((..._args: any[]) => ({
  values: vi.fn(() => ({
    returning: vi.fn(() => [{ id: "outcome-1" }]),
  })),
}));

const mockSelect = vi.fn((..._args: any[]) => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(() => []),
    })),
  })),
}));

const mockUpdate = vi.fn((..._args: any[]) => ({
  set: vi.fn(() => ({
    where: vi.fn(),
  })),
}));

vi.mock("@/db", () => ({
  db: {
    insert: (...args: any[]) => mockInsert(...args),
    select: (...args: any[]) => mockSelect(...args),
    update: (...args: any[]) => mockUpdate(...args),
  },
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    send: vi.fn(() => Promise.resolve()),
  },
}));

import { createOutcomeWatcher } from "@/lib/outcomes/create-watcher";

describe("Outcome Tracking — Watcher Creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a watcher with correct window for email actions", async () => {
    const result = await createOutcomeWatcher({
      tenantId: "t1",
      actionId: "a1",
      entityType: "contact",
      entityId: "c1",
      actionType: "send_followup",
      triggerType: "email_replied",
    });

    expect(result.id).toBe("outcome-1");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("creates a watcher with correct window for deal actions", async () => {
    const result = await createOutcomeWatcher({
      tenantId: "t1",
      actionId: "a2",
      entityType: "deal",
      entityId: "d1",
      actionType: "advance_deal",
    });

    expect(result.id).toBe("outcome-1");
  });

  it("creates a watcher with optional reaction ID", async () => {
    const result = await createOutcomeWatcher({
      tenantId: "t1",
      actionId: "a3",
      reactionId: "r1",
      entityType: "contact",
      entityId: "c2",
      actionType: "enroll_sequence",
      triggerType: "signal_detected",
      entitySnapshot: { name: "Test Company", score: 85 },
    });

    expect(result.id).toBe("outcome-1");
  });
});
