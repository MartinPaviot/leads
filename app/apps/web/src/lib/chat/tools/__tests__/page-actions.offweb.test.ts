import { describe, it, expect, vi } from "vitest";

/**
 * CLE-15 (required gate, AC-9/AC-11) — "off-web refuses page actions
 * gracefully". With pageActionManifest undefined (the off-web shape — Slack /
 * MCP / no page mounted), listPageActions returns an empty list + note and
 * invokePageAction returns an error with NO _uiDirective key. Proves the
 * headless path is self-sufficient end to end; CLE-15 changes no server code
 * here, it proves and explains the existing CLE-04 behaviour.
 */

vi.mock("ai", () => ({ tool: (cfg: unknown) => cfg }));

const { buildPageActionTools } = await import("@/lib/chat/tools/page-actions");
import type { ToolContext } from "@/lib/chat/tools/context";

const DIRECTIVE_KEY = "_uiDirective";

function offWebCtx(): ToolContext {
  return {
    tenantId: "t1",
    userId: "u1",
    authCtx: { role: "member", appUserId: "u1", tenantId: "t1" },
    settings: { agentApprovalMode: "review-each" },
    agentApprovalMode: "review-each",
    pageActionManifest: undefined, // the off-web shape
  } as unknown as ToolContext;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(tool: any, input: unknown): Promise<any> {
  return (tool.execute as (i: unknown, o?: unknown) => Promise<unknown>)(input, {});
}

describe("off-web (no manifest) page actions — required gate", () => {
  it("listPageActions -> { actions: [], note }", async () => {
    const t = buildPageActionTools(offWebCtx());
    const r = await run(t.listPageActions, {});
    expect(r.actions).toEqual([]);
    expect(typeof r.note).toBe("string");
    expect(r.note.length).toBeGreaterThan(0);
  });

  it("invokePageAction -> { error } with NO _uiDirective (no action attempted)", async () => {
    const t = buildPageActionTools(offWebCtx());
    const r = await run(t.invokePageAction, { actionId: "x.y", params: {} });
    expect(r.error).toBeTruthy();
    expect(r[DIRECTIVE_KEY]).toBeUndefined();
  });

  it("invokePageAction refuses any id off-web — no directive ever emitted", async () => {
    const t = buildPageActionTools(offWebCtx());
    for (const id of ["accounts.applyFilter", "opportunities.moveStage", ""]) {
      const r = await run(t.invokePageAction, { actionId: id, params: { a: 1 } });
      expect(r.error).toBeTruthy();
      expect(r[DIRECTIVE_KEY]).toBeUndefined();
    }
  });
});
