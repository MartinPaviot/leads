import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { customSkillTemplates } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [skill] = await db
    .select()
    .from(customSkillTemplates)
    .where(
      and(
        eq(customSkillTemplates.id, id),
        eq(customSkillTemplates.tenantId, authCtx.tenantId)
      )
    )
    .limit(1);

  if (!skill) {
    return Response.json({ error: "Skill not found" }, { status: 404 });
  }

  return Response.json({ skill });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(customSkillTemplates)
    .where(
      and(
        eq(customSkillTemplates.id, id),
        eq(customSkillTemplates.tenantId, authCtx.tenantId)
      )
    )
    .limit(1);

  if (!existing) {
    return Response.json({ error: "Skill not found" }, { status: 404 });
  }

  if (
    existing.createdByUserId !== authCtx.appUserId &&
    authCtx.role !== "admin"
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined)
    updates.description = body.description.trim();
  if (body.category !== undefined) updates.category = body.category;
  if (body.steps !== undefined) updates.steps = body.steps;
  if (body.constraints !== undefined) updates.constraints = body.constraints;
  if (body.parameters !== undefined) updates.parameters = body.parameters;
  if (body.outputFormat !== undefined) updates.outputFormat = body.outputFormat;
  if (body.guidelines !== undefined)
    updates.guidelines = body.guidelines.trim();

  await db
    .update(customSkillTemplates)
    .set(updates)
    .where(eq(customSkillTemplates.id, id));

  return Response.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(customSkillTemplates)
    .where(
      and(
        eq(customSkillTemplates.id, id),
        eq(customSkillTemplates.tenantId, authCtx.tenantId)
      )
    )
    .limit(1);

  if (!existing) {
    return Response.json({ error: "Skill not found" }, { status: 404 });
  }

  if (
    existing.createdByUserId !== authCtx.appUserId &&
    authCtx.role !== "admin"
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .update(customSkillTemplates)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(customSkillTemplates.id, id));

  return Response.json({ success: true });
}
