import { getAuthContext } from "@/lib/auth/auth-utils";
import { apiError } from "@/lib/infra/api-errors";
import { isSlotFree } from "@/lib/integrations/meeting-availability";

/**
 * GET /api/meetings/availability/check?start=<iso>&duration=45
 *
 * Is the given slot free on the user's connected calendar? Backstops the manual
 * datetime picker before booking (the week-strip pills are free by construction).
 * No calendar connected → free:true (can't validate; never block the booking).
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");

  const url = new URL(req.url);
  const start = new Date(url.searchParams.get("start") ?? "");
  if (Number.isNaN(start.getTime())) {
    return apiError("VALIDATION_ERROR", "A valid `start` is required");
  }
  const duration = Math.min(240, Math.max(15, Number(url.searchParams.get("duration")) || 30));

  try {
    const { free, source } = await isSlotFree(authCtx.userId, authCtx.tenantId, start, duration);
    return Response.json({ free, source });
  } catch {
    // Validation is a backstop — never block a booking on its failure.
    return Response.json({ free: true, source: "none" });
  }
}
