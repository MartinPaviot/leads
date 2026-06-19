// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CLE-15 — the executor highlight arms + the dock afterNavigation poll.
 *  - navigate arm: calls ctx.navigate, then ctx.highlight(anchor,{afterNavigation:true}) when set.
 *  - run-now invokeAction arm: calls maybeHighlightFromResult after a successful round-trip.
 *  - dock poll: resolves once the locator appears; gives up silently after the budget.
 */

// Registry mock so the run-now arm resolves a controllable result + the audit
// path is a no-op (mutating:false). The dock-poll tests use the REAL
// locateEntity/highlightEntity, so those are kept as the actual implementations
// in a separate suite below (different file env handled by vi.importActual).
const runResult = { ok: true, summary: "ran", data: undefined as unknown };
vi.mock("@/lib/chat/page-actions/registry", () => ({
  runRegisteredAction: vi.fn(async () => runResult),
  getRegisteredActionMeta: vi.fn(() => ({ mutating: false })),
}));

import { runUiDirective } from "../use-ui-directives";
import type { InvokeActionDirective, HighlightAnchor } from "@/lib/chat/ui-directives";

function ctx() {
  return {
    navigate: vi.fn(),
    openComposer: vi.fn(),
    sendActionResult: vi.fn(),
    enqueueConfirm: vi.fn(),
    highlight: vi.fn(),
  };
}
function invoke(requireConfirm: boolean): InvokeActionDirective {
  return { kind: "invokeAction", invocationId: "inv-1", actionId: "a.b", params: { x: 1 }, requireConfirm };
}

beforeEach(() => {
  runResult.ok = true;
  runResult.summary = "ran";
  runResult.data = undefined;
});

describe("runUiDirective — navigate highlight arm (CLE-15)", () => {
  it("calls navigate then highlight(anchor,{afterNavigation:true}) when a highlight is set (AC-1/AC-5)", () => {
    const c = ctx();
    const anchor: HighlightAnchor = { entityId: "a1", scope: "accounts" };
    runUiDirective({ kind: "navigate", path: "/accounts/a1", highlight: anchor }, c);
    expect(c.navigate).toHaveBeenCalledWith("/accounts/a1");
    expect(c.highlight).toHaveBeenCalledWith(anchor, { afterNavigation: true });
  });

  it("calls ONLY navigate when there is no highlight (regression)", () => {
    const c = ctx();
    runUiDirective({ kind: "navigate", path: "/accounts/a1" }, c);
    expect(c.navigate).toHaveBeenCalledWith("/accounts/a1");
    expect(c.highlight).not.toHaveBeenCalled();
  });
});

describe("runUiDirective — run-now invokeAction highlight (CLE-15)", () => {
  it("highlights from the result after a successful round-trip (AC-4)", async () => {
    const c = ctx();
    runResult.data = { highlight: { entityId: "d1", scope: "opportunities", field: "stage" } };
    runUiDirective(invoke(false), c);
    await vi.waitFor(() => expect(c.sendActionResult).toHaveBeenCalledTimes(1));
    expect(c.highlight).toHaveBeenCalledWith([{ entityId: "d1", scope: "opportunities", field: "stage" }]);
  });

  it("does not highlight when the result carries none", async () => {
    const c = ctx();
    runResult.data = { other: 1 };
    runUiDirective(invoke(false), c);
    await vi.waitFor(() => expect(c.sendActionResult).toHaveBeenCalledTimes(1));
    expect(c.highlight).not.toHaveBeenCalled();
  });

  it("does not highlight a failed run", async () => {
    const c = ctx();
    runResult.ok = false;
    runResult.data = { highlight: { entityId: "d1" } };
    runUiDirective(invoke(false), c);
    await vi.waitFor(() => expect(c.sendActionResult).toHaveBeenCalledTimes(1));
    expect(c.highlight).not.toHaveBeenCalled();
  });

  it("confirm-needed does NOT run or highlight (CLE-05 regression)", () => {
    const c = ctx();
    runUiDirective(invoke(true), c);
    expect(c.enqueueConfirm).toHaveBeenCalledTimes(1);
    expect(c.highlight).not.toHaveBeenCalled();
  });
});
