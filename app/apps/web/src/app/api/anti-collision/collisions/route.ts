import { getAuthContext } from "@/lib/auth/auth-utils";
import { countCollisions, getRecentCollisions } from "@/lib/anti-collision/db-collision-log";

/**
 * GET /api/anti-collision/collisions?days=<n> — spec 14 observe phase. The
 * collision log + counts the founder reads to decide whether to flip
 * ANTI_COLLISION_ENFORCE on. `wouldHaveBlocked` = collisions caught in observe
 * mode (enforcement off) — i.e. double-enrollments that enforcement would stop.
 * Tenant-scoped, read-only.
 */
export async function GET(request: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const daysParam = new URL(request.url).searchParams.get("days");
  const days = daysParam ? Number(daysParam) : 30;
  const sinceMs = Number.isFinite(days) && days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : undefined;

  try {
    const [counts, recent] = await Promise.all([
      countCollisions(authCtx.tenantId, { sinceMs }),
      getRecentCollisions(authCtx.tenantId, { sinceMs, limit: 50 }),
    ]);
    return Response.json({ windowDays: sinceMs ? days : null, counts, recent });
  } catch (error) {
    console.error("Failed to read collision log:", error);
    return Response.json({ error: "Failed to read collision log" }, { status: 500 });
  }
}
