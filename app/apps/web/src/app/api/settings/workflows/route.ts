import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface WorkflowDef {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: "deal_stage_changed" | "contact_created" | "email_received" | "task_due" | "schedule";
    conditions?: Record<string, string>;  // e.g. { newStage: "proposal" }
    schedule?: string;  // cron expression for scheduled triggers
  };
  actions: Array<{
    type: "send_notification" | "create_task" | "send_email" | "call_webhook" | "update_field" | "ai_action";
    params: Record<string, string>;
  }>;
  createdAt: string;
  lastRunAt?: string;
  runCount: number;
}

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

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

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { workflows } = await req.json();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) return Response.json({ error: "Not found" }, { status: 404 });

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    await db.update(tenants).set({
      settings: { ...settings, workflows },
      updatedAt: new Date(),
    }).where(eq(tenants.id, authCtx.tenantId));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to save workflows:", error);
    return Response.json({ error: "Failed to save" }, { status: 500 });
  }
}
