import { describe, it, expect } from "vitest";
import {
  hasPermission,
  requirePermission,
  requireCapability,
  ROLE_PERMISSIONS,
  type Permission,
  type Capability,
} from "@/lib/auth/permissions";

/**
 * Truth table for the 3-role model (CLE-12 unified matrix). If a row here
 * changes, it is a product decision (see _specs/CLE-12-unified-permission-matrix/),
 * not a refactor. admin = all; viewer = read-only set; member = the CRM/outbound
 * set WITHOUT money/config/identity capabilities.
 */
const MATRIX: Record<Capability, { admin: boolean; member: boolean; viewer: boolean }> = {
  "contacts:read": { admin: true, member: true, viewer: true },
  "contacts:write": { admin: true, member: true, viewer: false },
  "contacts:delete": { admin: true, member: true, viewer: false },
  "accounts:write": { admin: true, member: true, viewer: false },
  "companies:delete": { admin: true, member: true, viewer: false },
  "deals:read": { admin: true, member: true, viewer: true },
  "deals:write": { admin: true, member: true, viewer: false },
  "deals:delete": { admin: true, member: true, viewer: false },
  "outbound:send": { admin: true, member: true, viewer: false },
  "outbound:paid": { admin: true, member: false, viewer: false },
  "enrichment:run": { admin: true, member: true, viewer: false },
  "sequences:read": { admin: true, member: true, viewer: true },
  "sequences:write": { admin: true, member: true, viewer: false },
  "sequences:delete": { admin: true, member: true, viewer: false },
  "sequences:execute": { admin: true, member: true, viewer: false },
  "settings:read": { admin: true, member: true, viewer: true },
  "settings:write": { admin: true, member: false, viewer: false },
  "workflows:manage": { admin: true, member: false, viewer: false },
  "knowledge:write": { admin: true, member: false, viewer: false },
  "billing:manage": { admin: true, member: false, viewer: false },
  "members:read": { admin: true, member: true, viewer: true },
  "members:invite": { admin: true, member: false, viewer: false },
  "members:manage": { admin: true, member: false, viewer: false },
  "mcp:manage": { admin: true, member: false, viewer: false },
};

describe("ROLE_PERMISSIONS matrix (CLE-12)", () => {
  it("matches the documented truth table for every (role, capability) pair", () => {
    for (const [capability, expected] of Object.entries(MATRIX) as Array<
      [Capability, { admin: boolean; member: boolean; viewer: boolean }]
    >) {
      expect(hasPermission("admin", capability), `admin ${capability}`).toBe(expected.admin);
      expect(hasPermission("member", capability), `member ${capability}`).toBe(expected.member);
      expect(hasPermission("viewer", capability), `viewer ${capability}`).toBe(expected.viewer);
    }
  });

  it("covers every capability in the matrix (no drift between map and admin set)", () => {
    const allFromMap = new Set(ROLE_PERMISSIONS.admin);
    expect(Object.keys(MATRIX).sort()).toEqual([...allFromMap].sort());
  });

  it("admin holds every capability", () => {
    for (const cap of Object.keys(MATRIX) as Capability[]) {
      expect(hasPermission("admin", cap)).toBe(true);
    }
  });

  it("viewer holds ONLY the read set (every write/outbound/admin capability denied)", () => {
    const viewerGranted = (Object.keys(MATRIX) as Capability[]).filter((c) =>
      hasPermission("viewer", c),
    );
    expect(viewerGranted.sort()).toEqual(
      [
        "contacts:read",
        "deals:read",
        "sequences:read",
        "settings:read",
        "members:read",
      ].sort(),
    );
  });

  it("member can run own outbound + enrichment but never money/config/members", () => {
    expect(hasPermission("member", "outbound:send")).toBe(true);
    expect(hasPermission("member", "enrichment:run")).toBe(true);
    expect(hasPermission("member", "sequences:execute")).toBe(true);
    expect(hasPermission("member", "accounts:write")).toBe(true);
    // never:
    expect(hasPermission("member", "outbound:paid")).toBe(false);
    expect(hasPermission("member", "settings:write")).toBe(false);
    expect(hasPermission("member", "workflows:manage")).toBe(false);
    expect(hasPermission("member", "knowledge:write")).toBe(false);
    expect(hasPermission("member", "billing:manage")).toBe(false);
    expect(hasPermission("member", "members:invite")).toBe(false);
    expect(hasPermission("member", "members:manage")).toBe(false);
    expect(hasPermission("member", "mcp:manage")).toBe(false);
  });

  it("denies everything for an unknown / legacy role (fail-closed)", () => {
    expect(hasPermission("owner", "contacts:read")).toBe(false);
    expect(hasPermission("owner", "settings:write")).toBe(false);
    expect(hasPermission("", "contacts:read")).toBe(false);
    expect(hasPermission("super-admin", "billing:manage")).toBe(false);
  });

  it("requireCapability returns a 403 Response with the standard body when denied", async () => {
    const denied = requireCapability("viewer", "contacts:write");
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(403);
    const body = await denied!.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.requiredCapability).toBe("contacts:write");
    expect(body.error.currentRole).toBe("viewer");
  });

  it("requireCapability passes (null) when granted", () => {
    expect(requireCapability("member", "outbound:send")).toBeNull();
    expect(requireCapability("admin", "billing:manage")).toBeNull();
  });

  it("requirePermission is the same function as requireCapability (alias holds)", () => {
    expect(requirePermission).toBe(requireCapability);
    // Legacy call sites keep their exact behaviour.
    const denied = requirePermission("member", "settings:write");
    expect(denied!.status).toBe(403);
  });

  it("compile-time: Permission is an alias of Capability (legacy union is a subset)", () => {
    // If Permission ever drifted from Capability, this assignment would fail tsc.
    const legacy: Permission = "contacts:write";
    const cap: Capability = legacy;
    expect(cap).toBe("contacts:write");
  });
});
