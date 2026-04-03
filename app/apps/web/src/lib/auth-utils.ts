import { auth } from "@/auth";

export interface AuthContext {
  userId: string;
  tenantId: string;
  appUserId: string;
  role: string;
}

/**
 * Get authenticated user context with tenant information.
 * Returns null if not authenticated or tenant is missing.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const tenantId = (session as any).tenantId as string | undefined;
  const appUserId = (session as any).appUserId as string | undefined;
  const role = (session as any).role as string | undefined;

  // Require tenant context for all data operations
  if (!tenantId) return null;

  return {
    userId: session.user.id,
    tenantId,
    appUserId: appUserId || session.user.id,
    role: role || "member",
  };
}

/**
 * Check if the authenticated user has admin role.
 * Returns a 403 Response if not admin, or null if the check passes.
 */
export function requireAdmin(authCtx: AuthContext): Response | null {
  if (authCtx.role !== "admin") {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}
