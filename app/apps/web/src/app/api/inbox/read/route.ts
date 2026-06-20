import { getAuthContext } from "@/lib/auth/auth-utils";
import { markRead } from "@/lib/inbox/read-store";

/**
 * Mark a conversation read (Upstream parity). POST { key, at? } — `at` is the
 * timestamp read up to (defaults to now); the pane sends the thread's last message
 * time on open so a later reply re-marks it unread. Owner-scoped via the read-store.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { key?: string; at?: string };
  if (!body.key) return Response.json({ error: "key required" }, { status: 400 });

  await markRead(authCtx.userId, body.key, typeof body.at === "string" ? body.at : undefined);
  return Response.json({ ok: true });
}
