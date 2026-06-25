/**
 * Access-control test for /api/settings/llm-budget.
 *
 * The workspace AI spend breakdown + budget is an ADMIN-only view. The page is
 * hidden from the settings sidebar for members, but nav-hiding is not access
 * control — the GET endpoint (and the page via direct URL) must reject members,
 * otherwise an end user could read the whole spend breakdown. This locks that.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: () => getAuthContext(),
}));
vi.mock("@/lib/billing/llm-budget", () => ({
  getLlmBudgetStatus: vi.fn(async () => ({
    allowed: true,
    spentUsd: 12.34,
    capUsd: 50,
    percentUsed: 24.68,
  })),
  invalidateBudgetCache: vi.fn(),
}));
vi.mock("@/lib/billing/cost-tracker", () => ({
  getTenantCost: vi.fn(async () => ({
    totalCost: 12.34,
    totalTokens: 1000,
    byFeature: { chat: 8, enrichment: 4.34 },
  })),
}));
vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: vi.fn(async () => ({})),
  updateTenantSettings: vi.fn(async () => {}),
}));

import { GET, PUT } from "@/app/api/settings/llm-budget/route";

beforeEach(() => {
  getAuthContext.mockReset();
});

describe("GET /api/settings/llm-budget — admin-only read gate", () => {
  it("401 when unauthenticated", async () => {
    getAuthContext.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("403 for a member (end user) — the spend breakdown is not member-readable", async () => {
    getAuthContext.mockResolvedValue({ tenantId: "t1", userId: "u1", role: "member" });
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(String(body.error)).toMatch(/admin/i);
  });

  it("200 for an admin, returning the spend breakdown", async () => {
    getAuthContext.mockResolvedValue({ tenantId: "t1", userId: "u1", role: "admin" });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status.spentUsd).toBeCloseTo(12.34);
    expect(body.breakdown.byFeature).toHaveProperty("chat");
  });
});

describe("PUT /api/settings/llm-budget — admin-only write (regression)", () => {
  it("403 for a member", async () => {
    getAuthContext.mockResolvedValue({ tenantId: "t1", userId: "u1", role: "member" });
    const req = new Request("http://localhost/api/settings/llm-budget", {
      method: "PUT",
      body: JSON.stringify({ capUsd: 50 }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });
});
