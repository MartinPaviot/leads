"use client";

import { createContext, useContext } from "react";
import { hasPermission, type Permission } from "@/lib/auth/permissions";

/**
 * Client-side role context. Seeded once by the dashboard layout (server
 * component) from the DB role — the same source `getAuthContext` overlays
 * server-side — so client affordances and server gates agree.
 *
 * This drives UI affordance ONLY (hide/disable controls a role can't use).
 * It is NOT a security boundary: every mutation is still gated server-side
 * (middleware viewer-guard + requirePermission). A hidden button that a
 * determined viewer un-hides still 403s at the API.
 */
const RoleContext = createContext<string>("member");

export function RoleProvider({
  role,
  children,
}: {
  role: string;
  children: React.ReactNode;
}) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

/** The current user's workspace role ("admin" | "member" | "viewer"). */
export function useRole(): string {
  return useContext(RoleContext);
}

/** Whether the current role grants a permission (mirrors server ROLE_PERMISSIONS). */
export function useCan(permission: Permission): boolean {
  return hasPermission(useContext(RoleContext), permission);
}

/** Convenience: read-only role. */
export function useIsViewer(): boolean {
  return useContext(RoleContext) === "viewer";
}

/** Convenience: full-control role. */
export function useIsAdmin(): boolean {
  return useContext(RoleContext) === "admin";
}

/**
 * Render `children` only when the current role has `permission`.
 * Optional `fallback` shows instead (e.g. a read-only hint). Use for
 * write controls a viewer shouldn't see: <Can permission="contacts:write">…
 */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return useCan(permission) ? <>{children}</> : <>{fallback}</>;
}
