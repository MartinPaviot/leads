import { getAuthContext } from "@/lib/auth/auth-utils";
import { listThreadLabels, listTenantLabels, addThreadLabel, removeThreadLabel } from "@/lib/inbox/label-store";

/**
 * Shared thread labels (INBOX-X04). Tenant-scoped — any member reads/changes.
 *   GET    /api/inbox/labels?key=<key> → { labels, suggestions }
 *   POST   /api/inbox/labels { key, name } → apply, returns labels
 *   DELETE /api/inbox/labels?key=<key>&name=<name> → remove, returns labels
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const key = new URL(req.url, "http://localhost").searchParams.get("key");
  if (!key) return Response.json({ error: "key required" }, { status: 400 });
  try {
    const [labels, suggestions] = await Promise.all([
      listThreadLabels(authCtx.tenantId, key),
      listTenantLabels(authCtx.tenantId),
    ]);
    return Response.json({ labels, suggestions });
  } catch (error) {
    console.error("Failed to load labels:", error);
    return Response.json({ labels: [], suggestions: [] });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { key?: string; name?: string };
    if (!body.key || !body.name) return Response.json({ error: "key and name required" }, { status: 400 });
    const labels = await addThreadLabel(authCtx.tenantId, body.key, body.name, authCtx.appUserId);
    return Response.json({ labels });
  } catch (error) {
    console.error("Failed to apply label:", error);
    return Response.json({ error: "Failed to apply label" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url, "http://localhost");
  const key = url.searchParams.get("key");
  const name = url.searchParams.get("name");
  if (!key || !name) return Response.json({ error: "key and name required" }, { status: 400 });
  try {
    const labels = await removeThreadLabel(authCtx.tenantId, key, name);
    return Response.json({ labels });
  } catch (error) {
    console.error("Failed to remove label:", error);
    return Response.json({ error: "Failed to remove label" }, { status: 500 });
  }
}
