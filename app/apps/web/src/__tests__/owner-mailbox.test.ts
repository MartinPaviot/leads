import { describe, it, expect, vi, beforeEach } from "vitest";

// getOwnerMailbox does two selects: users (app id -> clerkId/auth id), then
// connected_mailboxes (by auth id). Drive both from a queue so we can assert
// the mapping + the "never borrow a colleague's mailbox" fallbacks.
let QUEUE: unknown[][] = [];
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => QUEUE.shift() ?? [] }) }) }),
  },
}));
vi.mock("@/db/schema", () => ({
  connectedMailboxes: { id: "id", emailAddress: "emailAddress", tenantId: "tenantId", userId: "userId", status: "status" },
  users: { id: "id", clerkId: "clerkId" },
}));
vi.mock("drizzle-orm", () => ({ and: (...a: unknown[]) => a, eq: (...a: unknown[]) => a }));

import { getOwnerMailbox } from "@/lib/integrations/owner-mailbox";

beforeEach(() => { QUEUE = []; });

describe("getOwnerMailbox", () => {
  it("returns null for a missing owner without touching the db", async () => {
    expect(await getOwnerMailbox("t1", null)).toBeNull();
    expect(await getOwnerMailbox("t1", undefined)).toBeNull();
    expect(await getOwnerMailbox("t1", "")).toBeNull();
  });
  it("resolves the owner's active mailbox (app-user -> auth-user -> mailbox)", async () => {
    QUEUE = [[{ authUserId: "auth-1" }], [{ id: "mb-1", emailAddress: "me@pilae.ch" }]];
    expect(await getOwnerMailbox("t1", "app-1")).toEqual({ id: "mb-1", emailAddress: "me@pilae.ch" });
  });
  it("returns null when the owner (app user) is unknown", async () => {
    QUEUE = [[]];
    expect(await getOwnerMailbox("t1", "app-x")).toBeNull();
  });
  it("returns null when the owner has no active mailbox (never borrows a colleague's)", async () => {
    QUEUE = [[{ authUserId: "auth-1" }], []];
    expect(await getOwnerMailbox("t1", "app-1")).toBeNull();
  });
});
