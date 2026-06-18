import { describe, it, expect } from "vitest";
import {
  capabilityForRoute,
  requireCapabilityForRequest,
  hasPermission,
  type Capability,
} from "@/lib/auth/permissions";

/**
 * CLE-12 route map + shared request guard. The map is keyed by path x method
 * (longest-prefix-wins); the guard resolves the capability from the SAME map
 * the middleware uses and checks it against the fresh DB role.
 */

function fakeReq(method: string, pathname: string): { method: string; url: string } {
  return { method, url: `https://app.elevay.dev${pathname}` };
}

describe("capabilityForRoute", () => {
  const expectations: Array<[string, string, Capability | undefined]> = [
    // ── ADMIN-ONLY surfaces ──
    ["POST", "/api/settings/members/invite", "members:invite"],
    ["DELETE", "/api/settings/members/invites/abc", "members:manage"],
    ["PUT", "/api/settings/members", "members:invite"],
    ["PUT", "/api/settings/autonomy", "settings:write"],
    ["PUT", "/api/settings/mail-calendar", "settings:write"],
    ["PUT", "/api/settings/data-model", "settings:write"],
    ["PUT", "/api/settings/custom-signals", "settings:write"],
    ["PUT", "/api/settings/compliance", "settings:write"],
    ["PUT", "/api/settings/knowledge", "knowledge:write"],
    ["DELETE", "/api/settings/knowledge", "knowledge:write"],
    ["POST", "/api/settings/anything-else", "settings:write"], // catch-all
    ["POST", "/api/mcp/keys", "mcp:manage"],
    ["DELETE", "/api/mcp/keys", "mcp:manage"],
    ["POST", "/api/billing/portal", "billing:manage"],
    ["POST", "/api/admin/purge", "settings:write"],
    ["POST", "/api/workflows/x", "workflows:manage"],
    ["POST", "/api/gdpr/delete", "settings:write"],
    ["POST", "/api/calls/numbers", "outbound:paid"],
    ["DELETE", "/api/calls/numbers", "outbound:paid"],
    // ── MEMBER write surfaces ──
    ["POST", "/api/emails/send", "outbound:send"],
    ["POST", "/api/sequences/abc/enroll", "sequences:write"],
    ["DELETE", "/api/sequences/abc", "sequences:delete"],
    ["POST", "/api/meetings/abc/notes/send-follow-up", "deals:write"],
    ["POST", "/api/contacts", "contacts:write"],
    ["DELETE", "/api/contacts/abc", "contacts:delete"],
    ["POST", "/api/accounts", "accounts:write"],
    ["DELETE", "/api/accounts/abc", "companies:delete"],
    ["DELETE", "/api/opportunities/abc", "deals:delete"],
    ["POST", "/api/enrich", "enrichment:run"],
    // ── SAFE methods are never gated here ──
    ["GET", "/api/settings/icp", undefined],
    ["HEAD", "/api/settings/members", undefined],
    ["OPTIONS", "/api/contacts", undefined],
    // ── default-member (unmapped, not high-risk) ──
    ["POST", "/api/foo/bar", undefined],
    ["POST", "/api/notes", undefined],
    // ── default-deny (unmapped, high-risk prefix) ──
    ["POST", "/api/settings/brand-new-thing", "settings:write"],
    ["POST", "/api/admin/brand-new", "settings:write"],
    ["POST", "/api/billing/brand-new", "billing:manage"],
  ];

  for (const [method, path, expected] of expectations) {
    it(`${method} ${path} -> ${expected ?? "undefined"}`, () => {
      expect(capabilityForRoute(path, method)).toBe(expected);
    });
  }

  it("longest-prefix-wins: members/invite beats the settings catch-all", () => {
    expect(capabilityForRoute("/api/settings/members/invite", "POST")).toBe("members:invite");
    expect(capabilityForRoute("/api/settings/icp", "POST")).toBe("settings:write");
  });

  it("method casing is normalized", () => {
    expect(capabilityForRoute("/api/contacts", "post")).toBe("contacts:write");
    expect(capabilityForRoute("/api/settings/icp", "get")).toBeUndefined();
  });
});

describe("requireCapabilityForRequest (the shared write-route guard)", () => {
  it("high-risk admin route: member 403, admin pass", () => {
    const path = "/api/settings/members/invite";
    expect(requireCapabilityForRequest({ role: "member" }, fakeReq("POST", path))!.status).toBe(403);
    expect(requireCapabilityForRequest({ role: "admin" }, fakeReq("POST", path))).toBeNull();
  });

  it("settings:write route: member 403, admin pass", () => {
    const path = "/api/settings/autonomy";
    expect(requireCapabilityForRequest({ role: "member" }, fakeReq("PUT", path))!.status).toBe(403);
    expect(requireCapabilityForRequest({ role: "admin" }, fakeReq("PUT", path))).toBeNull();
  });

  it("mcp:manage route: member 403, admin pass", () => {
    const path = "/api/mcp/keys";
    expect(requireCapabilityForRequest({ role: "member" }, fakeReq("POST", path))!.status).toBe(403);
    expect(requireCapabilityForRequest({ role: "admin" }, fakeReq("POST", path))).toBeNull();
  });

  it("outbound:paid (calls/numbers): member 403, admin pass", () => {
    const path = "/api/calls/numbers";
    expect(requireCapabilityForRequest({ role: "member" }, fakeReq("POST", path))!.status).toBe(403);
    expect(requireCapabilityForRequest({ role: "admin" }, fakeReq("POST", path))).toBeNull();
  });

  it("sequences enroll (sequences:write): member pass, viewer 403", () => {
    const path = "/api/sequences/abc/enroll";
    expect(requireCapabilityForRequest({ role: "member" }, fakeReq("POST", path))).toBeNull();
    expect(requireCapabilityForRequest({ role: "viewer" }, fakeReq("POST", path))!.status).toBe(403);
  });

  it("member-write route (contacts): member pass, viewer would also be denied", () => {
    const path = "/api/contacts";
    expect(requireCapabilityForRequest({ role: "member" }, fakeReq("POST", path))).toBeNull();
    // The middleware viewer floor blocks viewers first; the guard would also
    // deny since viewer lacks contacts:write.
    expect(requireCapabilityForRequest({ role: "viewer" }, fakeReq("POST", path))!.status).toBe(403);
  });

  it("DELETE contact (contacts:delete): member pass, viewer 403", () => {
    const path = "/api/contacts/abc";
    expect(requireCapabilityForRequest({ role: "member" }, fakeReq("DELETE", path))).toBeNull();
    expect(requireCapabilityForRequest({ role: "viewer" }, fakeReq("DELETE", path))!.status).toBe(403);
  });

  it("SAFE method: guard always passes (reads are never gated)", () => {
    expect(requireCapabilityForRequest({ role: "member" }, fakeReq("GET", "/api/settings/icp"))).toBeNull();
    expect(requireCapabilityForRequest({ role: "viewer" }, fakeReq("GET", "/api/contacts"))).toBeNull();
  });

  it("default-member unmapped route: member pass; default-deny prefix: member 403, admin pass", () => {
    expect(requireCapabilityForRequest({ role: "member" }, fakeReq("POST", "/api/foo/bar"))).toBeNull();
    expect(
      requireCapabilityForRequest({ role: "member" }, fakeReq("POST", "/api/settings/brand-new"))!.status,
    ).toBe(403);
    expect(
      requireCapabilityForRequest({ role: "admin" }, fakeReq("POST", "/api/settings/brand-new")),
    ).toBeNull();
  });

  it("unknown / legacy role is denied on any mapped write (fail-closed)", () => {
    expect(requireCapabilityForRequest({ role: "owner" }, fakeReq("POST", "/api/contacts"))!.status).toBe(403);
    expect(requireCapabilityForRequest({ role: "owner" }, fakeReq("POST", "/api/settings/icp"))!.status).toBe(403);
    // reads still pass (SAFE method never gated)
    expect(requireCapabilityForRequest({ role: "owner" }, fakeReq("GET", "/api/contacts"))).toBeNull();
  });

  it("resolves the pathname from nextUrl when present (middleware-shaped req)", () => {
    const req = { method: "POST", nextUrl: { pathname: "/api/settings/members/invite" } };
    expect(requireCapabilityForRequest({ role: "member" }, req)!.status).toBe(403);
    expect(requireCapabilityForRequest({ role: "admin" }, req)).toBeNull();
  });
});

/**
 * The middleware uses the SAME pure pieces (capabilityForRoute + hasPermission)
 * as the guard. This exercises that branch directly (the gate factored as a
 * pure helper) so the edge verdict and the route verdict cannot drift.
 */
function middlewareCapabilityVerdict(
  jwtRole: string | undefined,
  method: string,
  pathname: string,
): "pass" | { forbidden: Capability } {
  const cap = capabilityForRoute(pathname, method);
  if (cap && !hasPermission(jwtRole ?? "member", cap)) return { forbidden: cap };
  return "pass";
}

describe("middleware capability gate (edge, JWT role)", () => {
  it("member JWT on an admin route is forbidden with the missing capability", () => {
    expect(middlewareCapabilityVerdict("member", "POST", "/api/settings/members/invite")).toEqual({
      forbidden: "members:invite",
    });
  });

  it("member JWT on a member-write route passes", () => {
    expect(middlewareCapabilityVerdict("member", "POST", "/api/contacts")).toBe("pass");
  });

  it("admin JWT passes everywhere mapped", () => {
    expect(middlewareCapabilityVerdict("admin", "POST", "/api/settings/members/invite")).toBe("pass");
    expect(middlewareCapabilityVerdict("admin", "POST", "/api/calls/numbers")).toBe("pass");
  });

  it("undefined JWT role is treated as member at the edge (fail-closed for admin caps)", () => {
    expect(middlewareCapabilityVerdict(undefined, "POST", "/api/settings/members/invite")).toEqual({
      forbidden: "members:invite",
    });
    expect(middlewareCapabilityVerdict(undefined, "POST", "/api/contacts")).toBe("pass");
  });

  it("stale ADMIN JWT passes the edge, but the route guard with the fresh MEMBER role 403s (EC-1)", () => {
    const path = "/api/settings/members/invite";
    // Edge sees the stale admin JWT -> passes.
    expect(middlewareCapabilityVerdict("admin", "POST", path)).toBe("pass");
    // Route layer reads the fresh DB role (member) -> 403 (authoritative).
    expect(requireCapabilityForRequest({ role: "member" }, fakeReq("POST", path))!.status).toBe(403);
  });
});
