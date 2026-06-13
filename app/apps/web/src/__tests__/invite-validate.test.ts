/**
 * validateInviteToken — the single source of truth for "is this a real,
 * still-open invitation?", shared by the public invite endpoint and the
 * invitation-only sign-up gate. DB is mocked so the logic is exercised
 * without a live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let selectRows: Array<Record<string, unknown>> = [];
const updateWhere = vi.fn().mockResolvedValue(undefined);

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectRows,
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: updateWhere,
      }),
    }),
  },
}));
vi.mock("@/db/schema", () => ({
  pendingInvites: {
    id: {}, tenantId: {}, email: {}, role: {}, status: {}, expiresAt: {}, token: {}, updatedAt: {},
  },
}));
vi.mock("drizzle-orm", () => ({ eq: (...a: unknown[]) => a }));

import { validateInviteToken } from "@/lib/auth/invite-validate";

const future = () => new Date(Date.now() + 86_400_000);
const past = () => new Date(Date.now() - 1_000);

describe("validateInviteToken", () => {
  beforeEach(() => {
    selectRows = [];
    updateWhere.mockClear();
  });

  it("returns missing_token for empty / whitespace / null without touching the DB", async () => {
    for (const t of ["", "   ", null, undefined]) {
      const r = await validateInviteToken(t);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.reason).toBe("missing_token");
    }
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("returns not_found when no invite matches the hashed token", async () => {
    selectRows = [];
    const r = await validateInviteToken("some-real-looking-token");
    expect(r).toEqual({ valid: false, reason: "not_found" });
  });

  it("rejects a non-pending invite, surfacing its status as the reason", async () => {
    selectRows = [
      { id: "i1", tenantId: "t1", email: "a@b.co", role: "member", status: "cancelled", expiresAt: future() },
    ];
    const r = await validateInviteToken("x");
    expect(r).toEqual({ valid: false, reason: "cancelled" });

    selectRows = [
      { id: "i1", tenantId: "t1", email: "a@b.co", role: "member", status: "accepted", expiresAt: future() },
    ];
    expect((await validateInviteToken("x")).valid).toBe(false);
  });

  it("marks a pending-but-expired invite as expired and rejects it", async () => {
    selectRows = [
      { id: "i2", tenantId: "t1", email: "a@b.co", role: "member", status: "pending", expiresAt: past() },
    ];
    const r = await validateInviteToken("x");
    expect(r).toEqual({ valid: false, reason: "expired" });
    expect(updateWhere).toHaveBeenCalledTimes(1); // side effect: flip to expired
  });

  it("returns the invite for a valid, pending, unexpired token", async () => {
    const exp = future();
    selectRows = [
      { id: "i3", tenantId: "t9", email: "Invited@Acme.co", role: "admin", status: "pending", expiresAt: exp },
    ];
    const r = await validateInviteToken("good-token");
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.invite).toEqual({
        id: "i3",
        tenantId: "t9",
        email: "Invited@Acme.co",
        role: "admin",
        expiresAt: exp,
      });
    }
    expect(updateWhere).not.toHaveBeenCalled();
  });
});
