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
  const settings = tenant?.settings as Record<string, unknown> | null;
  const mode = getCaptureApprovalMode(settings);
  const fieldModes = (settings?.captureFieldModes as Record<string, unknown> | undefined) ?? null;
  return Response.json({ approvals, mode, fieldModes });
}

export async function PATCH(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode = String(body.mode ?? "").toLowerCase();
  if (mode !== "auto" && mode !== "review" && mode !== "hybrid") {
    return Response.json({ error: "mode must be 'auto', 'review' or 'hybrid'" }, { status: 400 });
  }

  // Optional per-field map for hybrid mode. Only the four known CRM facts are
  // accepted, values clamped to 'auto' | 'review'.
  const FIELD_KEYS = ["meddic", "evidence", "callIntel", "callProfile"] as const;
  let fieldModes: Record<string, "auto" | "review"> | undefined;
  if (body.fieldModes && typeof body.fieldModes === "object") {
    fieldModes = {};
    for (const k of FIELD_KEYS) {
      const v = String((body.fieldModes as Record<string, unknown>)[k] ?? "").toLowerCase();
      if (v === "review" || v === "auto") fieldModes[k] = v;
    }
  }

  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, authCtx.tenantId))
    .limit(1);
  if (!tenant) return Response.json({ error: "Workspace not found" }, { status: 404 });

  const current = (tenant.settings || {}) as Record<string, unknown>;
  const nextSettings: Record<string, unknown> = { ...current, captureApprovalMode: mode };
  if (fieldModes) {
    nextSettings.captureFieldModes = {
      ...((current.captureFieldModes as Record<string, unknown>) || {}),
      ...fieldModes,
    };
  }
  await db
    .update(tenants)
    .set({ settings: nextSettings, updatedAt: new Date() })
    .where(eq(tenants.id, authCtx.tenantId));

  return Response.json({ success: true, mode, fieldModes: nextSettings.captureFieldModes ?? null });
}
