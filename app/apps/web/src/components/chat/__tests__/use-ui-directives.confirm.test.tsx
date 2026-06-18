// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the registry so we can assert runRegisteredAction is / isn't invoked.
// vitest v4 requires explicit named exports (a Proxy fails export validation).
// getRegisteredActionMeta is used by the CLE-11 audit path (postPageActionLog);
// returning mutating:false makes the audit a no-op (reads are not audited), so the
// run-now executor test stays focused on the model round-trip.
vi.mock("@/lib/chat/page-actions/registry", () => ({
  runRegisteredAction: vi.fn(async () => ({ ok: true, summary: "ran" })),
  getRegisteredActionMeta: vi.fn(() => ({ mutating: false })),
}));

import { runUiDirective } from "../use-ui-directives";
import { parseUiDirective, UI_DIRECTIVE_KEY } from "@/lib/chat/ui-directives";
import { runRegisteredAction } from "@/lib/chat/page-actions/registry";
import type { InvokeActionDirective } from "@/lib/chat/ui-directives";

const mockedRun = vi.mocked(runRegisteredAction);

function ctx() {
  return {
    navigate: vi.fn(),
    openComposer: vi.fn(),
    sendActionResult: vi.fn(),
    enqueueConfirm: vi.fn(),
    highlight: vi.fn(), // CLE-15: ctx widened with a highlight fn (no-op here)
  };
}
function invoke(requireConfirm: boolean): InvokeActionDirective {
  return { kind: "invokeAction", invocationId: "inv-1", actionId: "a.b", params: { x: 1 }, requireConfirm };
}

beforeEach(() => mockedRun.mockClear());

describe("runUiDirective — invokeAction branch (CLE-05)", () => {
  it("REQUIRED — requireConfirm:true enqueues a card and does NOT run or round-trip (AC-1)", () => {
    const c = ctx();
    runUiDirective(invoke(true), c);
    expect(c.enqueueConfirm).toHaveBeenCalledTimes(1);
    expect(c.enqueueConfirm).toHaveBeenCalledWith(invoke(true));
    expect(mockedRun).not.toHaveBeenCalled();
    expect(c.sendActionResult).not.toHaveBeenCalled();
  });

  it("requireConfirm:false runs immediately and round-trips, no card (AC-4 / CLE-03 regression)", async () => {
    const c = ctx();
    runUiDirective(invoke(false), c);
    expect(c.enqueueConfirm).not.toHaveBeenCalled();
    expect(mockedRun).toHaveBeenCalledWith("a.b", { x: 1 });
    await vi.waitFor(() => expect(c.sendActionResult).toHaveBeenCalledTimes(1));
    expect(c.sendActionResult.mock.calls[0][0]).toContain("inv-1");
  });

  it("navigate / composeEmail arms are unchanged", () => {
    const c = ctx();
    runUiDirective({ kind: "navigate", path: "/accounts/a1" }, c);
    expect(c.navigate).toHaveBeenCalledWith("/accounts/a1");
    runUiDirective({ kind: "composeEmail", draft: { to: "a@b.c", subject: "S", body: "B" } }, c);
    expect(c.openComposer).toHaveBeenCalledTimes(1);
    expect(mockedRun).not.toHaveBeenCalled();
    expect(c.enqueueConfirm).not.toHaveBeenCalled();
  });

  it("a malformed invokeAction is dropped at parse time (CLE-03 parser regression)", () => {
    expect(
      parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "invokeAction", actionId: "a.b", params: {}, requireConfirm: true } }),
    ).toBeNull(); // missing invocationId
  });
});
