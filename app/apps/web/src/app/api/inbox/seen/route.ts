import { getAuthContext } from "@/lib/auth/auth-utils";
import { setLastSeen } from "@/lib/inbox/seen-store";

/**
 * POST /api/inbox/seen — mark the catch-me-up digest as seen (INBOX-S03).
 * Stamps the user's lastSeenAt = now so the "N new since you were last here"
 * banner clears. Owner-scoped; no body.
 */
export async function POST() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await setLastSeen(authCtx.userId, new Date().toISOString());
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to update inbox last-seen:", error);
    return Response.json({ error: "Failed to update last-seen" }, { status: 500 });
  }
}
