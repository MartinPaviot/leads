import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  withAuthRLS: vi.fn(async (handler) => { const ctx = await (await import("@/lib/auth/auth-utils")).getAuthContext(); if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 }); return handler(ctx); }),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  companies: { id: "id", tenantId: "tenantId" },
  contacts: { id: "id", tenantId: "tenantId" },
  authAccounts: { id: "id", userId: "userId", provider: "provider" },
  authUsers: { id: "id", email: "email", name: "name" },
  tenants: { id: "id", settings: "settings" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(() => "sql-tag"),
  isNull: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const statusModule = await import("@/app/api/onboarding/status/route");

/**
 * Mocks a sequence of db.select().from().where()... chains matching the route's
 * query order:
 *   1. count companies
 *   2. count contacts
 *   3. google account (where+limit)
 *   4. microsoft account (where+limit)
 *   5. tenant settings (where)
 *   6. auth user (where+limit)
 */
function mockSelectChain({
  accountCount,
  contactCount,
  google,
  microsoft,
  tenantSettings,
  userEmail,
  userName,
}: {
  accountCount: number;
  contactCount: number;
  google: boolean;
  microsoft: boolean;
  tenantSettings: Record<string, unknown>;
  userEmail?: string;
  userName?: string | null;
}) {
  const whereTerminal = (value: unknown) => vi.fn().mockResolvedValue(value);
  const limitTerminal = (value: unknown) => ({
    limit: vi.fn().mockResolvedValue(value),
  });

  const selectSpy = vi.mocked(db.select);
  selectSpy
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: whereTerminal([{ count: accountCount }]),
      }),
    } as never)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: whereTerminal([{ count: contactCount }]),
      }),
    } as never)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(limitTerminal(google ? [{ userId: "u1" }] : [])),
      }),
    } as never)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(limitTerminal(microsoft ? [{ userId: "u1" }] : [])),
      }),
    } as never)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: whereTerminal([{ settings: tenantSettings }]),
      }),
    } as never)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(limitTerminal(
          userEmail ? [{ email: userEmail, name: userName ?? null }] : []
        )),
      }),
    } as never);
}

describe("GET /api/onboarding/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await statusModule.GET();
    expect(res.status).toBe(401);
  });

  it("returns needsOnboarding=true when onboardingCompleted=false even with 150 accounts (T0.1 regression)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });
    mockSelectChain({
      accountCount: 150,
      contactCount: 42,
      google: true,
      microsoft: false,
      tenantSettings: { onboardingCompleted: false },
      userEmail: "founder@example.com",
    });

    const res = await statusModule.GET();
    const data = await res.json();
    expect(data.needsOnboarding).toBe(true);
    expect(data.isNew).toBe(false);
    expect(data.accounts).toBe(150);
  });

  it("returns needsOnboarding=false when onboardingCompleted=true even with 0 accounts (T0.1 regression)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });
    mockSelectChain({
      accountCount: 0,
      contactCount: 0,
      google: false,
      microsoft: true,
      tenantSettings: { onboardingCompleted: true },
      userEmail: "founder@example.com",
    });

    const res = await statusModule.GET();
    const data = await res.json();
    expect(data.needsOnboarding).toBe(false);
    expect(data.isNew).toBe(true);
  });

  it("reports isNew independently of needsOnboarding (T0.1 regression)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });
    mockSelectChain({
      accountCount: 3,
      contactCount: 0,
      google: true,
      microsoft: false,
      tenantSettings: { onboardingCompleted: true },
      userEmail: "founder@example.com",
    });

    const res = await statusModule.GET();
    const data = await res.json();
    expect(data.isNew).toBe(false);
    expect(data.needsOnboarding).toBe(false);
  });

  it("returns persisted onboardingCurrentStep so wizard can resume (T0.2)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });
    mockSelectChain({
      accountCount: 0,
      contactCount: 0,
      google: true,
      microsoft: false,
      tenantSettings: { onboardingCompleted: false, onboardingCurrentStep: "product" },
      userEmail: "founder@example.com",
    });

    const res = await statusModule.GET();
    const data = await res.json();
    expect(data.onboardingCurrentStep).toBe("product");
  });

  it("clamps transient 'building' step back to 'icp' on resume (T0.2)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });
    mockSelectChain({
      accountCount: 0,
      contactCount: 0,
      google: true,
      microsoft: false,
      tenantSettings: { onboardingCompleted: false, onboardingCurrentStep: "building" },
      userEmail: "founder@example.com",
    });

    const res = await statusModule.GET();
    const data = await res.json();
    expect(data.onboardingCurrentStep).toBe("icp");
  });

  it("returns onboardingCurrentStep=null when never set (T0.2)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });
    mockSelectChain({
      accountCount: 0,
      contactCount: 0,
      google: false,
      microsoft: false,
      tenantSettings: {},
      userEmail: "founder@example.com",
    });

    const res = await statusModule.GET();
    const data = await res.json();
    expect(data.onboardingCurrentStep).toBeNull();
  });
});
