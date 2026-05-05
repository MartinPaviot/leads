import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { customSkillTemplates } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const [existing] = await db
    .select()
    .from(customSkillTemplates)
    .where(
      and(
        eq(customSkillTemplates.id, id),
        eq(customSkillTemplates.tenantId, authCtx.tenantId),
      ),
    )
    .limit(1);

  if (!existing) return Response.json({ error: "Play not found" }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updates.name = body.name;
  if (body.category !== undefined) updates.category = body.category;
  if (body.description !== undefined) updates.description = body.description;
  if (body.guidelines !== undefined) updates.guidelines = body.guidelines;
  if (body.trigger !== undefined) updates.trigger = body.trigger;
  if (body.examples !== undefined) updates.examples = body.examples;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  // Increment version on content changes
  if (body.guidelines !== undefined || body.examples !== undefined) {
    updates.version = (existing.version ?? 1) + 1;
  }

  const [updated] = await db
    .update(customSkillTemplates)
    .set(updates)
    .where(eq(customSkillTemplates.id, id))
    .returning();

  return Response.json({ play: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await db
    .delete(customSkillTemplates)
    .where(
      and(
        eq(customSkillTemplates.id, id),
        eq(customSkillTemplates.tenantId, authCtx.tenantId),
      ),
    );

  return Response.json({ success: true });
}
