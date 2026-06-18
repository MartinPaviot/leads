import { describe, it, expect, vi } from "vitest";

// context.ts makeTool wraps via tool() from "ai"; identity-mock to dodge the
// local @ai-sdk/provider resolver flake (CI fine — reference_ci-health-and-test-flakes).
vi.mock("ai", () => ({ tool: (cfg: unknown) => cfg }));

const { buildPageActionTools } = await import("@/lib/chat/tools/page-actions");
import type { ToolContext } from "@/lib/chat/tools/context";
import type { PageActionManifestEntry } from "@/lib/chat/page-actions/types";

const SCHEMA_FILTER = { type: "object", properties: { industry: { type: "string" }, minScore: { type: "number" } }, required: [] as string[] };
const SCHEMA_MOVE = { type: "object", properties: { dealId: { type: "string" }, stage: { type: "string" } }, required: ["dealId", "stage"] };
const SCHEMA_DELETE = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
const SCHEMA_LAUNCH = { type: "object", properties: { sequenceId: { type: "string" } }, required: ["sequenceId"] };

const MANIFEST: PageActionManifestEntry[] = [
  { id: "accounts.applyFilter", title: "Filter", description: "filter accounts", paramsJsonSchema: SCHEMA_FILTER, mutating: false, outbound: false, reversible: true, cost: "free", confirm: "never" },
  { id: "opportunities.moveStage", title: "Move stage", description: "move a deal", paramsJsonSchema: SCHEMA_MOVE, mutating: true, outbound: false, reversible: true, cost: "free", confirm: "risky" },
  { id: "accounts.delete", title: "Delete", description: "delete account", paramsJsonSchema: SCHEMA_DELETE, mutating: true, outbound: false, reversible: false, cost: "free", confirm: "always" },
  { id: "sequences.launch", title: "Launch", description: "launch campaign", paramsJsonSchema: SCHEMA_LAUNCH, mutating: true, outbound: true, reversible: false, cost: "money", confirm: "always" },
];

function ctx(role: "admin" | "member" | "viewer", manifest?: PageActionManifestEntry[]): ToolContext {
  return {
    tenantId: "t1",
    userId: "u1",
    authCtx: { role, appUserId: "u1", tenantId: "t1" },
    settings: { agentApprovalMode: "review-each" },
    agentApprovalMode: "review-each",
    pageActionManifest: manifest,
  } as unknown as ToolContext;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(tool: any, input: unknown): Promise<any> {
  return (tool.execute as (i: unknown, o?: unknown) => Promise<unknown>)(input, {});
}

const DIRECTIVE_KEY = "_uiDirective";

describe("listPageActions", () => {
  it("returns the manifest entries when a page is attached", async () => {
    const t = buildPageActionTools(ctx("member", MANIFEST));
    const r = await run(t.listPageActions, {});
    expect(r.actions).toHaveLength(4);
    expect(r.actions[0].id).toBe("accounts.applyFilter");
  });
  it("returns empty + note off-web (no manifest)", async () => {
    const t = buildPageActionTools(ctx("member", undefined));
    const r = await run(t.listPageActions, {});
    expect(r.actions).toEqual([]);
    expect(r.note).toBeTruthy();
  });
});

describe("invokePageAction", () => {
  it("read-only action → directive, requireConfirm:false, uuid invocationId", async () => {
    const t = buildPageActionTools(ctx("member", MANIFEST));
    const r = await run(t.invokePageAction, { actionId: "accounts.applyFilter", params: { industry: "fintech" } });
    expect(r[DIRECTIVE_KEY].kind).toBe("invokeAction");
    expect(r[DIRECTIVE_KEY].requireConfirm).toBe(false);
    expect(typeof r[DIRECTIVE_KEY].invocationId).toBe("string");
    expect(r[DIRECTIVE_KEY].invocationId.length).toBeGreaterThan(10);
  });

  it("unknown actionId → error + availableActionIds, NO directive", async () => {
    const t = buildPageActionTools(ctx("member", MANIFEST));
    const r = await run(t.invokePageAction, { actionId: "nope.nope", params: {} });
    expect(r.error).toMatch(/No action/);
    expect(r.availableActionIds).toContain("accounts.applyFilter");
    expect(r[DIRECTIVE_KEY]).toBeUndefined();
  });

  it("bad params → error, NO directive", async () => {
    const t = buildPageActionTools(ctx("member", MANIFEST));
    const r = await run(t.invokePageAction, { actionId: "accounts.applyFilter", params: { minScore: "high" } });
    expect(r.error).toMatch(/Invalid parameters/);
    expect(r[DIRECTIVE_KEY]).toBeUndefined();
  });

  it("requireConfirm reflects decideAction across action classes", async () => {
    const t = buildPageActionTools(ctx("member", MANIFEST));
    const move = await run(t.invokePageAction, { actionId: "opportunities.moveStage", params: { dealId: "d1", stage: "won" } });
    const del = await run(t.invokePageAction, { actionId: "accounts.delete", params: { id: "a1" } });
    expect(move[DIRECTIVE_KEY].requireConfirm).toBe(true); // mutating+reversible+risky
    expect(del[DIRECTIVE_KEY].requireConfirm).toBe(true); // mutating+!reversible (companies:delete, member holds)
    // CLE-12: an outbound+money action maps to outbound:paid, which a member
    // LACKS, so the matrix refuses it before decideAction (covered in
    // page-action-permission.test.ts). An ADMIN reaches decideAction, which
    // maps cost:money to confirm.
    const adminTools = buildPageActionTools(ctx("admin", MANIFEST));
    const launch = await run(adminTools.invokePageAction, { actionId: "sequences.launch", params: { sequenceId: "s1" } });
    expect(launch[DIRECTIVE_KEY].requireConfirm).toBe(true); // outbound+money -> admin confirm
  });

  it("viewer is refused a mutating action (no directive) but may run a read action", async () => {
    const t = buildPageActionTools(ctx("viewer", MANIFEST));
    const del = await run(t.invokePageAction, { actionId: "accounts.delete", params: { id: "a1" } });
    expect(del.error).toBeTruthy();
    expect(del[DIRECTIVE_KEY]).toBeUndefined();
    const filt = await run(t.invokePageAction, { actionId: "accounts.applyFilter", params: { industry: "x" } });
    expect(filt[DIRECTIVE_KEY].requireConfirm).toBe(false);
  });

  it("off-web (no manifest) → error, no directive", async () => {
    const t = buildPageActionTools(ctx("member", undefined));
    const r = await run(t.invokePageAction, { actionId: "accounts.applyFilter", params: {} });
    expect(r.error).toBeTruthy();
    expect(r[DIRECTIVE_KEY]).toBeUndefined();
  });
});
