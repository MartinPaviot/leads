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
// Captures the WHERE clause of the opt-out select so a test can pin its SQL shape
// (the email column must be lowered in-query, not exact-matched on the value).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedOptoutWhere: any = null;

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        where: (clause: any) => ({
          limit: () => {
            if (throwOnSelect) {
              return Promise.reject(new Error("db boom"));
            }
            const keys = proj ? Object.keys(proj) : [];
            if (keys.includes("id")) {
              capturedOptoutWhere = clause;
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
const { DEFAULTS, settingsState, suppressionState, emailStatusState, targetingState, lawfulState, guardState } = vi.hoisted(() => ({
  DEFAULTS: {
    sendingMailboxMode: "primary-with-caps" as const,
    sendingDailyCapPrimary: 20,
    sendingAllowColdOnPrimary: false,
    safeModeEnabled: true,
  },
  settingsState: { throwOnSettings: false } as {
    throwOnSettings: boolean;
    settingsToReturn: Record<string, unknown> | null;
  },
  // Spec-22 DB suppression is mocked at the module boundary so the gate test
  // stays decoupled from the suppression table's query shape. null = not suppressed.
  suppressionState: { hit: null as null | { entry: { type: string; level: string } } },
  // Spec-17 email status — likewise mocked at the boundary. null = unverified.
  emailStatusState: { status: null as string | null },
  // Spec-35 targeting context — mocked at the boundary.
  targetingState: { targetingStatus: "targeted" as "unreviewed" | "targeted" | "archived", accountKey: null as string | null },
  // Spec-33 lawful-basis verdict — mocked at the boundary. Default allowed
  // mirrors the flag-OFF no-op (the gate's own default in production).
  lawfulState: { result: { allowed: true } as { allowed: boolean; reason?: string } },
  // Spec-27 deliverability guard — mocked at the boundary. Default not tripped.
  guardState: { tripped: false },
}));

vi.mock("@/lib/suppression/db-store", () => ({
  isSuppressedDb: vi.fn(async () => suppressionState.hit),
  drizzleSuppressionLoader: vi.fn(() => async () => []),
}));
// Keep the REAL isEmailKnownUnsendable (pure); only stub the DB read.
vi.mock("@/lib/contacts/email/db-status", async (orig) => ({
  ...(await orig<typeof import("@/lib/contacts/email/db-status")>()),
  loadEmailStatus: vi.fn(async () => emailStatusState.status),
}));
// Spec-33 lawful-basis gate mocked at the boundary; default allowed = flag-off no-op.
vi.mock("@/lib/compliance/lawful-basis/db-gate", () => ({
  evaluateLawfulBasisForSend: vi.fn(async () => lawfulState.result),
}));
// Spec-27 deliverability guard mocked at the boundary; default not tripped (healthy).
vi.mock("@/lib/deliverability/db-guard", () => ({
  guardTrippedForTenant: vi.fn(async () => guardState.tripped),
}));
vi.mock("@/lib/config/tenant-settings", () => ({
  DEFAULTS,
  getTenantSettings: vi.fn(async () => {
    if (settingsState.throwOnSettings) throw new Error("settings boom");
    return settingsState.settingsToReturn;
  }),
}));
// Spec-35 targeting context mocked at the boundary.
vi.mock("@/lib/targeting/status", () => ({
  loadAccountGateContext: vi.fn(async () => ({
    targetingStatus: targetingState.targetingStatus,
    accountKey: targetingState.accountKey,
  })),
}));

import { evaluateSend, isSuppressed, isColdRecipient, emailBracketLikePattern, isInteractiveRecipientSendable } from "@/lib/guardrails/sending-gate";

beforeEach(() => {
  optoutRows = [];
  activityRows = [];
  throwOnSelect = false;
  capturedOptoutWhere = null;
  settingsState.throwOnSettings = false;
  settingsState.settingsToReturn = { ...DEFAULTS };
  suppressionState.hit = null;
  emailStatusState.status = null;
  targetingState.targetingStatus = "targeted";
  targetingState.accountKey = null;
  delete process.env.TARGETING_GATE_ENABLED;
  delete process.env.OUTBOUND_TEST_MODE;
  delete process.env.OUTBOUND_TEST_ALLOWLIST;
  lawfulState.result = { allowed: true };
  guardState.tripped = false;
});

describe("isInteractiveRecipientSendable — reply to your inbox in test mode", () => {
  it("test mode OFF → any recipient is sendable (even cold)", async () => {
    process.env.OUTBOUND_TEST_MODE = "off";
    activityRows = []; // cold
    expect(await isInteractiveRecipientSendable("t1", "stranger@acme.io")).toBe(true);
  });
  it("test mode ON + WARM (prior correspondence) → sendable (a reply works)", async () => {
    process.env.OUTBOUND_TEST_MODE = "on";
    activityRows = [{ tenantId: "t1", from: "paul@pilae.ch" }]; // warm
    expect(await isInteractiveRecipientSendable("t1", "paul@pilae.ch")).toBe(true);
  });
  it("test mode ON + COLD stranger → blocked", async () => {
    process.env.OUTBOUND_TEST_MODE = "on";
    activityRows = []; // cold
    expect(await isInteractiveRecipientSendable("t1", "stranger@acme.io")).toBe(false);
  });
  it("test mode ON + allowlisted address → sendable without a warm lookup", async () => {
    process.env.OUTBOUND_TEST_MODE = "on";
    process.env.OUTBOUND_TEST_ALLOWLIST = "ok@team.com";
    activityRows = []; // cold, but allowlisted wins
    expect(await isInteractiveRecipientSendable("t1", "ok@team.com")).toBe(true);
  });
});

describe("isSuppressed", () => {
  it("true when an opt-out row exists for the tenant+address", async () => {
    optoutRows = [{ tenantId: "t1", emailAddress: "x@a.com" }];
    expect(await isSuppressed("t1", "X@A.com")).toBe(true);
  });
  it("false when none", async () => {
    expect(await isSuppressed("t1", "x@a.com")).toBe(false);
  });
  it("lowercases the email COLUMN in-query (sql lower()), not an exact eq on the value, so a non-lowercased stored opt-out still matches", async () => {
    // THE opt-out check must be at least as robust as the sibling gates
    // (db-status.ts:32, db-gate.ts:45): a mixed-case legacy/manual row must not
    // slip the most-absolute suppression. A regression to `eq(col, value)` would
    // miss it → mailing an unsubscribed recipient.
    await isSuppressed("t1", "X@A.com");
    // where = and( eq(tenantId), sql`lower(email_address) = ${e}` )
    const sqlNode = capturedOptoutWhere?.args?.find((a: { op?: string }) => a?.op === "sql");
    expect(sqlNode).toBeTruthy();
    expect(sqlNode.vals).toContain("x@a.com"); // compared against the normalized input
    // and NOT a bare exact-match eq on the email value (the brittle form)
    const eqOnEmail = capturedOptoutWhere?.args?.find(
      (a: { op?: string; val?: unknown }) => a?.op === "eq" && a?.val === "x@a.com",
    );
    expect(eqOnEmail).toBeUndefined();
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

describe("emailBracketLikePattern (reply-recipient header match)", () => {
  it("wraps the lowercased address in angle brackets so `Name <addr>` headers match", () => {
    // Inbound capture stores `from` as the full header; the bare `= e` compare
    // missed it → reply recipient wrongly cold → cold-on-primary blocked the reply.
    expect(emailBracketLikePattern("Paul.Madelenat@Pilae.CH")).toBe("%<paul.madelenat@pilae.ch>%");
  });
  it("escapes LIKE metacharacters (_ %) so the match is literal", () => {
    expect(emailBracketLikePattern("a_b%c@x.com")).toBe("%<a\\_b\\%c@x.com>%");
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

describe("evaluateSend — spec-22 broader suppression", () => {
  it("a domain/typed suppression hit blocks with code 'suppressed'", async () => {
    suppressionState.hit = { entry: { type: "competitor", level: "domain" } };
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@competitor.com", sentTodayFromPrimary: 0 });
    expect(r.send).toBe(false);
    if (!r.send) {
      expect(r.code).toBe("suppressed");
      expect(r.reason).toContain("competitor");
    }
  });

  it("address-level opt-out still takes precedence over the spec-22 check", async () => {
    optoutRows = [{ tenantId: "t1", emailAddress: "x@a.com" }];
    suppressionState.hit = { entry: { type: "manual_dnc", level: "address" } };
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", sentTodayFromPrimary: 0 });
    if (!r.send) expect(r.code).toBe("opted_out"); // opt-out checked first
  });
});

describe("evaluateSend — spec-17 email-verification gate (SAFE: known-invalid only)", () => {
  it("blocks a KNOWN-invalid recipient with code 'invalid_email'", async () => {
    emailStatusState.status = "invalid";
    activityRows = [{ tenantId: "t1", to: "x@a.com" }]; // warm, would otherwise send
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", sentTodayFromPrimary: 0 });
    expect(r.send).toBe(false);
    if (!r.send) {
      expect(r.code).toBe("invalid_email");
      expect(r.reason).toContain("invalid");
    }
  });

  it("does NOT block when status is null (unverified) — no-op until the job runs", async () => {
    emailStatusState.status = null;
    activityRows = [{ tenantId: "t1", to: "x@a.com" }];
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", sentTodayFromPrimary: 0 });
    expect(r.send).toBe(true);
  });

  it("does NOT block 'risky' / 'catch_all' / 'unknown' — only 'invalid' is terminal", async () => {
    activityRows = [{ tenantId: "t1", to: "x@a.com" }];
    for (const status of ["risky", "catch_all", "unknown", "valid"]) {
      emailStatusState.status = status;
      const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", sentTodayFromPrimary: 0 });
      expect(r.send).toBe(true);
    }
  });

  it("suppression (spec-22) takes precedence over the invalid-email check", async () => {
    suppressionState.hit = { entry: { type: "competitor", level: "domain" } };
    emailStatusState.status = "invalid";
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@competitor.com", sentTodayFromPrimary: 0 });
    if (!r.send) expect(r.code).toBe("suppressed"); // suppression checked first
  });
});

describe("evaluateSend — spec-33 lawful-basis gate (flag-gated, block-by-default)", () => {
  it("is a no-op when allowed (the flag-OFF default) — send proceeds", async () => {
    lawfulState.result = { allowed: true };
    activityRows = [{ tenantId: "t1", to: "x@a.com" }]; // warm, would otherwise send
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", sentTodayFromPrimary: 0 });
    expect(r.send).toBe(true);
  });

  it("blocks with code 'lawful_basis_blocked' when the gate refuses (flag on)", async () => {
    lawfulState.result = { allowed: false, reason: "no_lawful_basis" };
    activityRows = [{ tenantId: "t1", to: "x@a.com" }];
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", sentTodayFromPrimary: 0 });
    expect(r.send).toBe(false);
    if (!r.send) {
      expect(r.code).toBe("lawful_basis_blocked");
      expect(r.reason).toContain("no_lawful_basis");
    }
  });

  it("invalid-email (spec-17) takes precedence over the lawful-basis check", async () => {
    emailStatusState.status = "invalid";
    lawfulState.result = { allowed: false, reason: "no_lawful_basis" };
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", sentTodayFromPrimary: 0 });
    if (!r.send) expect(r.code).toBe("invalid_email"); // email-status checked first
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

describe("evaluateSend — spec-27 deliverability guard", () => {
  it("blocks every send with code 'deliverability_paused' when the tenant guard is tripped", async () => {
    guardState.tripped = true;
    activityRows = [{ tenantId: "t1", to: "x@a.com" }]; // warm, would otherwise send
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", sentTodayFromPrimary: 0 });
    expect(r.send).toBe(false);
    if (!r.send) {
      expect(r.code).toBe("deliverability_paused");
      expect(r.reason).toContain("deliverability");
    }
  });

  it("is a no-op when the guard is healthy (not tripped) — send proceeds", async () => {
    guardState.tripped = false;
    activityRows = [{ tenantId: "t1", to: "x@a.com" }];
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", sentTodayFromPrimary: 0 });
    expect(r.send).toBe(true);
  });

  it("opt-out still takes precedence over the deliverability guard", async () => {
    guardState.tripped = true;
    optoutRows = [{ tenantId: "t1", emailAddress: "x@a.com" }];
    const r = await evaluateSend({ tenantId: "t1", toAddress: "x@a.com", sentTodayFromPrimary: 0 });
    if (!r.send) expect(r.code).toBe("opted_out"); // opt-out checked first
  });
});

describe("evaluateSend — spec-35 SAFE_MODE targeting gate (check-3)", () => {
  // A warm, under-cap recipient so only the targeting gate decides send vs deny.
  const warm = { tenantId: "t1", toAddress: "warm@a.com", sentTodayFromPrimary: 1, contactId: "c1" };
  beforeEach(() => {
    activityRows = [{ tenantId: "t1", to: "warm@a.com" }]; // warm
  });

  it("guard ON + SAFE_MODE + unreviewed account -> not_targeted", async () => {
    process.env.TARGETING_GATE_ENABLED = "on";
    targetingState.targetingStatus = "unreviewed";
    const r = await evaluateSend(warm);
    expect(r.send).toBe(false);
    if (!r.send) expect(r.code).toBe("not_targeted");
  });

  it("guard ON + SAFE_MODE + archived account -> not_targeted", async () => {
    process.env.TARGETING_GATE_ENABLED = "on";
    targetingState.targetingStatus = "archived";
    const r = await evaluateSend(warm);
    expect(r.send).toBe(false);
    if (!r.send) expect(r.code).toBe("not_targeted");
  });

  it("guard ON + SAFE_MODE + targeted account -> send", async () => {
    process.env.TARGETING_GATE_ENABLED = "on";
    targetingState.targetingStatus = "targeted";
    const r = await evaluateSend(warm);
    expect(r.send).toBe(true);
  });

  it("guard OFF (default) -> targeting not enforced even for unreviewed", async () => {
    targetingState.targetingStatus = "unreviewed"; // env unset by beforeEach
    const r = await evaluateSend(warm);
    expect(r.send).toBe(true);
  });

  it("interactive sends are exempt from the targeting gate (D6)", async () => {
    process.env.TARGETING_GATE_ENABLED = "on";
    targetingState.targetingStatus = "unreviewed";
    const r = await evaluateSend({ ...warm, interactive: true });
    expect(r.send).toBe(true);
  });

  it("SAFE_MODE OFF -> targeting not enforced (D4)", async () => {
    process.env.TARGETING_GATE_ENABLED = "on";
    targetingState.targetingStatus = "unreviewed";
    settingsState.settingsToReturn = { ...DEFAULTS, safeModeEnabled: false };
    const r = await evaluateSend(warm);
    expect(r.send).toBe(true);
  });

  it("suppression beats targeting (R5.4) — suppressed unreviewed -> 'suppressed', not 'not_targeted'", async () => {
    process.env.TARGETING_GATE_ENABLED = "on";
    targetingState.targetingStatus = "unreviewed";
    suppressionState.hit = { entry: { type: "manual_dnc", level: "account" } };
    const r = await evaluateSend(warm);
    expect(r.send).toBe(false);
    if (!r.send) expect(r.code).toBe("suppressed");
  });

  it("pre-resolved targetingStatus arg is honored without a context lookup", async () => {
    process.env.TARGETING_GATE_ENABLED = "on";
    const r = await evaluateSend({ ...warm, targetingStatus: "archived", accountKey: null });
    expect(r.send).toBe(false);
    if (!r.send) expect(r.code).toBe("not_targeted");
  });
});
