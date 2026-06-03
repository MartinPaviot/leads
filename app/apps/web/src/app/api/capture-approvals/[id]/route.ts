/**
 * POST /api/capture-approvals/[id]  body { action: "approve" | "reject" }
 *
 * Approve → inserts the proposed activity into the CRM and marks applied.
 * Reject → discards it. Gap E (human-in-the-loop capture).
 */
import { getAuthContext } from "@/lib/auth/auth-utils";
import { approveCapture, rejectCapture } from "@/lib/capture/approval";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "approve") {
    const res = await approveCapture(authCtx.tenantId, id, authCtx.userId);
    if (!res) return Response.json({ error: "Not found or already reviewed" }, { status: 404 });
    return Response.json({ ok: true, activityId: res.activityId });
  }
  if (body.action === "reject") {
    const ok = await rejectCapture(authCtx.tenantId, id, authCtx.userId);
    if (!ok) return Response.json({ error: "Not found or already reviewed" }, { status: 404 });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
}
