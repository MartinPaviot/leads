/**
 * CLE-16 T8/T9 (REQUIRED — the server-side trustScore gate). PUT
 * /api/settings/autonomy refuses a level whose required trust floor exceeds the
 * live gate score (systemTrustScore.overall), for ALL higher levels — not just
 * strategic. Downgrades are never gated. (AC-10 / AC-11 / AC-12 / EC-6)
 *
 * Plus the belt-and-braces: a forged strategic level + live trust < 80 yields
 * resolveEffectiveMode.relaxThresholds === false (AC-13 / EC-4).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAuthContext = vi.fn();
const mockGetTrustScore = vi.fn();
const mockUpdateTenantSettings = vi.fn();
const mockGetTenantSettings = vi.fn();

vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: () => mockGetAuthContext() }));
vi.mock("@/lib/auth/permissions", () => ({ requireCapabilityForRequest: () => null /* allow */ }));
vi.mock("@/lib/campaign-engine/trust-score", () => ({ getTrustScore: () => mockGetTrustScore() }));
vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: () => mockGetTenantSettings(),
  updateTenantSettings: (...a: unknown[]) => mockUpdateTenantSettings(...a),
}));
vi.mock("@/lib/campaign-engine/autonomy-defaults", () => ({
  buildDefaultConfig: (level = "copilot") => ({ level, permissions: {}, guardrails: {}, brand: {} }),
}));

// db: track update/insert calls; select returns the configured existing row.
const dbState: { existing: unknown[]; updated: boolean; inserted: boolean } = {
  existing: [],
  updated: false,
  inserted: false,
};
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(dbState.existing) }) }) }),
    update: () => ({ set: () => ({ where: () => { dbState.updated = true; return Promise.resolve(); } }) }),
    insert: () => ({ values: () => { dbState.inserted = true; return Promise.resolve(); } }),
  },
}));
vi.mock("@/db/schema", () => ({ autonomyConfig: { tenantId: "tenant_id", level: "level" } }));
vi.mock("drizzle-orm", () => ({ eq: (...a: unknown[]) => a }));

import { resolveEffectiveMode } from "@/lib/guardrails/approval-mode";

const { PUT } = await import("@/app/api/settings/autonomy/route");

function putReq(body: unknown) {
  return new Request("http://localhost/api/settings/autonomy", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.existing = [{ level: "copilot", permissions: {}, guardrails: {}, brand: {} }];
  dbState.updated = false;
  dbState.inserted = false;
  mockGetAuthContext.mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });
  mockGetTenantSettings.mockResolvedValue({ agentApprovalMode: "review-each" });
  mockUpdateTenantSettings.mockResolvedValue(undefined);
});

describe("PUT /api/settings/autonomy — generalized trust gate", () => {
  it("AC-10: trust 79 + strategic → 403, config NOT written", async () => {
    mockGetTrustScore.mockResolvedValue({ overall: 79 });
    const res = await PUT(putReq({ level: "strategic" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.requiredScore).toBe(80);
    expect(body.currentScore).toBe(79);
    expect(dbState.updated).toBe(false);
    expect(dbState.inserted).toBe(false);
  });

  it("AC-10: trust 80 + strategic → 200, config written", async () => {
    mockGetTrustScore.mockResolvedValue({ overall: 80 });
    const res = await PUT(putReq({ level: "strategic" }));
    expect(res.status).toBe(200);
    expect(dbState.updated).toBe(true);
  });

  it("AC-11: trust 64 + autonomous → 403", async () => {
    mockGetTrustScore.mockResolvedValue({ overall: 64 });
    const res = await PUT(putReq({ level: "autonomous" }));
    expect(res.status).toBe(403);
    expect((await res.json()).requiredScore).toBe(65);
  });

  it("AC-11: trust 65 + autonomous → 200", async () => {
    mockGetTrustScore.mockResolvedValue({ overall: 65 });
    const res = await PUT(putReq({ level: "autonomous" }));
    expect(res.status).toBe(200);
  });

  it("AC-11: trust 49 + guided → 403", async () => {
    mockGetTrustScore.mockResolvedValue({ overall: 49 });
    const res = await PUT(putReq({ level: "guided" }));
    expect(res.status).toBe(403);
    expect((await res.json()).requiredScore).toBe(50);
  });

  it("AC-11: trust 50 + guided → 200", async () => {
    mockGetTrustScore.mockResolvedValue({ overall: 50 });
    const res = await PUT(putReq({ level: "guided" }));
    expect(res.status).toBe(200);
  });

  it("EC-6: downgrade strategic→copilot always allowed regardless of trust", async () => {
    dbState.existing = [{ level: "strategic", permissions: {}, guardrails: {}, brand: {} }];
    mockGetTrustScore.mockResolvedValue({ overall: 10 });
    const res = await PUT(putReq({ level: "copilot" }));
    expect(res.status).toBe(200);
    expect(dbState.updated).toBe(true);
  });

  it("EC-6: re-saving the SAME level is never gated (no change)", async () => {
    dbState.existing = [{ level: "autonomous", permissions: {}, guardrails: {}, brand: {} }];
    mockGetTrustScore.mockResolvedValue({ overall: 10 }); // below autonomous floor 65
    const res = await PUT(putReq({ level: "autonomous", guardrails: { maxEmailsPerDay: 5 } }));
    expect(res.status).toBe(200);
  });

  it("AC-12: the route is the server path — a direct call above floor is still refused", async () => {
    mockGetTrustScore.mockResolvedValue({ overall: 50 });
    const res = await PUT(putReq({ level: "strategic" }));
    expect(res.status).toBe(403);
  });
});

describe("AC-13 / EC-4 — relaxation re-checks live trust (belt-and-braces)", () => {
  it("forged strategic level + live trust 50 → relaxThresholds false", () => {
    const r = resolveEffectiveMode({
      settings: { agentApprovalMode: "review-each" },
      level: "strategic",
      trustOverall: 50,
    });
    expect(r.relaxThresholds).toBe(false);
  });
  it("strategic + live trust 80 → relaxThresholds true", () => {
    const r = resolveEffectiveMode({
      settings: { agentApprovalMode: "review-each" },
      level: "strategic",
      trustOverall: 80,
    });
    expect(r.relaxThresholds).toBe(true);
  });
});
