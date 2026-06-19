import { describe, it, expect, vi, beforeEach } from "vitest";

const getLastReversibleCall = vi.fn();
const reverseToolCall = vi.fn();

vi.mock("@/lib/chat/tool-call-log", () => ({
  getLastReversibleCall: (...a: unknown[]) => getLastReversibleCall(...a),
  reverseToolCall: (...a: unknown[]) => reverseToolCall(...a),
}));

import { buildUndoTools } from "@/lib/chat/tools/undo";
import { UI_DIRECTIVE_KEY } from "@/lib/chat/ui-directives";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: any = {
  tenantId: "t1",
  userId: "u1",
  authCtx: { tenantId: "t1", userId: "u1", appUserId: "u1", role: "member" },
  settings: {},
  agentApprovalMode: "review-each",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runUndo(input: any) {
  const tools = buildUndoTools(ctx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tools.undoLastAction as any).execute(input);
}

beforeEach(() => {
  getLastReversibleCall.mockReset();
  reverseToolCall.mockReset();
});

describe("CLE-11 undoLastAction", () => {
  it("AC-5: spreads the invokeAction directive for a PAR reversal", async () => {
    getLastReversibleCall.mockResolvedValue({ id: "evt-1" });
    reverseToolCall.mockResolvedValue({
      ok: true,
      reverseEventId: null,
      reversedAction: "page action (undo sent to the page)",
      [UI_DIRECTIVE_KEY]: undefined, // not how it's carried — directive is nested
      directive: {
        [UI_DIRECTIVE_KEY]: {
          kind: "invokeAction",
          invocationId: "inv-1",
          actionId: "opportunities.moveStage",
          params: { dealId: "d1", stage: "qualified" },
          requireConfirm: false,
          reconcileEventId: "evt-1",
        },
      },
      reconcileEventId: "evt-1",
    });

    const res = await runUndo({});
    expect(res.reverted).toBeDefined();
    // The directive is spread onto the tool result so the dock dispatches it.
    expect(res[UI_DIRECTIVE_KEY]).toBeDefined();
    expect(res[UI_DIRECTIVE_KEY].kind).toBe("invokeAction");
    expect(res[UI_DIRECTIVE_KEY].actionId).toBe("opportunities.moveStage");
    expect(res[UI_DIRECTIVE_KEY].reconcileEventId).toBe("evt-1");
  });

  it("AC-10: returns plain { reverted } for an in-window outbound cancel (no directive)", async () => {
    getLastReversibleCall.mockResolvedValue({ id: "evt-2" });
    reverseToolCall.mockResolvedValue({
      ok: true,
      reverseEventId: null,
      reversedAction: "email send (canceled before it left)",
    });

    const res = await runUndo({});
    expect(res.reverted.reversedAction).toContain("canceled");
    expect(res[UI_DIRECTIVE_KEY]).toBeUndefined();
  });

  it("AC-11: returns { error } after the window (already sent)", async () => {
    getLastReversibleCall.mockResolvedValue({ id: "evt-3" });
    reverseToolCall.mockResolvedValue({
      ok: false,
      error: "This email was already sent 2026-06-18T10:00:00.000Z and can't be unsent.",
    });

    const res = await runUndo({});
    expect(res.error).toContain("already sent");
    expect(res.reverted).toBeUndefined();
  });

  it("returns { error } when nothing is reversible", async () => {
    getLastReversibleCall.mockResolvedValue(null);
    const res = await runUndo({});
    expect(res.error).toBe("No reversible action found");
  });

  it("AC-16: refuses an event scoped to another user (reverseToolCall not found)", async () => {
    reverseToolCall.mockResolvedValue({ ok: false, error: "Event not found" });
    const res = await runUndo({ eventId: "someone-elses" });
    expect(res.error).toBe("Event not found");
    // It used the caller's tenant/user scope.
    expect(reverseToolCall).toHaveBeenCalledWith("t1", "u1", "someone-elses");
  });
});
