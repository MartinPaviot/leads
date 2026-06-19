/**
 * CLE-16 T7/T12 — observability (AC-20 / §5.3).
 *   part 1: recalculateThresholds logs `learned-threshold.update` per CHANGED
 *           class (and NOT for an unchanged class).
 *   part 2: GET /api/settings/autonomy returns a `thresholds` block with
 *           { static, current, source, excluded } per action.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── shared mocks ───────────────────────────────────────────────
const mockGetTenantSettings = vi.fn();
const mockUpdateTenantSettings = vi.fn();
const mockGetAuthContext = vi.fn();
const mockGetTrustScore = vi.fn();
const logInfo = vi.fn();

vi.mock("@/lib/observability/logger", () => ({
  default: { info: (...a: unknown[]) => logInfo(...a), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logger: { info: (...a: unknown[]) => logInfo(...a), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: () => mockGetTenantSettings(),
  updateTenantSettings: (...a: unknown[]) => mockUpdateTenantSettings(...a),
}));
vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: () => mockGetAuthContext() }));
vi.mock("@/lib/auth/permissions", () => ({ requireCapabilityForRequest: () => null }));
vi.mock("@/lib/campaign-engine/trust-score", () => ({ getTrustScore: () => mockGetTrustScore() }));
vi.mock("@/lib/campaign-engine/autonomy-defaults", () => ({
  buildDefaultConfig: (level = "copilot") => ({ level, permissions: {}, guardrails: {}, brand: {} }),
}));

const selectResults: unknown[][] = [];
let routeExisting: unknown[] = [];
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          // learned-trust groupBy queries
          groupBy: () => Promise.resolve(selectResults.shift() ?? []),
          // outbound .then
          then: (res: (v: unknown) => void) => res(selectResults.shift() ?? []),
          // route GET/PUT .limit
          limit: () => Promise.resolve(routeExisting),
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    insert: () => ({ values: () => Promise.resolve() }),
  },
}));
vi.mock("@/db/schema", () => ({
  actionOutcomes: { tenantId: "t", actionType: "a", status: "s", positivity: "p" },
  toolCallEvents: { tenantId: "t", toolName: "tn", status: "s" },
  outboundEmails: { tenantId: "t", status: "s" },
  autonomyConfig: { tenantId: "t", level: "l" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  sql: Object.assign((..._a: unknown[]) => ({ as: () => ({}) }), { as: () => ({}) }),
  inArray: (...a: unknown[]) => a,
}));

function queue(outcomes: unknown[], reverted: unknown[] = [], outboundBad = 0) {
  selectResults.length = 0;
  selectResults.push(outcomes);
  selectResults.push(reverted);
  selectResults.push([{ n: outboundBad }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateTenantSettings.mockResolvedValue(undefined);
});

describe("recalculateThresholds observability (AC-20)", () => {
  it("logs learned-threshold.update with all fields on a CHANGED class", async () => {
    mockGetTenantSettings.mockResolvedValue({ learnedThresholds: {} });
    queue([{ actionType: "contact-update", totalOutcomes: 20, positiveOutcomes: 20 }]); // 0.75 → 0.70
    const { recalculateThresholds } = await import("@/lib/guardrails/learned-trust");
    await recalculateThresholds("t1");

    const call = logInfo.mock.calls.find((c) => c[0] === "learned-threshold.update");
    expect(call).toBeTruthy();
    const meta = call![1] as Record<string, unknown>;
    expect(meta).toMatchObject({
      tenantId: "t1",
      actionType: "contact-update",
      oldThreshold: 0.75,
      newThreshold: 0.7,
      sampleSize: 20,
    });
    expect(meta.goodRate).toBe(1);
  });

  it("does NOT log for an unchanged (dead-band) class", async () => {
    mockGetTenantSettings.mockResolvedValue({ learnedThresholds: { "contact-update": 0.7 } });
    queue([{ actionType: "contact-update", totalOutcomes: 20, positiveOutcomes: 13 }]); // 0.65 rate → no move
    const { recalculateThresholds } = await import("@/lib/guardrails/learned-trust");
    await recalculateThresholds("t1");
    expect(logInfo.mock.calls.find((c) => c[0] === "learned-threshold.update")).toBeFalsy();
  });
});

describe("GET /api/settings/autonomy thresholds block (§5.3)", () => {
  it("returns { static, current, source, excluded } per action", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });
    mockGetTrustScore.mockResolvedValue({ overall: 50, suggestedLevel: "copilot" });
    mockGetTenantSettings.mockResolvedValue({
      agentApprovalMode: "review-each",
      learnedThresholds: { "contact-update": 0.6 },
    });
    routeExisting = [{ level: "autonomous", permissions: {}, guardrails: {}, brand: {} }];

    const { GET } = await import("@/app/api/settings/autonomy/route");
    const res = await GET(new Request("http://localhost/api/settings/autonomy"));
    const body = await res.json();

    expect(body.thresholds).toBeTruthy();
    // excluded outbound class → static source, excluded true, current ceiling
    expect(body.thresholds["email-send"]).toEqual({
      static: 0.85,
      current: 1.0,
      source: "static",
      excluded: true,
    });
    // learned non-excluded class
    expect(body.thresholds["contact-update"]).toEqual({
      static: 0.75,
      current: 0.6,
      source: "learned",
      excluded: false,
    });
    // untouched class → static
    expect(body.thresholds["task-create"].source).toBe("static");
    expect(body.thresholds["task-create"].excluded).toBe(false);
  });

  it("relaxed source when strategic + trust >= 80", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });
    mockGetTrustScore.mockResolvedValue({ overall: 90, suggestedLevel: "autonomous" });
    mockGetTenantSettings.mockResolvedValue({ agentApprovalMode: "review-each", learnedThresholds: {} });
    routeExisting = [{ level: "strategic", permissions: {}, guardrails: {}, brand: {} }];

    const { GET } = await import("@/app/api/settings/autonomy/route");
    const res = await GET(new Request("http://localhost/api/settings/autonomy"));
    const body = await res.json();
    expect(body.thresholds["contact-update"].source).toBe("relaxed");
    expect(body.thresholds["contact-update"].current).toBe(0.6);
  });
});
