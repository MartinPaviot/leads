import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { approveAgentAction } from "@/lib/agents/agent-actions";

/**
 * POST /api/agent-actions/:id/approve
 *
 * Approves a pending (scheduled) agent action shown in the "Needs your
 * approval" feed. Brings the action's scheduled execution time forward to
 * now so the existing Inngest dispatcher runs it on its next tick (via the
 * already-trusted execution path), and records a positive trust event
 * (approved_no_edit). The matching dismiss action is POST .../reverse.
 *
 * Response:
 *   200 { status: "approved", expeditedAt }
 *   404 { status: "not-found" }
 *   409 { status: "too-late", reason }
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const result = await approveAgentAction({
    actionId: id,
    approvedByUserId: authCtx.userId,
    tenantId: authCtx.tenantId,
  });

  if (result.status === "not-found") {
    return NextResponse.json(result, { status: 404 });
  }
  if (result.status === "too-late") {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
