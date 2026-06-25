import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/infra/audit-log";

interface PipelineStage {
  id: string;
  name: string;
  description: string;
  category: "in_progress" | "done";
  // The /settings/stages page renders an aiFillMode selector + a WIP limit per
  // stage and treats aiFillMode as required. The defaults below omitted both, so
  // a fresh tenant's stages loaded with no AI-fill selection highlighted.
  aiFillMode?: "auto" | "suggest" | "off";
  wipLimit?: number | null;
}

const DEFAULT_STAGES: PipelineStage[] = [
  { id: "lead", name: "Lead", description: "Initial contact with a potential prospect", category: "in_progress", aiFillMode: "suggest", wipLimit: null },
  { id: "qualification", name: "Qualification", description: "Initial meeting booked", category: "in_progress", aiFillMode: "suggest", wipLimit: null },
  { id: "demo", name: "Demo", description: "Demo scheduled", category: "in_progress", aiFillMode: "suggest", wipLimit: null },
  { id: "trial", name: "Trial", description: "Prospect expressed interest in trial", category: "in_progress", aiFillMode: "suggest", wipLimit: null },
  { id: "proposal", name: "Proposal", description: "Prospect is ready to work through terms", category: "in_progress", aiFillMode: "suggest", wipLimit: null },
  { id: "negotiation", name: "Negotiation", description: "Negotiating contract terms", category: "in_progress", aiFillMode: "suggest", wipLimit: null },
  { id: "won", name: "Won", description: "Agreement signed", category: "done", aiFillMode: "suggest", wipLimit: null },
  { id: "lost", name: "Lost", description: "Deal lost", category: "done", aiFillMode: "suggest", wipLimit: null },
];

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    const settings = (tenant?.settings || {}) as Record<string, unknown>;
    const stages = (settings.pipelineStages as PipelineStage[]) || DEFAULT_STAGES;
    return Response.json({ stages });
  } catch (error) {
    console.error("Failed to fetch stages:", error);
    return Response.json({ error: "Failed to fetch stages" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const body = await req.json();
    const { stages } = body;

    if (!stages || !Array.isArray(stages)) {
      return Response.json({ error: "stages array required" }, { status: 400 });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) return Response.json({ error: "Not found" }, { status: 404 });

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const oldStages = settings.pipelineStages || null;

    await db.update(tenants).set({
      settings: { ...settings, pipelineStages: stages },
      updatedAt: new Date(),
    }).where(eq(tenants.id, authCtx.tenantId));

    await logAudit({
      tenantId: authCtx.tenantId,
      userId: authCtx.appUserId,
      action: "update",
      entityType: "pipeline_config",
      entityId: authCtx.tenantId,
      changes: {
        pipelineStages: { old: oldStages, new: stages },
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update stages:", error);
    return Response.json({ error: "Failed to update stages" }, { status: 500 });
  }
}
