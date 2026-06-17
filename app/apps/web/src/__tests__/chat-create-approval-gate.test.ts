/**
 * CLE-00 regression net — the approval-gate dead-wire.
 *
 * Bug (audit 2026-06-16 §6.1): the chat route passed the RAW stored
 * `agentApprovalMode` (v2 default "review-each") while the create tools +
 * system prompt tested the legacy literal `=== "ask"`. The proposal branch
 * therefore never fired and createContact/Account/Deal mutated immediately,
 * with no review card, under the prod-default mode.
 *
 * These tests exercise the REAL (pure) `chatCreateDisposition` +
 * `readApprovalMode` and the REAL create tools (DB mocked), asserting:
 *   - review-each / batch-daily  → proposal, NO db.insert
 *   - auto-high-confidence        → immediate create, db.insert once
 *   - legacy "ask"/"auto" coerce  → card / immediate (back-compat)
 *   - prompt flag == tool flag     → prompt + tool can't drift again
 *   - no `=== "ask"` behavioral branch survives in tools/prompt
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { insertSpy, insertReturningMock } = vi.hoisted(() => {
  const insertReturningMock = vi.fn(() => [
    { id: "row-1", firstName: "Test", lastName: "Reviewer", email: null, name: "Acme", domain: null, value: null, stage: "lead" },
  ]);
  const insertSpy = vi.fn(() => ({ values: () => ({ returning: insertReturningMock }) }));
  return { insertSpy, insertReturningMock };
});

vi.mock("@/db", () => ({
  db: {
    insert: insertSpy,
    select: () => ({ from: () => ({ where: () => ({ limit: () => [] }) }) }),
    update: () => ({ set: () => ({ where: () => [] }) }),
  },
}));

// Schema stub — vitest v4 validates named exports, so list the exact tables
// create.ts imports (each is only used as a drizzle table handle, never read here).
vi.mock("@/db/schema", () => ({
  activities: {}, comments: {}, companies: {}, contacts: {}, deals: {},
  notes: {}, savedViews: {}, sequences: {}, sequenceSteps: {}, sharedPrompts: {},
  tasks: {}, tenants: {},
}));

// Mock the `ai` package's `tool()` helper to an identity passthrough. makeTool
// (context.ts) wraps each tool via `tool({...})`; the real import pulls in
// @ai-sdk/provider which fails to resolve under local vitest (known local-only
// flake, CI fine — see reference_ci-health-and-test-flakes). Identity keeps
// `.execute` accessible and avoids the resolution.
vi.mock("ai", () => ({ tool: (cfg: unknown) => cfg }));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (...a: unknown[]) => ({ eq: a }),
  sql: (strings: TemplateStringsArray, ...exprs: unknown[]) => ({ sql: { strings, exprs } }),
}));

vi.mock("@/lib/chat/tool-call-log", () => ({ logToolCall: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/ai/context-graph", () => ({ ingestEpisode: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/deals/log-deal-event", () => ({ logDealEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: vi.fn().mockResolvedValue({}),
  updateTenantSettings: vi.fn().mockResolvedValue(undefined),
}));

const { buildCreateTools } = await import("@/lib/chat/tools/create");
const { chatCreateDisposition, readApprovalMode } = await import("@/lib/guardrails/approval-mode");
import type { ApprovalModeV2 } from "@/lib/guardrails/approval-mode";
import type { ToolContext } from "@/lib/chat/tools/context";

function makeCtx(mode: ApprovalModeV2): ToolContext {
  return {
    tenantId: "t1",
    userId: "u1",
    agentApprovalMode: mode,
    // role:"member" holds write capability; approval mode is orthogonal to role.
    authCtx: { role: "member", appUserId: "u1", tenantId: "t1" },
    settings: {},
  } as unknown as ToolContext;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(tool: any, input: Record<string, unknown>) {
  return (tool.execute as (i: unknown, o?: unknown) => Promise<unknown>)(input, {});
}

beforeEach(() => {
  insertSpy.mockClear();
  insertReturningMock.mockClear();
});

describe("chatCreateDisposition (CLE-00 mapper)", () => {
  it("review-each → proposal", () => {
    expect(chatCreateDisposition("review-each")).toBe("proposal");
  });
  it("batch-daily → proposal (no chat-side daily queue pre-CLE-10)", () => {
    expect(chatCreateDisposition("batch-daily")).toBe("proposal");
  });
  it("auto-high-confidence, no confidence → execute (preserves legacy 'auto' UX)", () => {
    expect(chatCreateDisposition("auto-high-confidence")).toBe("execute");
  });
  it("auto-high-confidence, low confidence → proposal", () => {
    expect(chatCreateDisposition("auto-high-confidence", 0.5)).toBe("proposal");
  });
  it("auto-high-confidence, high confidence → execute", () => {
    expect(chatCreateDisposition("auto-high-confidence", 0.99)).toBe("execute");
  });
  it("unknown/cast mode → proposal (safest)", () => {
    expect(chatCreateDisposition("bogus" as ApprovalModeV2)).toBe("proposal");
  });
});

describe("create tools honour the approval gate (the regression)", () => {
  it("review-each: createContact returns a proposal and does NOT insert", async () => {
    const tools = buildCreateTools(makeCtx("review-each"));
    const res = (await run(tools.createContact, { firstName: "Test", lastName: "Reviewer" })) as {
      proposal?: boolean; created?: unknown;
    };
    expect(res.proposal).toBe(true);
    expect(res.created).toBeUndefined();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("review-each: createAccount and createDeal also propose, no insert", async () => {
    const tools = buildCreateTools(makeCtx("review-each"));
    const acc = (await run(tools.createAccount, { name: "Acme" })) as { proposal?: boolean };
    const deal = (await run(tools.createDeal, { name: "Acme expansion" })) as { proposal?: boolean };
    expect(acc.proposal).toBe(true);
    expect(deal.proposal).toBe(true);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("auto-high-confidence: createContact inserts once and returns the created row", async () => {
    const tools = buildCreateTools(makeCtx("auto-high-confidence"));
    const res = (await run(tools.createContact, { firstName: "Test", lastName: "Reviewer" })) as {
      proposal?: boolean; created?: { id: string };
    };
    expect(res.proposal).toBeUndefined();
    expect(res.created?.id).toBe("row-1");
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });
});

describe("legacy values coerce correctly (EC-1 / EC-2 back-compat)", () => {
  it('legacy "ask" still cards (review-each)', () => {
    expect(chatCreateDisposition(readApprovalMode({ agentApprovalMode: "ask" }))).toBe("proposal");
  });
  it('legacy "auto" still creates immediately (auto-high-confidence)', () => {
    expect(chatCreateDisposition(readApprovalMode({ agentApprovalMode: "auto" }))).toBe("execute");
  });
  it("unset mode → cards (matches stored default review-each)", () => {
    expect(chatCreateDisposition(readApprovalMode({ agentApprovalMode: undefined }))).toBe("proposal");
  });
});

describe("prompt flag is driven by the SAME function as the tools (no drift)", () => {
  // The route computes `approvalRequiresReview = chatCreateDisposition(mode) === "proposal"`.
  it("review-each / batch-daily → requires review", () => {
    expect(chatCreateDisposition("review-each") === "proposal").toBe(true);
    expect(chatCreateDisposition("batch-daily") === "proposal").toBe(true);
  });
  it("auto-high-confidence (no confidence) → does not require review", () => {
    expect(chatCreateDisposition("auto-high-confidence") === "proposal").toBe(false);
  });
});

describe("no legacy `=== \"ask\"` behavioral branch survives (grep guard)", () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const SRC = join(__dirname, "..");
  for (const rel of ["lib/chat/tools/create.ts", "lib/prompts/chat-system-prompt.ts"]) {
    it(`${rel} has no \`agentApprovalMode === "ask"\``, () => {
      const src = readFileSync(join(SRC, rel), "utf-8");
      expect(src.includes('agentApprovalMode === "ask"')).toBe(false);
    });
  }
});
