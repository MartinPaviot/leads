/**
 * GET /api/capture-approvals — pending auto-captured interactions awaiting
 * human approval (gap E). Empty unless the tenant set
 * settings.captureApprovalMode = 'review'.
 */
import { getAuthContext } from "@/lib/auth/auth-utils";
import { listPendingApprovals } from "@/lib/capture/approval";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const approvals = await listPendingApprovals(authCtx.tenantId);
  return Response.json({ approvals });
}
