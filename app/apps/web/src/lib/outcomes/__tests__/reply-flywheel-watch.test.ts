import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
vi.mock("@/db", () => ({
  db: { select: (...args: any[]) => mockSelect(...args) },
}));

const mockCreateOutcomeWatcher = vi.fn(async (..._args: any[]) => ({ id: "outcome-1" }));
vi.mock("../create-watcher", () => ({
  createOutcomeWatcher: (...args: any[]) => mockCreateOutcomeWatcher(...args),
}));

import { watchReplyOutcome, REPLY_FLYWHEEL_AGENT_ID, REPLY_FLYWHEEL_ACTION_TYPE } from "../reply-flywheel";

/**
 * P3 — watchReplyOutcome is the integration seam between a just-sent reply
 * and the outcome-tracking system. Verifies it (a) looks up the latest
 * inbound message and folds it + the sent body into the watcher's
 * entitySnapshot, and (b) is fail-soft — a DB hiccup never throws into the
 * caller (deliverInteractiveEmail must never fail a send over this).
 */

function selectReturning(rows: unknown[]) {
  mockSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
  });
}

function lastWatcherCall(): any {
  return mockCreateOutcomeWatcher.mock.calls.at(-1)?.[0];
}

describe("watchReplyOutcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a contact-scoped 'draft_reply' watcher carrying the inbound + reply text", async () => {
    selectReturning([{ rawContent: "What does it cost for 8 seats?", summary: null }]);

    await watchReplyOutcome({ tenantId: "t1", contactId: "c1", replyBody: "8 seats runs $X/mo." });

    expect(mockCreateOutcomeWatcher).toHaveBeenCalledTimes(1);
    const call = lastWatcherCall();
    expect(call.tenantId).toBe("t1");
    expect(call.entityType).toBe("contact");
    expect(call.entityId).toBe("c1");
    expect(call.actionType).toBe(REPLY_FLYWHEEL_ACTION_TYPE);
    expect(call.entitySnapshot.agentId).toBe(REPLY_FLYWHEEL_AGENT_ID);
    expect(call.entitySnapshot.input).toBe("What does it cost for 8 seats?");
    expect(call.entitySnapshot.output).toBe("8 seats runs $X/mo.");
  });

  it("falls back to the activity summary when rawContent is empty", async () => {
    selectReturning([{ rawContent: "", summary: "Asked about HubSpot import" }]);

    await watchReplyOutcome({ tenantId: "t1", contactId: "c1", replyBody: "Yes, native import." });

    expect(lastWatcherCall().entitySnapshot.input).toBe("Asked about HubSpot import");
  });

  it("still creates the watcher (empty input) when there's no inbound history — degrades, doesn't skip", async () => {
    selectReturning([]);

    await watchReplyOutcome({ tenantId: "t1", contactId: "c1", replyBody: "Following up." });

    expect(mockCreateOutcomeWatcher).toHaveBeenCalledTimes(1);
    expect(lastWatcherCall().entitySnapshot.input).toBe("");
  });

  it("never throws when the lookup query rejects (fail-soft — must not block a send)", async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.reject(new Error("db down")),
          }),
        }),
      }),
    });

    await expect(
      watchReplyOutcome({ tenantId: "t1", contactId: "c1", replyBody: "Hi." }),
    ).resolves.toBeUndefined();
  });

  it("never throws when createOutcomeWatcher itself rejects (fail-soft)", async () => {
    selectReturning([]);
    mockCreateOutcomeWatcher.mockRejectedValueOnce(new Error("insert failed"));

    await expect(
      watchReplyOutcome({ tenantId: "t1", contactId: "c1", replyBody: "Hi." }),
    ).resolves.toBeUndefined();
  });
});
