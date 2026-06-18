import { getAuthContext } from "@/lib/auth/auth-utils";
import { getAssigneeId, setAssignee, clearAssignee } from "@/lib/inbox/assignment-store";
import { resolveAssignee, type Member } from "@/lib/inbox/assignment";
import { getTenantMemberNames } from "@/lib/collision/member-names";

/**
 * Per-thread assignment (INBOX-X01). Tenant-scoped — any member can read/change.
 *   GET    /api/inbox/assignment?key=<key> → { assignee, members }
 *   POST   /api/inbox/assignment { key, assigneeId } → assign
 *   DELETE /api/inbox/assignment?key=<key> → unassign
 */
async function members(tenantId: string): Promise<Member[]> {
  const map = await getTenantMemberNames(tenantId);
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const key = new URL(req.url, "http://localhost").searchParams.get("key");
  if (!key) return Response.json({ error: "key required" }, { status: 400 });
  try {
    const [assigneeId, list] = await Promise.all([getAssigneeId(authCtx.tenantId, key), members(authCtx.tenantId)]);
    return Response.json({ assignee: resolveAssignee(assigneeId, list), members: list });
  } catch (error) {
    console.error("Failed to load assignment:", error);
    return Response.json({ assignee: null, members: [] });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { key?: string; assigneeId?: string };
    if (!body.key || !body.assigneeId) return Response.json({ error: "key and assigneeId required" }, { status: 400 });
    const list = await members(authCtx.tenantId);
    if (!list.some((m) => m.id === body.assigneeId)) {
      return Response.json({ error: "Not a member of this workspace" }, { status: 400 });
    }
    await setAssignee(authCtx.tenantId, body.key, body.assigneeId, authCtx.appUserId);
    return Response.json({ assignee: resolveAssignee(body.assigneeId, list) });
  } catch (error) {
    console.error("Failed to assign thread:", error);
    return Response.json({ error: "Failed to assign" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const key = new URL(req.url, "http://localhost").searchParams.get("key");
  if (!key) return Response.json({ error: "key required" }, { status: 400 });
  try {
    await clearAssignee(authCtx.tenantId, key);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to unassign thread:", error);
    return Response.json({ error: "Failed to unassign" }, { status: 500 });
  }
}
