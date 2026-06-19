// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { z } from "zod";
import {
  useRegisterPageActions,
  getActionManifest,
  runRegisteredAction,
  __resetPageActionsForTest,
} from "@/lib/chat/page-actions/registry";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";

function pingAction(run?: PageAction["run"]): PageAction {
  return {
    id: "debug.ping",
    title: "Ping",
    description: "smoke action",
    params: z.object({ msg: z.string() }),
    run:
      run ??
      (async (p) => ({ ok: true, summary: "pong", data: { echo: (p as { msg: string }).msg } }) as PageActionResult),
    mutating: false,
    confirm: "never",
  };
}

beforeEach(() => __resetPageActionsForTest());

describe("page action registry (CLE-03)", () => {
  it("register → manifest entry: no fns, defaults applied, deterministic", () => {
    renderHook(() => useRegisterPageActions([pingAction()]));
    const m1 = getActionManifest();
    expect(m1).toHaveLength(1);
    const e = m1[0];
    expect(e.id).toBe("debug.ping");
    expect(e.outbound).toBe(false);
    expect(e.reversible).toBe(false);
    expect(e.cost).toBe("free");
    expect(e.confirm).toBe("never");
    expect(typeof e.paramsJsonSchema).toBe("object");
    // No function / raw zod object leaked into the serialized manifest.
    expect(JSON.stringify(m1)).not.toContain("function");
    // Deterministic across calls (memoized schema serialization).
    expect(JSON.stringify(getActionManifest())).toBe(JSON.stringify(m1));
  });

  it("unmount removes the action from the manifest", () => {
    const { unmount } = renderHook(() => useRegisterPageActions([pingAction()]));
    expect(getActionManifest()).toHaveLength(1);
    unmount();
    expect(getActionManifest()).toHaveLength(0);
  });

  it("runs a registered action", async () => {
    renderHook(() => useRegisterPageActions([pingAction()]));
    const r = await runRegisteredAction("debug.ping", { msg: "hi" });
    expect(r.ok).toBe(true);
    expect(r.summary).toBe("pong");
    expect((r.data as { echo: string }).echo).toBe("hi");
  });

  it("unregistered id → graceful error, never throws", async () => {
    const r = await runRegisteredAction("nope.gone", {});
    expect(r.ok).toBe(false);
    expect(r.error).toBe("action_not_registered");
  });

  it("bad params → invalid_params and run is NOT called", async () => {
    const runSpy = vi.fn(async () => ({ ok: true, summary: "x" }) as PageActionResult);
    renderHook(() => useRegisterPageActions([pingAction(runSpy)]));
    const r = await runRegisteredAction("debug.ping", { msg: 123 }); // msg must be a string
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid_params");
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("run throws → error result, no unhandled rejection", async () => {
    const thrower: PageAction["run"] = async () => {
      throw new Error("boom");
    };
    renderHook(() => useRegisterPageActions([pingAction(thrower)]));
    const r = await runRegisteredAction("debug.ping", { msg: "hi" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("boom");
  });

  it("double-register of the same id is idempotent (manifest length 1)", () => {
    renderHook(() => useRegisterPageActions([pingAction(), pingAction()]));
    expect(getActionManifest()).toHaveLength(1);
  });
});
