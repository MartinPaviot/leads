import { describe, it, expect } from "vitest";
import {
  hasPermission,
  requirePermission,
  ROLE_PERMISSIONS,
  type Permission,
} from "@/lib/auth/permissions";

/**
 * Truth table for the 3-role model. If a row here changes, it is a
 * product decision (see _specs/workspace-roles/), not a refactor.
 */
const MATRIX: Record<Permission, { admin: boolean; member: boolean; viewer: boolean }> = {
  "contacts:read": { admin: true, member: true, viewer: true },
  "contacts:write": { admin: true, member: true, viewer: false },
  "contacts:delete": { admin: true, member: true, viewer: false },
  "companies:delete": { admin: true, member: true, viewer: false },
  "deals:read": { admin: true, member: true, viewer: true },
  "deals:write": { admin: true, member: true, viewer: false },
  "deals:delete": { admin: true, member: true, viewer: false },
  "sequences:read": { admin: true, member: true, viewer: true },
  "sequences:write": { admin: true, member: true, viewer: false },
  "sequences:execute": { admin: true, member: true, viewer: false },
  "settings:read": { admin: true, member: true, viewer: true },
  "settings:write": { admin: true, member: false, viewer: false },
  "billing:manage": { admin: true, member: false, viewer: false },
  "members:invite": { admin: true, member: false, viewer: false },
  "members:manage": { admin: true, member: false, viewer: false },
  "mcp:manage": { admin: true, member: false, viewer: false },
};

describe("ROLE_PERMISSIONS matrix", () => {
  it("matches the documented truth table for every (role, permission) pair", () => {
    for (const [permission, expected] of Object.entries(MATRIX) as Array<
      [Permission, { admin: boolean; member: boolean; viewer: boolean }]
    >) {
      expect(hasPermission("admin", permission), `admin ${permission}`).toBe(expected.admin);
      expect(hasPermission("member", permission), `member ${permission}`).toBe(expected.member);
      expect(hasPermission("viewer", permission), `viewer ${permission}`).toBe(expected.viewer);
    }
  });

  it("covers every permission in the matrix (no drift)", () => {
    const allFromMap = new Set(ROLE_PERMISSIONS.admin);
    expect(Object.keys(MATRIX).sort()).toEqual([...allFromMap].sort());
  });

  it("denies everything for an unknown role", () => {
    expect(hasPermission("owner", "contacts:read")).toBe(false);
    expect(hasPermission("", "contacts:read")).toBe(false);
  });

  it("members can run their own outbound but never touch money or members", () => {
    expect(hasPermission("member", "sequences:execute")).toBe(true);
    expect(hasPermission("member", "billing:manage")).toBe(false);
    expect(hasPermission("member", "members:invite")).toBe(false);
  });

  it("requirePermission returns a 403 Response with the standard body when denied", async () => {
    const denied = requirePermission("viewer", "contacts:write");
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(403);
    const body = await denied!.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.requiredPermission).toBe("contacts:write");
    expect(body.error.currentRole).toBe("viewer");
  });

  it("requirePermission passes (null) when granted", () => {
    expect(requirePermission("member", "sequences:execute")).toBeNull();
    expect(requirePermission("admin", "billing:manage")).toBeNull();
  });
});
