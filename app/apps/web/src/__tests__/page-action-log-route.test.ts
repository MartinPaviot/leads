import { describe, it, expect, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
const logPageActionCall = vi.fn();
const reopenEvent = vi.fn();
// The route consults the validator and nulls the snapshot when it returns false.
// We control its verdict per-test here; its actual accept/reject LOGIC is locked
// in reversible-snapshot-validation.test.ts.
const isValidReversibleSnapshot = vi.fn((_s?: unknown) => true);

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: () => getAuthContext(),
}));
vi.mock("@/lib/chat/tool-call-log", () => ({
  logPageActionCall: (...a: unknown[]) => logPageActionCall(...a),
  reopenEvent: (...a: unknown[]) => reopenEvent(...a),
  isValidReversibleSnapshot: (s: unknown) => isValidReversibleSnapshot(s),
}));

import { POST } from "@/app/api/chat/page-action-log/route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/chat/page-action-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const authCtx = { tenantId: "t1", userId: "u1", appUserId: "u1", role: "member" };

beforeEach(() => {
  getAuthContext.mockReset();
  logPageActionCall.mockReset();
  reopenEvent.mockReset();
  isValidReversibleSnapshot.mockReset();
  getAuthContext.mockResolvedValue(authCtx);
  logPageActionCall.mockResolvedValue("evt-1");
  reopenEvent.mockResolvedValue(true);
  isValidReversibleSnapshot.mockReturnValue(true);
});

describe("CLE-11 POST /api/chat/page-action-log", () => {
  it("AC-16: 401 when unauthenticated", async () => {
    getAuthContext.mockResolvedValue(null);
    const res = await POST(req({ actionId: "x", mutating: true }));
    expect(res.status).toBe(401);
    expect(logPageActionCall).not.toHaveBeenCalled();
  });

  it("AC-1/AC-3: a mutating forward result logs one row with a page_action inverse", async () => {
    const res = await POST(req({
      invocationId: "inv-1",
      actionId: "opportunities.moveStage",
      params: { dealId: "d1", stage: "won" },
      ok: true, summary: "Moved", surfaceType: "opportunities",
      mutating: true,
      undo: { kind: "reinvoke", actionId: "opportunities.moveStage", params: { dealId: "d1", stage: "qualified" } },
    }));
    const json = await res.json();
    expect(json.logged).toBe(true);
    expect(logPageActionCall).toHaveBeenCalledTimes(1);
    const arg = logPageActionCall.mock.calls[0][0];
    expect(arg.tenantId).toBe("t1");
    expect(arg.userId).toBe("u1");
    expect(arg.snapshot).toEqual({
      type: "page_action",
      actionId: "opportunities.moveStage",
      inverse: { actionId: "opportunities.moveStage", params: { dealId: "d1", stage: "qualified" } },
    });
  });

  it("AC-6: a server undo descriptor becomes the embedded server snapshot", async () => {
    await POST(req({
      actionId: "deal.create", params: {}, ok: true, mutating: true,
      undo: { kind: "server", snapshot: { type: "create", entity: "deal", id: "d9" } },
    }));
    const arg = logPageActionCall.mock.calls[0][0];
    expect(arg.snapshot).toEqual({ type: "create", entity: "deal", id: "d9" });
    expect(isValidReversibleSnapshot).toHaveBeenCalledWith({ type: "create", entity: "deal", id: "d9" });
  });

  it("CLE-11 #2: an INVALID server snapshot is rejected to null (logged, not undoable)", async () => {
    isValidReversibleSnapshot.mockReturnValue(false);
    await POST(req({
      actionId: "deal.create", params: {}, ok: true, mutating: true,
      undo: { kind: "server", snapshot: { type: "wat", entity: "secrets" } },
    }));
    // Still logged (the forward action did happen) but with no persisted snapshot.
    expect(logPageActionCall).toHaveBeenCalledTimes(1);
    expect(logPageActionCall.mock.calls[0][0].snapshot).toBeNull();
  });

  it("400 when mutating but actionId is missing (and nothing logged)", async () => {
    const res = await POST(req({ mutating: true, ok: true }));
    expect(res.status).toBe(400);
    expect(logPageActionCall).not.toHaveBeenCalled();
  });

  it("a mutating forward with NO undo logs snapshot:null and never calls the validator", async () => {
    await POST(req({ actionId: "deal.create", params: {}, ok: true, mutating: true }));
    expect(logPageActionCall).toHaveBeenCalledTimes(1);
    expect(logPageActionCall.mock.calls[0][0].snapshot).toBeNull();
    expect(isValidReversibleSnapshot).not.toHaveBeenCalled();
  });

  it("AC-2: a non-mutating (read) result is NOT logged", async () => {
    const res = await POST(req({ actionId: "list.applyFilter", params: {}, ok: true, mutating: false }));
    const json = await res.json();
    expect(json.logged).toBe(false);
    expect(logPageActionCall).not.toHaveBeenCalled();
  });

  it("AC-2: absent mutating flag defaults to NOT logged", async () => {
    await POST(req({ actionId: "list.applyFilter", params: {}, ok: true }));
    expect(logPageActionCall).not.toHaveBeenCalled();
  });

  it("AC-4: ok:false still logs (failed row) when mutating", async () => {
    await POST(req({ actionId: "deal.create", params: {}, ok: false, error: "boom", mutating: true }));
    const arg = logPageActionCall.mock.calls[0][0];
    expect(arg.ok).toBe(false);
    expect(arg.error).toBe("boom");
  });

  it("E-3: a reversal with reconcileEventId + ok:false re-opens the event", async () => {
    const res = await POST(req({ reconcileEventId: "evt-1", ok: false }));
    const json = await res.json();
    expect(json.reconciled).toBe(true);
    expect(json.reopened).toBe(true);
    expect(reopenEvent).toHaveBeenCalledWith("t1", "u1", "evt-1");
    expect(logPageActionCall).not.toHaveBeenCalled();
  });

  it("E-3: a reversal with reconcileEventId + ok:true leaves it reverted", async () => {
    const res = await POST(req({ reconcileEventId: "evt-1", ok: true }));
    const json = await res.json();
    expect(json.reopened).toBe(false);
    expect(reopenEvent).not.toHaveBeenCalled();
  });
});
