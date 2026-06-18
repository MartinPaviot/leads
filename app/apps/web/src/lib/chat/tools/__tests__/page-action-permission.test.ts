import { describe, it, expect, vi, beforeEach } from "vitest";

// context.ts makeTool wraps via tool() from "ai"; identity-mock to dodge the
// local @ai-sdk/provider resolver flake (mirrors page-actions.test.ts).
vi.mock("ai", () => ({ tool: (cfg: unknown) => cfg }));

// Spy on decideAction so we can prove the matrix gate runs BEFORE it
// (permission-first; decideAction NOT consulted when the role lacks the cap).
const decideActionSpy = vi.fn((..._args: unknown[]) => ({
  disposition: "confirm" as const,
  reason: "spy",
}));
vi.mock("@/lib/guardrails/decide-action", () => ({
  decideAction: (...args: unknown[]) => decideActionSpy(...args),
}));

const { buildPageActionTools } = await import("@/lib/chat/tools/page-actions");
import type { ToolContext } from "@/lib/chat/tools/context";
import type { PageActionManifestEntry } from "@/lib/chat/page-actions/types";

const SCHEMA_FILTER = { type: "object", properties: { industry: { type: "string" } }, required: [] as string[] };
const SCHEMA_MOVE = { type: "object", properties: { dealId: { type: "string" }, stage: { type: "string" } }, required: ["dealId", "stage"] };
const SCHEMA_LAUNCH = { type: "object", properties: { sequenceId: { type: "string" } }, required: ["sequenceId"] };

const MANIFEST: PageActionManifestEntry[] = [
  // read -> no capability -> reachable, decideAction executes
  { id: "accounts.applyFilter", title: "Filter", description: "filter accounts", paramsJsonSchema: SCHEMA_FILTER, mutating: false, outbound: false, reversible: true, cost: "free", confirm: "never" },
  // mutating reversible -> opportunities namespace -> deals:write (member holds)
  { id: "opportunities.moveStage", title: "Move stage", description: "move a deal", paramsJsonSchema: SCHEMA_MOVE, mutating: true, outbound: false, reversible: true, cost: "free", confirm: "risky" },
  // outbound + money -> outbound:paid (admin ONLY)
  { id: "sequences.launch", title: "Launch", description: "launch campaign", paramsJsonSchema: SCHEMA_LAUNCH, mutating: true, outbound: true, reversible: false, cost: "money", confirm: "always" },
];

function ctx(role: "admin" | "member" | "viewer"): ToolContext {
  return {
    tenantId: "t1",
    userId: "u1",
    authCtx: { role, appUserId: "u1", tenantId: "t1" },
    settings: { agentApprovalMode: "review-each" },
    agentApprovalMode: "review-each",
    pageActionManifest: MANIFEST,
  } as unknown as ToolContext;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(tool: any, input: unknown): Promise<any> {
  return (tool.execute as (i: unknown, o?: unknown) => Promise<unknown>)(input, {});
}

const DIRECTIVE_KEY = "_uiDirective";

describe("invokePageAction — CLE-12 matrix gate (permission BEFORE approval)", () => {
  beforeEach(() => {
    decideActionSpy.mockClear();
  });

  it("member + outbound:paid action -> refused by the matrix, NO directive, decideAction NOT called", async () => {
    const t = buildPageActionTools(ctx("member"));
    const r = await run(t.invokePageAction, { actionId: "sequences.launch", params: { sequenceId: "s1" } });
    expect(r.error).toBeTruthy();
    expect(r.error).toMatch(/outbound:paid/);
    expect(r.error).toMatch(/member/);
    expect(r[DIRECTIVE_KEY]).toBeUndefined();
    expect(decideActionSpy).not.toHaveBeenCalled(); // permission-first (EC-7)
  });

  it("admin + outbound:paid action -> passes the matrix, decideAction IS consulted", async () => {
    const t = buildPageActionTools(ctx("admin"));
    const r = await run(t.invokePageAction, { actionId: "sequences.launch", params: { sequenceId: "s1" } });
    expect(r.error).toBeUndefined();
    expect(decideActionSpy).toHaveBeenCalledTimes(1);
  });

  it("member + a mutating write action (deals:write) -> passes the matrix, decideAction IS consulted", async () => {
    const t = buildPageActionTools(ctx("member"));
    const r = await run(t.invokePageAction, { actionId: "opportunities.moveStage", params: { dealId: "d1", stage: "won" } });
    expect(r.error).toBeUndefined();
    expect(decideActionSpy).toHaveBeenCalledTimes(1);
  });

  it("viewer + read-only action -> reachable (no capability), decideAction IS consulted (CLE-04 gateway preserved)", async () => {
    const t = buildPageActionTools(ctx("viewer"));
    const r = await run(t.invokePageAction, { actionId: "accounts.applyFilter", params: { industry: "x" } });
    expect(r.error).toBeUndefined();
    expect(decideActionSpy).toHaveBeenCalledTimes(1);
  });

  it("viewer + a mutating action -> refused by the matrix BEFORE decideAction (defence in depth)", async () => {
    const t = buildPageActionTools(ctx("viewer"));
    const r = await run(t.invokePageAction, { actionId: "opportunities.moveStage", params: { dealId: "d1", stage: "won" } });
    expect(r.error).toBeTruthy();
    expect(r[DIRECTIVE_KEY]).toBeUndefined();
    expect(decideActionSpy).not.toHaveBeenCalled();
  });
});
