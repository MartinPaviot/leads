import { auth } from "@/auth";
import { authToAppUserId } from "@/lib/auth/user-id";
import {
  getSessionGuard,
  isTokenPredatingPasswordChange,
} from "@/lib/auth/session-guard";
import { getFreshUserState } from "@/lib/auth/fresh-role";

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

  const claimTenantId = (session as any).tenantId as string | undefined;
  let appUserId = (session as any).appUserId as string | undefined;
  const role = (session as any).role as string | undefined;

  // SOC2 T5/T7 — server-side revocation gate (60s-cached DB read).
  // Deactivated members and tokens issued before the last password
  // change are treated as signed out even though the JWT itself is
  // still cryptographically valid for up to 8h.
  const guard = await getSessionGuard(session.user.id);
  if (guard.deactivatedAt) return null;
  const issuedAt = (session as any).issuedAt as number | undefined;
  if (isTokenPredatingPasswordChange(issuedAt, guard.passwordChangedAt)) {
    return null;
  }

  // `appUserId` is the APP `users.id` (NOT the auth-user id). New sessions
  // always carry it (set in the jwt callback from resolveUserTenant). For a
  // STALE token issued before that field existed, resolve it from the DB via
  // the bridge rather than silently substituting the auth id — which would put
  // the wrong id space into every `users.id` FK (ownerId, createdByUserId, …).
  // The DB lookup only runs on this rare fallback path, never the common one.
  // See lib/auth/user-id.ts for the two-id-space convention.
  if (!appUserId) {
    appUserId = (await authToAppUserId(session.user.id)) ?? undefined;
  }

  // The JWT role AND tenantId are minted at sign-in and never re-read until
  // the token expires (8h), so promotions/demotions — and TENANT SWITCHES
  // (invite accepted into another workspace) — would lag a full workday.
  // A live.fr member hit exactly that on 2026-06-11: invite accepted at
  // 13:55, but every session token minted earlier kept routing him to his
  // old empty solo workspace. Overlay the DB values (60s in-memory cache;
  // null on DB failure → keep the JWT claims) so role changes AND workspace
  // switches apply within a minute on every live session, no re-login
  // needed. users.tenantId is the single source of truth for membership —
  // the JWT claim is just its boot-time snapshot.
  const fresh = appUserId ? await getFreshUserState(appUserId) : null;

  // Require tenant context for all data operations. The DB overlay wins
  // over the claim; a session with neither is unusable.
  const tenantId = fresh?.tenantId || claimTenantId;
  if (!tenantId) return null;

  return {
    userId: session.user.id,
    tenantId,
    appUserId: appUserId || session.user.id,
    role: fresh?.role || role || "member",
  };
}

/**
 * Authenticate, then run the handler with the resolved context.
 *
 * This is the recommended wrapper for API routes that perform
 * tenant-scoped database queries. Isolation comes from the app-layer
 * `WHERE tenant_id = ?` filters plus the 0074 fallback RLS policies;
 * routes that want the DB to enforce a pinned tenant context use
 * `withTenantTx` from @/db/rls (the session-scoped set_config this
 * wrapper used to issue was pooler-unsound and poisoned shared backends
 * — see _audit/2026-06-10-rls-session-poison.md).
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

  return handler(authCtx);
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
