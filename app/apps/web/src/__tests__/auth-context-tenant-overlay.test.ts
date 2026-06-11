/**
 * getAuthContext — fresh-DB overlay of the JWT's tenantId claim.
 *
 * Incident (2026-06-11): a member accepted an invite into Pilae at 13:55
 * but his session JWT (minted 13:06, maxAge 8h) still claimed his old
 * solo tenant — every page served the empty workspace even after he
 * believed he had re-logged. users.tenantId is the source of truth for
 * membership; the JWT claim is only its boot-time snapshot, so the
 * context must prefer the (60s-cached) DB value.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth/user-id", () => ({
  authToAppUserId: vi.fn(async () => null),
}));

vi.mock("@/lib/auth/session-guard", () => ({
  getSessionGuard: vi.fn(async () => ({
    deactivatedAt: null,
    passwordChangedAt: null,
  })),
  isTokenPredatingPasswordChange: vi.fn(() => false),
}));

vi.mock("@/lib/auth/fresh-role", () => ({
  getFreshUserState: vi.fn(async () => null),
}));

import { auth } from "@/auth";
import { getSessionGuard } from "@/lib/auth/session-guard";
import { getFreshUserState } from "@/lib/auth/fresh-role";
import { authToAppUserId } from "@/lib/auth/user-id";
import { getAuthContext } from "@/lib/auth/auth-utils";

function session(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "auth-1" },
    tenantId: "t-old-solo",
    appUserId: "u1",
    role: "member",
    issuedAt: 1_700_000_000,
    ...overrides,
  };
}

describe("getAuthContext tenant overlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authToAppUserId).mockResolvedValue(null);
    vi.mocked(getSessionGuard).mockResolvedValue({
      deactivatedAt: null,
      passwordChangedAt: null,
    });
    vi.mocked(getFreshUserState).mockResolvedValue(null);
  });

  it("prefers the DB tenant over a stale JWT claim (invite-accept incident)", async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(getFreshUserState).mockResolvedValue({
      role: "member",
      tenantId: "t-pilae",
    });

    const ctx = await getAuthContext();
    expect(ctx?.tenantId).toBe("t-pilae");
    expect(ctx?.appUserId).toBe("u1");
  });

  it("falls back to the JWT claim when the DB lookup fails (fail-open)", async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(getFreshUserState).mockResolvedValue(null);

    const ctx = await getAuthContext();
    expect(ctx?.tenantId).toBe("t-old-solo");
  });

  it("falls back to the JWT claim when the DB row carries no tenant", async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(getFreshUserState).mockResolvedValue({
      role: "member",
      tenantId: null,
    });

    const ctx = await getAuthContext();
    expect(ctx?.tenantId).toBe("t-old-solo");
  });

  it("self-heals a session whose claim is missing when the DB knows the tenant", async () => {
    vi.mocked(auth).mockResolvedValue(session({ tenantId: undefined }) as never);
    vi.mocked(getFreshUserState).mockResolvedValue({
      role: "member",
      tenantId: "t-pilae",
    });

    const ctx = await getAuthContext();
    expect(ctx?.tenantId).toBe("t-pilae");
  });

  it("returns null when neither the claim nor the DB provide a tenant", async () => {
    vi.mocked(auth).mockResolvedValue(session({ tenantId: undefined }) as never);
    vi.mocked(getFreshUserState).mockResolvedValue(null);

    const ctx = await getAuthContext();
    expect(ctx).toBeNull();
  });

  it("still overlays the fresh role alongside the tenant", async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(getFreshUserState).mockResolvedValue({
      role: "admin",
      tenantId: "t-pilae",
    });

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe("admin");
  });

  it("still rejects deactivated members before any overlay", async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(getSessionGuard).mockResolvedValue({
      deactivatedAt: new Date(),
      passwordChangedAt: null,
    });

    const ctx = await getAuthContext();
    expect(ctx).toBeNull();
    expect(getFreshUserState).not.toHaveBeenCalled();
  });

  it("resolves appUserId via the bridge for legacy tokens, then overlays", async () => {
    vi.mocked(auth).mockResolvedValue(session({ appUserId: undefined }) as never);
    vi.mocked(authToAppUserId).mockResolvedValue("u-bridged");
    vi.mocked(getFreshUserState).mockResolvedValue({
      role: "member",
      tenantId: "t-pilae",
    });

    const ctx = await getAuthContext();
    expect(ctx?.appUserId).toBe("u-bridged");
    expect(getFreshUserState).toHaveBeenCalledWith("u-bridged");
    expect(ctx?.tenantId).toBe("t-pilae");
  });
});
