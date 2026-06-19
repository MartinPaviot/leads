import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CLE-15 — the opt-in narrate-actuate read tool (getAccountIntelligence gains a
 * `reveal` flag). With reveal:true it emits a navigate(+highlight) directive AND
 * a complete text payload; with reveal unset it returns the same payload and NO
 * directive (AC-2/AC-3/AC-11). The record is existence/tenant-checked exactly
 * like openRecord, so a non-existent/foreign id yields an error and no directive
 * (E-9).
 */

// makeTool wraps via tool() from "ai"; identity-mock to dodge the provider resolver flake.
vi.mock("ai", () => ({ tool: (cfg: unknown) => cfg }));

// Buyer-intent scoring is non-essential to the directive surface — stub it.
vi.mock("@/lib/scoring/buyer-intent", () => ({
  scoreBuyerIntent: vi.fn(async () => ({ score: 50, trend: "flat" })),
}));

// A minimal chainable drizzle stub. The first SELECT (the company existence
// check, which calls .limit) resolves to whatever `companyRows` holds; every
// other chained query (contacts/deals/activities, awaited directly) resolves to
// []. The builder is BOTH chainable and awaitable (a thenable) so either
// terminator works.
const companyRows: Array<Record<string, unknown>> = [];
let selectCall = 0;
function chain(rows: Array<unknown>) {
  const builder: Record<string, unknown> = {};
  const ret = () => builder;
  for (const m of ["from", "where", "orderBy", "limit"]) builder[m] = ret;
  (builder as { then: unknown }).then = (res: (v: unknown) => unknown) => res(rows);
  return builder;
}
vi.mock("@/db", () => ({
  db: {
    select: () => {
      // First select is the company lookup; the rest must be empty.
      const isCompanyLookup = selectCall === 0;
      selectCall += 1;
      return chain(isCompanyLookup ? companyRows : []);
    },
  },
}));
vi.mock("@/db/schema", () => ({
  companies: {}, contacts: {}, deals: {}, activities: {},
}));

const { buildIntelligenceTools } = await import("@/lib/chat/tools/intelligence");
import type { ToolContext } from "@/lib/chat/tools/context";

const DIRECTIVE_KEY = "_uiDirective";

function ctx(): ToolContext {
  return { tenantId: "t1", userId: "u1", authCtx: { role: "member", appUserId: "u1", tenantId: "t1" } } as unknown as ToolContext;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(tool: any, input: unknown): Promise<any> {
  return (tool.execute as (i: unknown, o?: unknown) => Promise<unknown>)(input, {});
}

beforeEach(() => {
  selectCall = 0;
  companyRows.length = 0;
  companyRows.push({ id: "acc_1", name: "Acme", domain: "acme.com", industry: "SaaS", score: 80, size: "50", revenue: "1M", description: "desc", properties: {} });
});

describe("getAccountIntelligence — narrate-actuate (CLE-15)", () => {
  it("reveal:true -> navigate(+highlight) directive AND a complete text payload (AC-1/AC-11)", async () => {
    const t = buildIntelligenceTools(ctx());
    const r = await run(t.getAccountIntelligence, { accountId: "acc_1", reveal: true });

    // Directive present, well-formed, pointing at the account with a highlight.
    expect(r[DIRECTIVE_KEY]).toEqual({
      kind: "navigate",
      path: "/accounts/acc_1",
      label: "Acme",
      highlight: { entityId: "acc_1", scope: "accounts" },
    });
    // Text payload is complete on its own (stands alone if the directive is stripped).
    expect(r.account).toMatchObject({ id: "acc_1", name: "Acme" });
    expect(r.scoreBreakdown).toBeDefined();
    expect(Array.isArray(r.contacts)).toBe(true);
  });

  it("reveal unset -> same payload, NO directive (AC-2/AC-3)", async () => {
    const t = buildIntelligenceTools(ctx());
    const r = await run(t.getAccountIntelligence, { accountId: "acc_1" });
    expect(r[DIRECTIVE_KEY]).toBeUndefined();
    expect(r.account).toMatchObject({ id: "acc_1", name: "Acme" });
  });

  it("non-existent / foreign id -> error, NO directive even with reveal:true (E-9)", async () => {
    companyRows.length = 0; // company lookup returns []
    const t = buildIntelligenceTools(ctx());
    const r = await run(t.getAccountIntelligence, { accountId: "ghost", reveal: true });
    expect(r.error).toBeTruthy();
    expect(r[DIRECTIVE_KEY]).toBeUndefined();
  });
});
