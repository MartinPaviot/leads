import { getAuthContext } from "@/lib/auth/auth-utils";
import { heartbeat, getViewers } from "@/lib/inbox/presence-store";
import { presenceSummary } from "@/lib/inbox/presence";
import { getTenantMemberNames } from "@/lib/collision/member-names";

/**
 * Live thread presence (INBOX-X03).
 *   POST /api/inbox/presence { key, state? } → record my heartbeat
 *   GET  /api/inbox/presence?key=<key>       → other active viewers + a summary
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { key?: string; state?: string };
    if (!body.key) return Response.json({ error: "key required" }, { status: 400 });
    const state = body.state === "drafting" ? "drafting" : "viewing";
    await heartbeat(authCtx.tenantId, body.key, authCtx.appUserId, state);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to record presence:", error);
    return Response.json({ ok: false });
  }
}

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const key = new URL(req.url, "http://localhost").searchParams.get("key");
  if (!key) return Response.json({ error: "key required" }, { status: 400 });
  try {
    const viewers = await getViewers(authCtx.tenantId, key, authCtx.appUserId);
    if (viewers.length === 0) return Response.json({ viewers: [], summary: "" });
    const names = await getTenantMemberNames(authCtx.tenantId);
    const nameMap = Object.fromEntries(names);
    return Response.json({
      viewers: viewers.map((v) => ({ ...v, name: nameMap[v.userId] || "Someone" })),
      summary: presenceSummary(viewers, nameMap),
    });
  } catch (error) {
    console.error("Failed to load presence:", error);
    return Response.json({ viewers: [], summary: "" });
  }
}
