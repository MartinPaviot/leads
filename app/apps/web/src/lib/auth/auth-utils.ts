import { auth } from "@/auth";
import { setTenantId, clearTenantId } from "@/db/rls";

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
 * Authenticate, set RLS tenant context, run the handler, then clear RLS.
 *
 * This is the recommended wrapper for API routes that perform
 * tenant-scoped database queries. It combines authentication with
 * Row-Level Security enforcement so every route that uses it
 * automatically gets defense-in-depth tenant isolation.
 *
 * @example
 * export async function GET() {
 *   return withAuthRLS(async (authCtx) => {
 *     const rows = await db.select().from(contacts);
 *     return Response.json({ rows });
 *   });
 * }
 */
export async function withAuthRLS(
  handler: (authCtx: AuthContext) => Promise<Response>,
): Promise<Response> {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setTenantId(authCtx.tenantId);
  try {
    return await handler(authCtx);
  } finally {
    await clearTenantId();
  }
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
