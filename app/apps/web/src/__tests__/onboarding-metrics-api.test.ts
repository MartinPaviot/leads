import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above top-level statements, so shared
// fakes must live behind vi.hoisted.
const { getAuthContextMock, getOnboardingAgentLatencyMock } = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  getOnboardingAgentLatencyMock: vi.fn(),
}));

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: getAuthContextMock,
  // Reimplement requireAdmin inline so we don't drag auth.ts + next-auth
  // into the test runtime (next-auth's ESM resolution blows up on Vitest
  // because it imports "next/server" without the .js extension).
  requireAdmin: (authCtx: { role?: string }) => {
    if (authCtx?.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  },
}));

vi.mock("@/lib/observability-queries", () => ({
  getOnboardingAgentLatency: (
    params: Parameters<
      typeof import("@/lib/observability-queries").getOnboardingAgentLatency
    >[0]
  ) => getOnboardingAgentLatencyMock(params),
}));

const routeModule = await import("@/app/api/admin/onboarding-metrics/route");

function makeReq(url: string) {
  return new Request(url);
}

beforeEach(() => {
  getAuthContextMock.mockReset();
  getOnboardingAgentLatencyMock.mockReset();
});

describe("GET /api/admin/onboarding-metrics", () => {
  it("401 without a session", async () => {
    getAuthContextMock.mockResolvedValue(null);
    const res = await routeModule.GET(
      makeReq("http://localhost/api/admin/onboarding-metrics?since=2026-04-18")
    );
    expect(res.status).toBe(401);
  });

  it("403 for a member session", async () => {
    getAuthContextMock.mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "au1",
      role: "member",
    });
    const res = await routeModule.GET(
      makeReq("http://localhost/api/admin/onboarding-metrics?since=2026-04-18")
    );
    expect(res.status).toBe(403);
    expect(getOnboardingAgentLatencyMock).not.toHaveBeenCalled();
  });

  it("400 when since is missing", async () => {
    getAuthContextMock.mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "au1",
      role: "admin",
    });
    const res = await routeModule.GET(
      makeReq("http://localhost/api/admin/onboarding-metrics")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/since query param/);
  });

  it("400 when since is not a valid date", async () => {
    getAuthContextMock.mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "au1",
      role: "admin",
    });
    const res = await routeModule.GET(
      makeReq(
        "http://localhost/api/admin/onboarding-metrics?since=not-a-date"
      )
    );
    expect(res.status).toBe(400);
  });

  it("200 for admin with valid since, forwarding tenantId to the query", async () => {
    getAuthContextMock.mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "au1",
      role: "admin",
    });
    getOnboardingAgentLatencyMock.mockResolvedValue([
      {
        agentId: "icp-analysis",
        totalCalls: 5,
        errorCount: 0,
        errorRate: 0,
        p50LatencyMs: 2100,
        p95LatencyMs: 3400,
        p99LatencyMs: 3500,
        avgCostUsd: 0.048,
        totalCostUsd: 0.24,
      },
    ]);

    const res = await routeModule.GET(
      makeReq(
        "http://localhost/api/admin/onboarding-metrics?since=2026-04-18T00:00:00.000Z&tenantId=t1"
      )
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantScope).toBe("t1");
    expect(body.agentLatency).toHaveLength(1);
    expect(body.agentLatency[0].agentId).toBe("icp-analysis");

    const forwarded = getOnboardingAgentLatencyMock.mock.calls[0][0] as {
      tenantId: string;
      since: Date;
      until?: Date;
    };
    expect(forwarded.tenantId).toBe("t1");
    expect(forwarded.since.toISOString()).toBe("2026-04-18T00:00:00.000Z");
  });

  it("200 without tenantId defaults to global scope", async () => {
    getAuthContextMock.mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "au1",
      role: "admin",
    });
    getOnboardingAgentLatencyMock.mockResolvedValue([]);

    const res = await routeModule.GET(
      makeReq(
        "http://localhost/api/admin/onboarding-metrics?since=2026-04-18T00:00:00.000Z"
      )
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantScope).toBe("global");
    expect(body.agentLatency).toEqual([]);

    const forwarded = getOnboardingAgentLatencyMock.mock.calls[0][0] as {
      tenantId?: string;
    };
    expect(forwarded.tenantId).toBeUndefined();
  });

  it("500 when the underlying query throws", async () => {
    getAuthContextMock.mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "au1",
      role: "admin",
    });
    getOnboardingAgentLatencyMock.mockRejectedValue(new Error("DB down"));

    const res = await routeModule.GET(
      makeReq(
        "http://localhost/api/admin/onboarding-metrics?since=2026-04-18"
      )
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Metrics query failed/);
  });
});
