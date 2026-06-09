/**
 * GET   /api/capture-approvals — pending auto-captured interactions awaiting
 *        human approval (gap E), plus the workspace's current capture mode.
 *        The queue is empty unless settings.captureApprovalMode = 'review'.
 * PATCH /api/capture-approvals — set the workspace capture mode
 *        ('auto' | 'review'). This is the control that was missing: without
 *        it the review queue could never be populated.
 */
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listPendingApprovals, getCaptureApprovalMode } from "@/lib/capture/approval";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const approvals = await listPendingApprovals(authCtx.tenantId);
  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, authCtx.tenantId))
    .limit(1);
  const mode = getCaptureApprovalMode(tenant?.settings as Record<string, unknown> | null);
  return Response.json({ approvals, mode });
}

export async function PATCH(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode = String(body.mode ?? "").toLowerCase();
  if (mode !== "auto" && mode !== "review") {
    return Response.json({ error: "mode must be 'auto' or 'review'" }, { status: 400 });
  }

  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, authCtx.tenantId))
    .limit(1);
  if (!tenant) return Response.json({ error: "Workspace not found" }, { status: 404 });

  const current = (tenant.settings || {}) as Record<string, unknown>;
  await db
    .update(tenants)
    .set({ settings: { ...current, captureApprovalMode: mode }, updatedAt: new Date() })
    .where(eq(tenants.id, authCtx.tenantId));

  return Response.json({ success: true, mode });
}
