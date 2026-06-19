import { getAuthContext } from "@/lib/auth/auth-utils";
import {
  getNotificationPrefs,
  saveNotificationPrefs,
  NOTIFICATION_EVENTS,
  type NotificationPrefs,
} from "@/lib/inbox/notification-prefs";

/**
 * GET / PUT /api/inbox/notifications  (INBOX-N01 / N02 / N03)
 *
 * The viewer's notification preferences — per-event opt-in, digest cadence, and
 * a do-not-disturb quiet window — owner-scoped (user_preferences JSONB, no
 * migration). Values are clamped on save. Delivery (push / email) is gated
 * elsewhere and consults shouldNotify; this endpoint only stores the prefs.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const prefs = await getNotificationPrefs(authCtx.userId);
  return Response.json({ events: NOTIFICATION_EVENTS, prefs });
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<NotificationPrefs>;
  try {
    body = (await req.json()) as Partial<NotificationPrefs>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prefs = await saveNotificationPrefs(authCtx.userId, body);
  return Response.json({ events: NOTIFICATION_EVENTS, prefs });
}
