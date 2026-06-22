import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P0-7 T4 — the BullMQ send path must pass a RFC-8058 One-Click
 * List-Unsubscribe header to emailengine.sendEmail. Mocks the infra; uses the
 * REAL unsubscribe builder (exercises the @web alias) with AUTH_SECRET set.
 */

const mockHolder: { processor?: (job: { data: { outboundEmailId: string } }) => Promise<unknown> } = {};
const mockSendEmail = vi.fn().mockResolvedValue({ messageId: "m", id: "i", response: "OK" });
const mockSelect = vi.fn();
const mockUpdate = vi.fn(() => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }));
const mockInsert = vi.fn(() => ({ values: () => Promise.resolve(undefined) }));

vi.mock("bullmq", () => ({
  // Classes, not vi.fn() arrows — under vitest 4 an arrow mock impl is not
  // constructible with `new` (the cause of the pre-existing workers.test.ts break).
  Worker: class {
    constructor(_name: string, processor: never) {
      mockHolder.processor = processor as never;
    }
    on() {}
    close() {}
  },
  Queue: class {
    add() {}
    upsertJobScheduler() {}
  },
}));

vi.mock("../queues/index.js", () => ({ connection: {}, sendQueue: { add: vi.fn() } }));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), sql: vi.fn(() => ({})) }));

vi.mock("../db.js", () => ({
  db: {
    select: (...a: unknown[]) => mockSelect(...a),
    update: () => mockUpdate(),
    insert: () => mockInsert(),
  },
  connectedMailboxes: {},
  outboundEmails: {},
  emailOptouts: {},
  sequenceEnrollments: {},
  pipelineEvents: {},
}));

vi.mock("../services/emailengine.js", () => ({ sendEmail: (...a: unknown[]) => mockSendEmail(...a) }));
vi.mock("../services/rate-limiter.js", () => ({
  RateLimiter: { check: vi.fn().mockResolvedValue(true), recordSend: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../services/rotation.js", () => ({ RotationEngine: { pickMailbox: vi.fn().mockResolvedValue(null) } }));
// NOTE: ../services/unsubscribe.js is intentionally NOT mocked — the real
// builder runs through the @web alias (Fix 3 + Fix 4).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: unknown[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {
    from: () => c,
    where: () => c,
    limit: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return c;
}

const email = {
  id: "oe1",
  status: "queued",
  tenantId: "t1",
  toAddress: "bob@acme.com",
  bodyHtml: "<p>hi</p>",
  bodyText: "hi",
  subject: "Hi",
  inReplyTo: null,
  mailboxId: "mb1",
  enrollmentId: null,
  contactId: "c1",
};
const mailbox = {
  id: "mb1",
  status: "active",
  eeAccountId: "ee1",
  displayName: "Me",
  emailAddress: "me@send.com",
  domain: "send.com",
  sentToday: 0,
  dailyLimit: 50,
  sendWindowStart: "08:00",
  sendWindowEnd: "18:00",
  sendDays: ["mon", "tue", "wed", "thu", "fri"],
  bounceCount7d: 0,
  sentTotal: 0,
};

describe("send.worker — One-Click List-Unsubscribe header", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
    mockSendEmail.mockClear();
    let call = 0;
    const results: unknown[][] = [[email], [], [mailbox]]; // email, optout, mailbox
    mockSelect.mockImplementation(() => chain(results[call++] ?? []));
  });

  it("passes List-Unsubscribe + One-Click headers to sendEmail", async () => {
    const { createSendWorker } = await import("../workers/send.worker.js");
    createSendWorker();
    expect(mockHolder.processor).toBeTypeOf("function");

    await mockHolder.processor!({ data: { outboundEmailId: "oe1" } });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const arg = mockSendEmail.mock.calls[0][1] as { headers: Record<string, string> };
    expect(arg.headers["List-Unsubscribe"]).toMatch(/^<https?:\/\/.+\/api\/unsubscribe\?.+>$/);
    expect(arg.headers["List-Unsubscribe"]).toContain("tenant=t1");
    expect(arg.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
