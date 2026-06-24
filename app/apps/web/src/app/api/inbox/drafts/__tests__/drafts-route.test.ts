import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Controllable mock for the drizzle builder ──────────────────────────────
let updateReturning: Array<{ id: string }> = [];
let selectRows: Array<{ id: string }> = [];
let insertReturning: Array<{ id: string }> = [{ id: "new-1" }];
const calls: string[] = [];

vi.mock("@/db", () => ({
  db: {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            calls.push("update.returning");
            return updateReturning;
          },
          // dedup-path update has no .returning()
          then: undefined,
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            calls.push("select.limit");
            return selectRows;
          },
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => {
          calls.push("insert.returning");
          return insertReturning;
        },
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  outboundEmails: { id: "id", tenantId: "tenant_id", contactId: "contact_id", threadId: "thread_id", status: "status", sentAt: "sent_at" },
}));
vi.mock("drizzle-orm", () => ({ and: (...a: unknown[]) => a, eq: (...a: unknown[]) => a, isNull: (...a: unknown[]) => a }));

let auth: { tenantId: string } | null = { tenantId: "t1" };
vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: async () => auth }));

import { POST } from "@/app/api/inbox/drafts/route";

function req(body: unknown) {
  return new Request("http://x/api/inbox/drafts", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  updateReturning = [];
  selectRows = [];
  insertReturning = [{ id: "new-1" }];
  calls.length = 0;
  auth = { tenantId: "t1" };
});

describe("POST /api/inbox/drafts upsert", () => {
  it("401 when unauthenticated", async () => {
    auth = null;
    const res = await POST(req({ to: "x@a.com" }));
    expect(res.status).toBe(401);
  });

  it("with an id → updates that draft and returns it", async () => {
    updateReturning = [{ id: "d-9" }];
    const res = await POST(req({ id: "d-9", contactId: "c1", to: "x@a.com", subject: "Hi", bodyHtml: "b" }));
    expect(await res.json()).toEqual({ id: "d-9" });
    expect(calls[0]).toBe("update.returning"); // id path first
  });

  it("no id, existing draft for the contact → dedup-updates it (no new row)", async () => {
    selectRows = [{ id: "d-7" }];
    const res = await POST(req({ contactId: "c1", threadId: "<t1>", to: "x@a.com", subject: "Hi", bodyHtml: "b" }));
    expect(await res.json()).toEqual({ id: "d-7" });
    expect(calls).toContain("select.limit");
    expect(calls).not.toContain("insert.returning");
  });

  it("no id, no existing → inserts a fresh draft", async () => {
    selectRows = [];
    insertReturning = [{ id: "new-42" }];
    const res = await POST(req({ contactId: "c1", to: "x@a.com", subject: "Hi", bodyHtml: "b" }));
    expect(await res.json()).toEqual({ id: "new-42" });
    expect(calls).toContain("insert.returning");
  });

  it("no contactId → inserts (no dedup select)", async () => {
    insertReturning = [{ id: "new-9" }];
    const res = await POST(req({ to: "x@a.com", subject: "Hi", bodyHtml: "b" }));
    expect(await res.json()).toEqual({ id: "new-9" });
    expect(calls).not.toContain("select.limit");
    expect(calls).toContain("insert.returning");
  });

  it("400 on a malformed body", async () => {
    const bad = new Request("http://x/api/inbox/drafts", { method: "POST", body: "not json" });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });
});
