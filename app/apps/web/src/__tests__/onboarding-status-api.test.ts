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
 * query order. The route makes exactly six queries — suppression is now a pure
 * settings/accounts computation (established = accounts>0 || usable ICP), so
 * there is no conditional invite lookup any more:
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
    // clearAllMocks does NOT drain the mockReturnValueOnce queue — reset the
    // select mock fully so no unconsumed chain leaks into the next test.
    vi.mocked(db.select).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await statusModule.GET();
    expect(res.status).toBe(401);
  });

  it("suppresses the modal when the workspace is in use (accounts) even if onboardingCompleted is unset", async () => {
    // The real-world bug: a founder who sourced accounts but never finished
    // the modal was shown it on every load because onboardingCompleted was
    // never written. A workspace with accounts is established → no modal.
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
    expect(data.needsOnboarding).toBe(false);
    expect(data.isNew).toBe(false);
    expect(data.accounts).toBe(150);
  });

  it("keeps the modal for a fresh tenant: no accounts, no ICP, not completed", async () => {
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
      tenantSettings: { onboardingCompleted: false },
      userEmail: "founder@example.com",
    });

    const res = await statusModule.GET();
    const data = await res.json();
    expect(data.needsOnboarding).toBe(true);
    expect(data.isNew).toBe(true);
    // Exactly six queries — no conditional invite lookup.
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(6);
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

  it("suppresses onboarding for an invited user when the workspace already has accounts", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u2",
      tenantId: "t1",
      appUserId: "u2",
      role: "member",
    });
    mockSelectChain({
      accountCount: 150,
      contactCount: 42,
      google: false,
      microsoft: false,
      tenantSettings: { onboardingCompleted: false },
      userEmail: "invitee@example.com",
    });

    const res = await statusModule.GET();
    const data = await res.json();
    expect(data.needsOnboarding).toBe(false);
    expect(data.isNew).toBe(false);
  });

  it("suppresses onboarding for an invited user when the workspace has a usable ICP but 0 accounts", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u2",
      tenantId: "t1",
      appUserId: "u2",
      role: "member",
    });
    mockSelectChain({
      accountCount: 0,
      contactCount: 0,
      google: false,
      microsoft: false,
      tenantSettings: { onboardingCompleted: false, targetIndustries: ["Nonprofit"] },
      userEmail: "invitee@example.com",
    });

    const res = await statusModule.GET();
    const data = await res.json();
    expect(data.needsOnboarding).toBe(false);
    // isNew stays data-driven — ICP defined but no accounts yet is still "new"
    expect(data.isNew).toBe(true);
  });

  it("keeps onboarding for an invited user in an empty workspace (nobody set it up yet)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u2",
      tenantId: "t1",
      appUserId: "u2",
      role: "member",
    });
    mockSelectChain({
      accountCount: 0,
      contactCount: 0,
      google: false,
      microsoft: false,
      tenantSettings: { onboardingCompleted: false },
      userEmail: "invitee@example.com",
    });

    const res = await statusModule.GET();
    const data = await res.json();
    expect(data.needsOnboarding).toBe(true);
    // 0 accounts + no ICP means the workspace isn't established. Six base
    // queries, no conditional invite lookup.
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(6);
  });

  it("returns the existing-config snapshot the card seeds from", async () => {
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
      tenantSettings: {
        onboardingCompleted: false,
        companyDomain: "pilae.ch",
        productDescription: "Sovereign open-source ops",
        aiTone: "Direct",
        targetIndustries: ["Nonprofit", "Hospital & Health Care"],
        targetGeographies: ["Vaud", "Geneva"],
        targetSeniorities: ["C-Suite"],
        targetRevenueMin: 1000000,
      },
      userEmail: "founder@pilae.ch",
    });

    const res = await statusModule.GET();
    const data = await res.json();
    expect(data.companyDomain).toBe("pilae.ch");
    expect(data.productDescription).toBe("Sovereign open-source ops");
    expect(data.aiTone).toBe("Direct");
    expect(data.targeting.industries).toEqual(["Nonprofit", "Hospital & Health Care"]);
    expect(data.targeting.geographies).toEqual(["Vaud", "Geneva"]);
    expect(data.targeting.targetSeniorities).toEqual(["C-Suite"]);
    expect(data.targeting.revenueMin).toBe(1000000);
    // Has a usable ICP → no modal even though onboardingCompleted is false.
    expect(data.needsOnboarding).toBe(false);
  });
});
