import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CLE-13 T2 — the shared pre-send gate `evaluateSend` (+ isSuppressed,
 * isColdRecipient). Table-drives the orphaned sending-identity core behind the
 * gate over { mode x isCold x sentToday vs cap x suppressed }, pins opt-out
 * precedence, and proves the fail-closed doctrine. 100% branch coverage of the
 * new file.
 */

// ── In-memory backing stores the mocked db reads from ──
let optoutRows: Array<{ tenantId: string; emailAddress: string }> = [];
let activityRows: Array<{ tenantId: string; to?: string; from?: string }> = [];
// When set, the next db.select(...).limit() throws — proves fail-closed.
let throwOnSelect = false;

vi.mock("@/db/schema", () => ({
  activities: { tenantId: "tenant_id", channel: "channel" },
  emailOptouts: { id: "id", tenantId: "tenant_id", emailAddress: "email_address" },
}));

vi.mock("drizzle-orm", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  and: (...args: any[]) => ({ op: "and", args }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq: (col: any, val: any) => ({ op: "eq", col, val }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: (strings: any, ...vals: any[]) => ({ op: "sql", strings, vals }),
}));

// The gate issues two projected selects: emailOptouts (has .id proj) and
// activities (has .n proj). We disambiguate by the projection keys.
vi.mock("@/db", () => ({
  db: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: vi.fn((proj?: any) => ({
      from: () => ({
        where: () => ({
          limit: () => {
            if (throwOnSelect) {
              return Promise.reject(new Error("db boom"));
            }
            const keys = proj ? Object.keys(proj) : [];
            if (keys.includes("id")) {
              // opt-out lookup — return the first matching row (or none)
              return Promise.resolve(optoutRows.length > 0 ? [{ id: "o1" }] : []);
            }
            // activity (coldness) lookup — any row -> warm
            return Promise.resolve(activityRows.length > 0 ? [{ n: 1 }] : []);
          },
        }),
      }),
    })),
  },
}));

// getTenantSettings + DEFAULTS — DEFAULTS mirrors tenant-settings.ts. Hoisted so
// the vi.mock factory (also hoisted) can reference it without a TDZ error.
const { DEFAULTS, settingsState } = vi.hoisted(() => ({
  DEFAULTS: {
    sendingMailboxMode: "primary-with-caps" as const,
    sendingDailyCapPrimary: 20,
    sendingAllowColdOnPrimary: false,
  },
  settingsState: { throwOnSettings: false } as {
    throwOnSettings: boolean;
    settingsToReturn: Record<string, unknown> | null;
  },
}));
vi.mock("@/lib/config/tenant-settings", () => ({
  DEFAULTS,
  getTenantSettings: vi.fn(async () => {
    if (settingsState.throwOnSettings) throw new Error("settings boom");
    return settingsState.settingsToReturn;
  }),
}));

import { evaluateSend, isSuppressed, isColdRecipient } from "@/lib/guardrails/sending-gate";

beforeEach(() => {
  optoutRows = [];
  activityRows = [];
  throwOnSelect = false;
  settingsState.throwOnSettings = false;
  settingsState.settingsToReturn = { ...DEFAULTS };
});

describe("isSuppressed", () => {
  it("true when an opt-out row exists for the tenant+address", async () => {
    optoutRows = [{ tenantId: "t1", emailAddress: "x@a.com" }];
    expect(await isSuppressed("t1", "X@A.com")).toBe(true);
  });
  it("false when none", async () => {
    expect(await isSuppressed("t1", "x@a.com")).toBe(false);
  });
});

describe("isColdRecipient", () => {
  it("warm when prior email activity exists", async () => {
    activityRows = [{ tenantId: "t1", to: "x@a.com" }];
    expect(await isColdRecipient("t1", "x@a.com")).toBe(false);
  });
  it("cold (unknown) when no activity", async () => {
    expect(await isColdRecipient("t1", "x@a.com")).toBe(true);
  });
});

describe("evaluateSend — opt-out precedence (item 3)", () => {
  it("opted_out beats everything, even a mode that would allow", async () => {
    optoutRows = [{ tenantId: "t1", emailAddress: "x@a.com" }];
    settingsState.settingsToReturn = { ...DEFAULTS, sendingMailboxMode: "external-connected" };
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", sentTodayFromPrimary: 0 });
    expect(r.send).toBe(false);
    if (!r.send) expect(r.code).toBe("opted_out");
  });
});

describe("evaluateSend — primary-with-caps (item 1)", () => {
  it("cold recipient -> cold-on-primary-blocked", async () => {
    // no activity -> cold; default mode blocks cold
    const r = await evaluateSend({ tenantId: "t1", toAddress: "cold@a.com", sentTodayFromPrimary: 0 });
    expect(r.send).toBe(false);
    if (!r.send) expect(r.code).toBe("cold-on-primary-blocked");
  });

  it("warm recipient under cap -> send", async () => {
    activityRows = [{ tenantId: "t1", to: "warm@a.com" }];
    const r = await evaluateSend({ tenantId: "t1", toAddress: "warm@a.com", sentTodayFromPrimary: 5 });
    expect(r.send).toBe(true);
  });

  it("warm recipient at cap -> primary-cap-hit", async () => {
    activityRows = [{ tenantId: "t1", to: "warm@a.com" }];
    const r = await evaluateSend({ tenantId: "t1", toAddress: "warm@a.com", sentTodayFromPrimary: 20 });
    expect(r.send).toBe(false);
    if (!r.send) expect(r.code).toBe("primary-cap-hit");
  });

  it("explicit isCold:false overrides the activity lookup", async () => {
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", isCold: false, sentTodayFromPrimary: 0 });
    expect(r.send).toBe(true);
  });
});

describe("evaluateSend — external / managed pass-through (item 1, AC-1.3/1.4)", () => {
  it("external-connected allows even a cold over-cap send", async () => {
    settingsState.settingsToReturn = { ...DEFAULTS, sendingMailboxMode: "external-connected" };
    const r = await evaluateSend({ tenantId: "t1", toAddress: "cold@a.com", sentTodayFromPrimary: 999 });
    expect(r.send).toBe(true);
  });
  it("elevay-managed-active allows", async () => {
    settingsState.settingsToReturn = { ...DEFAULTS, sendingMailboxMode: "elevay-managed-active" };
    const r = await evaluateSend({ tenantId: "t1", toAddress: "cold@a.com", sentTodayFromPrimary: 0 });
    expect(r.send).toBe(true);
  });
  it("elevay-managed-requested blocks cold (managed-setup-pending)", async () => {
    settingsState.settingsToReturn = { ...DEFAULTS, sendingMailboxMode: "elevay-managed-requested" };
    const r = await evaluateSend({ tenantId: "t1", toAddress: "cold@a.com", sentTodayFromPrimary: 0 });
    expect(r.send).toBe(false);
    if (!r.send) expect(r.code).toBe("managed-setup-pending");
  });
  it("elevay-managed-requested allows warm under cap (bridge)", async () => {
    settingsState.settingsToReturn = { ...DEFAULTS, sendingMailboxMode: "elevay-managed-requested" };
    activityRows = [{ tenantId: "t1", to: "warm@a.com" }];
    const r = await evaluateSend({ tenantId: "t1", toAddress: "warm@a.com", sentTodayFromPrimary: 1 });
    expect(r.send).toBe(true);
  });
});

describe("evaluateSend — fail-closed (design §7/§8)", () => {
  it("settings lookup throws -> send:false", async () => {
    settingsState.throwOnSettings = true;
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", sentTodayFromPrimary: 0 });
    expect(r.send).toBe(false);
    if (!r.send) expect(r.code).toBe("no-provider-connected");
  });
  it("opt-out lookup throws -> send:false (fail-closed before settings)", async () => {
    throwOnSelect = true;
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", sentTodayFromPrimary: 0 });
    expect(r.send).toBe(false);
  });
});

describe("evaluateSend — CLE-13 #4: explicit null settings -> protective DEFAULTS (no fail-open)", () => {
  it("settings:null evaluates against DEFAULTS (cold blocked, not sent)", async () => {
    const r = await evaluateSend({ tenantId: "t1", toAddress: "cold@a.com", sentTodayFromPrimary: 0, settings: null });
    expect(r.send).toBe(false);
    if (!r.send) expect(r.code).toBe("cold-on-primary-blocked");
  });
  it("settings:null still allows a warm recipient under the DEFAULT cap", async () => {
    activityRows = [{ tenantId: "t1", to: "warm@a.com" }];
    const r = await evaluateSend({ tenantId: "t1", toAddress: "warm@a.com", sentTodayFromPrimary: 0, settings: null });
    expect(r.send).toBe(true);
  });
});

describe("evaluateSend — uses caller-supplied settings without re-reading", () => {
  it("passing settings skips getTenantSettings (cold blocked from supplied DEFAULTS)", async () => {
    const r = await evaluateSend({
      tenantId: "t1",
      toAddress: "cold@a.com",
      sentTodayFromPrimary: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settings: { ...DEFAULTS } as any,
    });
    expect(r.send).toBe(false);
    if (!r.send) expect(r.code).toBe("cold-on-primary-blocked");
  });
});
