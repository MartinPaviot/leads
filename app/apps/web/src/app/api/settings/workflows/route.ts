import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { WorkflowDef } from "@/lib/config/workflow-types";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Admin-only — workflow definitions include webhook URLs, AI prompts, and
  // send/enroll action params (the PUT is already admin-gated).
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    const settings = (tenant?.settings || {}) as Record<string, unknown>;
    const workflows = (settings.workflows || []) as WorkflowDef[];
    return Response.json({ workflows });
  } catch (error) {
    console.error("Failed to fetch workflows:", error);
    return Response.json({ error: "Failed to fetch workflows" }, { status: 500 });
  }
}

const ALLOWED_ACTION_TYPES = new Set([
  "send_notification",
  "create_task",
  "send_email",
  "call_webhook",
  "update_field",
  "ai_action",
  "enroll_sequence",
  "assign_owner",
  "add_tag",
]);

const ALLOWED_TRIGGER_TYPES = new Set([
  "deal_stage_changed",
  "contact_created",
  "email_received",
  "task_due",
  "schedule",
  "deal_won",
  "deal_lost",
  "score_changed",
  "enrichment_completed",
  "sequence_reply_received",
  "meeting_completed",
  "account_created",
]);

function validateWorkflows(input: unknown): { ok: true; workflows: WorkflowDef[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "workflows must be an array" };
  if (input.length > 100) return { ok: false, error: "Maximum 100 workflows per workspace" };
  const out: WorkflowDef[] = [];
  for (const wf of input as WorkflowDef[]) {
    if (!wf || typeof wf !== "object") return { ok: false, error: "Each workflow must be an object" };
    if (typeof wf.id !== "string" || !wf.id.trim()) return { ok: false, error: "Each workflow needs an id" };
    if (typeof wf.name !== "string" || !wf.name.trim()) return { ok: false, error: "Each workflow needs a name" };
    if (!wf.trigger || typeof wf.trigger !== "object") return { ok: false, error: `Workflow ${wf.id}: missing trigger` };
    if (!ALLOWED_TRIGGER_TYPES.has(wf.trigger.type)) return { ok: false, error: `Workflow ${wf.id}: invalid trigger.type` };
    if (!Array.isArray(wf.actions)) return { ok: false, error: `Workflow ${wf.id}: actions must be an array` };
    if (wf.actions.length < 1) return { ok: false, error: `Workflow ${wf.id}: at least 1 action required` };
    if (wf.actions.length > 20) return { ok: false, error: `Workflow ${wf.id}: maximum 20 actions per workflow` };
    for (const a of wf.actions) {
      if (!a || typeof a !== "object") return { ok: false, error: `Workflow ${wf.id}: invalid action shape` };
      if (!ALLOWED_ACTION_TYPES.has(a.type)) return { ok: false, error: `Workflow ${wf.id}: invalid action.type "${a.type}"` };
      if (!a.params || typeof a.params !== "object") return { ok: false, error: `Workflow ${wf.id}: action.params must be an object` };
    }
    out.push(wf);
  }
  return { ok: true, workflows: out };
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const body = await req.json();
    const result = validateWorkflows(body.workflows);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) return Response.json({ error: "Not found" }, { status: 404 });

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    await db.update(tenants).set({
      settings: { ...settings, workflows: result.workflows },
      updatedAt: new Date(),
    }).where(eq(tenants.id, authCtx.tenantId));

    return Response.json({ success: true, workflows: result.workflows });
  } catch (error) {
    console.error("Failed to save workflows:", error);
    return Response.json({ error: "Failed to save" }, { status: 500 });
  }
}
