import { getAuthContext } from "@/lib/auth/auth-utils";
import { getTenantMemberNames } from "@/lib/collision/member-names";
import { getContactTouchRows } from "@/lib/collision/contact-touches";
import { computeLastTouchByOthers, RECENT_TOUCH_WINDOW_DAYS } from "@/lib/collision/recent-touch";

/**
 * GET /api/collision/contact?contactId=…
 *
 * "Has a teammate already worked this prospect recently?" Returns the most
 * recent touch by a user OTHER than the caller (or null) so a surface (Call
 * Mode, composer) can show a soft, non-blocking warning. Read-only, additive —
 * it never changes any action's outcome. Consumers treat a non-2xx as "no
 * warning" (fail-closed), so a hiccup here never blocks the real work.
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(req.url, "http://localhost");
    const contactId = url.searchParams.get("contactId")?.trim();
    if (!contactId) return Response.json({ error: "contactId required" }, { status: 400 });

    const since = new Date(Date.now() - RECENT_TOUCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [names, touches] = await Promise.all([
      getTenantMemberNames(authCtx.tenantId),
      getContactTouchRows(authCtx.tenantId, [contactId], since),
    ]);

    const collision = computeLastTouchByOthers(
      touches.get(contactId) ?? [],
      authCtx.appUserId,
      names,
    );
    return Response.json({ collision });
  } catch (error) {
    console.error("Failed to compute contact collision:", error);
    return Response.json({ error: "Failed to compute collision" }, { status: 500 });
  }
}
