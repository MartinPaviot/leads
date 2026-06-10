/**
 * Granular permission system.
 *
 * Replaces the binary admin/member check with fine-grained permissions
 * mapped to roles. Routes call `requirePermission()` which throws a
 * structured 403 when the caller's role lacks the requested permission.
 */

export type Permission =
  | "contacts:read"
  | "contacts:write"
  | "contacts:delete"
  | "companies:delete"
  | "deals:read"
  | "deals:write"
  | "deals:delete"
  | "sequences:read"
  | "sequences:write"
  | "sequences:execute"
  | "settings:read"
  | "settings:write"
  | "billing:manage"
  | "members:invite"
  | "members:manage"
  | "mcp:manage";

const ALL_PERMISSIONS: Permission[] = [
  "contacts:read",
  "contacts:write",
  "contacts:delete",
  "companies:delete",
  "deals:read",
  "deals:write",
  "deals:delete",
  "sequences:read",
  "sequences:write",
  "sequences:execute",
  "settings:read",
  "settings:write",
  "billing:manage",
  "members:invite",
  "members:manage",
  "mcp:manage",
];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [...ALL_PERMISSIONS],
  // Members are sellers: full CRM read/write incl. soft-deletes (recoverable
  // since the delete/restore-coherence work) and running their OWN outbound
  // (sequences:execute — sending identity stays per-owner regardless).
  // Admin keeps exclusivity on settings:write, billing, members and mcp.
  member: [
    "contacts:read",
    "contacts:write",
    "contacts:delete",
    "companies:delete",
    "deals:read",
    "deals:write",
    "deals:delete",
    "sequences:read",
    "sequences:write",
    "sequences:execute",
    "settings:read",
  ],
  // Viewers (advisors, investors, coaches) are read-only. Writes are also
  // blocked centrally in the middleware (lib/auth/viewer-guard.ts) and the
  // chat strips mutation tools (lib/agents/capability-resolver.ts).
  viewer: [
    "contacts:read",
    "deals:read",
    "sequences:read",
    "settings:read",
  ],
};

/**
 * Check whether a role grants a specific permission.
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const allowed = ROLE_PERMISSIONS[role];
  if (!allowed) return false;
  return allowed.includes(permission);
}

/**
 * Assert that a role grants a specific permission.
 * Returns a 403 Response if denied, or `null` if the check passes.
 *
 * Usage in route handlers:
 *
 *   const denied = requirePermission(authCtx.role, "contacts:delete");
 *   if (denied) return denied;
 */
export function requirePermission(
  role: string,
  permission: Permission,
): Response | null {
  if (hasPermission(role, permission)) return null;
  return Response.json(
    {
      error: {
        code: "FORBIDDEN",
        message: `Missing permission: ${permission}`,
        requiredPermission: permission,
        currentRole: role,
      },
    },
    { status: 403 },
  );
}
