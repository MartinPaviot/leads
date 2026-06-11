import { getAuthContext } from "@/lib/auth/auth-utils";
import { z } from "zod";
import { getTenantMemberNames } from "@/lib/collision/member-names";
import { getContactTouchRows } from "@/lib/collision/contact-touches";
import { assembleContactCollisions, RECENT_TOUCH_WINDOW_DAYS } from "@/lib/collision/recent-touch";

/**
 * POST /api/collision/contacts  { contactIds: string[] }  (max 200)
 *
 * Batch variant of /api/collision/contact for the pre-enroll surface: returns,
 * per contact, the most recent touch by another user (or null). One member-name
 * lookup + one windowed touch fetch for the whole set (no N+1). Additive +
 * non-blocking — the enroll flow uses it only to warn, never to skip.
 */
const schema = z.object({
  contactIds: z.array(z.string().min(1)).max(200),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await req.json());
  } catch {
    return Response.json({ error: "contactIds[] (max 200) required" }, { status: 422 });
  }

  try {
    const ids = [...new Set(parsed.contactIds)];
    if (ids.length === 0) return Response.json({ collisions: {} });

    const since = new Date(Date.now() - RECENT_TOUCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [names, touches] = await Promise.all([
      getTenantMemberNames(authCtx.tenantId),
      getContactTouchRows(authCtx.tenantId, ids, since),
    ]);

    const collisions = assembleContactCollisions(touches, authCtx.appUserId, names);
    return Response.json({ collisions });
  } catch (error) {
    console.error("Failed to compute contact collisions:", error);
    return Response.json({ error: "Failed to compute collisions" }, { status: 500 });
  }
}
