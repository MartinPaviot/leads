import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P2 — DB-touching orchestration tests for followup-nudge-draft.ts. The pure
 * dedupe/staleness rules are already locked by followup-nudge.test.ts; these
 * tests only verify the WIRING: which conversations get drafted/skipped,
 * which pending rows get expired, and that one bad conversation never blocks
 * the rest of a user's pass (fail-soft contract). shouldDraftNudge/
 * isNudgeStale/computeNudgeExpiresAt/escalationGuidance run for REAL (not
 * mocked) so this also catches a wiring mismatch against their actual
 * contracts, not just a mock's assumptions.
 */

const selectQueue: unknown[][] = [];
const mockSelect = vi.fn((..._args: any[]) => ({
  from: () => ({
    where: () => Promise.resolve(selectQueue.shift() ?? []),
  }),
}));
const insertCalls: any[] = [];
const mockInsert = vi.fn((..._args: any[]) => ({
  values: (v: any) => {
    insertCalls.push(v);
    return Promise.resolve();
  },
}));
const updateCalls: any[] = [];
const mockUpdate = vi.fn((..._args: any[]) => ({
  set: (v: any) => ({
    where: (...whereArgs: any[]) => {
      updateCalls.push({ set: v, whereArgs });
      return Promise.resolve();
    },
  }),
}));
vi.mock("@/db", () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
  },
}));

const mockLoadConversationRows = vi.fn(async (..._args: any[]) => ({ inbound: [], outbound: [], triage: [] }));
vi.mock("../load", () => ({
  loadConversationRows: (...args: any[]) => mockLoadConversationRows(...args),
}));

const mockGetInboxScope = vi.fn(async (..._args: any[]) => ({ hasMailbox: true, mailboxes: [] }) as any);
vi.mock("../user-scope", () => ({
  getInboxScope: (...args: any[]) => mockGetInboxScope(...args),
  scopeConversationRows: (rows: any) => rows,
}));

let fixtureConversations: any[] = [];
vi.mock("../conversations", () => ({
  buildConversations: () => fixtureConversations,
}));

const mockBuildReplyInstructions = vi.fn(async (..._args: any[]) => ({ instructions: "voice+style", context: undefined }));
vi.mock("../reply-instructions", () => ({
  buildReplyInstructions: (...args: any[]) => mockBuildReplyInstructions(...args),
}));

const mockComposeReply = vi.fn(async (..._args: any[]) => ({ subject: "Re: hello", text: "Just checking in!" }));
vi.mock("../compose-reply", () => ({
  composeReply: (...args: any[]) => mockComposeReply(...args),
}));

vi.mock("@/lib/observability/logger", () => ({ logger: { warn: vi.fn() } }));

import { draftAndReconcileNudgesForUser } from "../followup-nudge-draft";

const due = (overrides: Partial<Record<string, unknown>> = {}) => ({
  dueAt: 1_000,
  stage: 1,
  overdue: true,
  daysUntilDue: 0,
  businessDaysOverdue: 1,
  ...overrides,
});

function conversation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    key: "k1",
    contactId: "c1",
    fromAddress: "them@x.com",
    subject: "Re: pricing",
    followup: due(),
    messages: [{ direction: "outbound", from: "me@x.com", to: "them@x.com", body: "Following up?", at: "2026-06-01T00:00:00Z" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
  insertCalls.length = 0;
  updateCalls.length = 0;
  fixtureConversations = [];
  mockGetInboxScope.mockResolvedValue({ hasMailbox: true, mailboxes: [] } as any);
  mockComposeReply.mockResolvedValue({ subject: "Re: hello", text: "Just checking in!" });
});

describe("draftAndReconcileNudgesForUser", () => {
  it("no-ops when the user has no connected mailbox", async () => {
    mockGetInboxScope.mockResolvedValue({ hasMailbox: false, mailboxes: [] } as any);
    const result = await draftAndReconcileNudgesForUser("t1", "u1");
    expect(result).toEqual({ drafted: 0, expired: 0 });
    expect(mockLoadConversationRows).not.toHaveBeenCalled();
  });

  it("drafts a nudge for a due conversation with no existing row, persisting pending_review", async () => {
    fixtureConversations = [conversation()];
    selectQueue.push([]); // reconcile: no pending rows
    selectQueue.push([]); // draft: no existing rows for this key

    const result = await draftAndReconcileNudgesForUser("t1", "u1");

    expect(result).toEqual({ drafted: 1, expired: 0 });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      tenantId: "t1",
      userId: "u1",
      conversationKey: "k1",
      contactId: "c1",
      toAddress: "them@x.com",
      subject: "Re: hello",
      bodyText: "Just checking in!",
      stage: 1,
      status: "pending_review",
    });
    expect(insertCalls[0].expiresAt).toBeInstanceOf(Date);
  });

  it("skips a due conversation that already has a row at this stage (any status)", async () => {
    fixtureConversations = [conversation()];
    selectQueue.push([]); // reconcile
    selectQueue.push([{ conversationKey: "k1", stage: 1 }]); // already has stage-1 row

    const result = await draftAndReconcileNudgesForUser("t1", "u1");

    expect(result.drafted).toBe(0);
    expect(insertCalls).toHaveLength(0);
  });

  it("does not draft when the conversation isn't due", async () => {
    fixtureConversations = [conversation({ followup: null })];
    selectQueue.push([]); // reconcile

    const result = await draftAndReconcileNudgesForUser("t1", "u1");

    expect(result.drafted).toBe(0);
    expect(mockComposeReply).not.toHaveBeenCalled();
  });

  it("fails closed: an empty generator result is never persisted", async () => {
    fixtureConversations = [conversation()];
    selectQueue.push([]);
    selectQueue.push([]);
    mockComposeReply.mockResolvedValue({ subject: "", text: "" });

    const result = await draftAndReconcileNudgesForUser("t1", "u1");

    expect(result.drafted).toBe(0);
    expect(insertCalls).toHaveLength(0);
  });

  it("falls back to the conversation's own subject when the generator returns no subject", async () => {
    fixtureConversations = [conversation()];
    selectQueue.push([]);
    selectQueue.push([]);
    mockComposeReply.mockResolvedValue({ subject: "", text: "Still there?" });

    await draftAndReconcileNudgesForUser("t1", "u1");

    expect(insertCalls[0].subject).toBe("Re: pricing");
  });

  it("one conversation failing (e.g. a unique-index race) doesn't block the rest of the pass", async () => {
    fixtureConversations = [conversation({ key: "k1" }), conversation({ key: "k2", fromAddress: "other@x.com" })];
    selectQueue.push([]); // reconcile
    selectQueue.push([]); // draft existing-rows batch (covers both keys)
    mockBuildReplyInstructions
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ instructions: "voice", context: undefined });

    const result = await draftAndReconcileNudgesForUser("t1", "u1");

    expect(result.drafted).toBe(1);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].conversationKey).toBe("k2");
  });

  it("expires a pending row whose live thread is no longer due (they replied)", async () => {
    fixtureConversations = [conversation({ followup: null })]; // they replied -> no followup
    selectQueue.push([{ id: "row1", conversationKey: "k1", stage: 1, expiresAt: new Date(Date.now() + 999_999_999) }]);

    const result = await draftAndReconcileNudgesForUser("t1", "u1");

    expect(result.expired).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).toMatchObject({ status: "expired" });
  });

  it("expires a pending row past its hard expiry even though the stage still matches", async () => {
    fixtureConversations = [conversation()]; // still due at stage 1
    selectQueue.push([{ id: "row1", conversationKey: "k1", stage: 1, expiresAt: new Date(Date.now() - 1000) }]);
    selectQueue.push([{ conversationKey: "k1", stage: 1 }]); // draft pass sees its own (now-expired) row -> skip

    const result = await draftAndReconcileNudgesForUser("t1", "u1");

    expect(result.expired).toBe(1);
    expect(result.drafted).toBe(0); // stage 1 still has a row on record, even though it just expired
  });

  it("does NOT expire a pending row that's still live-matching and within its expiry window", async () => {
    fixtureConversations = [conversation()]; // due at stage 1, matches the row
    selectQueue.push([{ id: "row1", conversationKey: "k1", stage: 1, expiresAt: new Date(Date.now() + 999_999_999) }]);
    selectQueue.push([{ conversationKey: "k1", stage: 1 }]);

    const result = await draftAndReconcileNudgesForUser("t1", "u1");

    expect(result.expired).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });
});
