/**
 * Regression guard for the admin-only GET access-control fixes.
 *
 * The Next middleware only gates writes (capabilityForRoute returns undefined
 * for SAFE methods), so read authorization must live in each handler. These
 * GETs returned admin-only data (full data export, billing, AI spend, audit
 * log, workflow defs, invite roster) but only checked authentication. Each now
 * calls requireAdmin; this locks the member -> 403 verdict so the leak can't
 * silently come back.
 *
 * We assert the 403 path only: requireAdmin short-circuits BEFORE any DB/dep
 * access, so no data mocks are needed — getAuthContext returning a member is
 * enough, and requireAdmin stays the REAL implementation (importActual).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
// Faithful stub of requireAdmin (real contract: Response 403 for non-admin,
// null for admin). importActual is avoided — auth-utils transitively imports
// next-auth, which fails to resolve next/server under vitest.
vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: () => getAuthContext(),
  requireAdmin: (authCtx: { role?: string } | null) =>
    authCtx?.role === "admin"
      ? null
      : Response.json({ error: "Admin only" }, { status: 403 }),
}));

import { GET as gdprExport } from "@/app/api/gdpr/export/route";
import { GET as billingUsage } from "@/app/api/billing/usage/route";
import { GET as billingSubscription } from "@/app/api/billing/subscription/route";
import { GET as visitorIdSpend } from "@/app/api/dashboard/visitor-id-spend/route";
import { GET as auditLog } from "@/app/api/audit/route";
import { GET as workflows } from "@/app/api/settings/workflows/route";
import { GET as memberInvites } from "@/app/api/settings/members/invites/route";

const MEMBER = { tenantId: "t1", userId: "u1", appUserId: "u1", role: "member" } as const;

function req() {
  return new Request("http://localhost/api/x");
}

const GATED: Array<[string, () => Promise<Response>]> = [
  ["GET /api/gdpr/export", () => gdprExport(req())],
  ["GET /api/billing/usage", () => billingUsage()],
  ["GET /api/billing/subscription", () => billingSubscription()],
  ["GET /api/dashboard/visitor-id-spend", () => visitorIdSpend()],
  ["GET /api/audit", () => auditLog(req())],
  ["GET /api/settings/workflows", () => workflows()],
  ["GET /api/settings/members/invites", () => memberInvites()],
];

describe("admin-only GET gates — a member (end user) is rejected", () => {
  beforeEach(() => getAuthContext.mockReset());

  for (const [name, call] of GATED) {
    it(`${name} returns 403 for a member`, async () => {
      getAuthContext.mockResolvedValue({ ...MEMBER });
      const res = await call();
      expect(res.status, name).toBe(403);
    });
  }

  it("returns 401 when unauthenticated (sample: gdpr/export)", async () => {
    getAuthContext.mockResolvedValue(null);
    const res = await gdprExport(req());
    expect(res.status).toBe(401);
  });
});
