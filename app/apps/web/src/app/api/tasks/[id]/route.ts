import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) updates.status = body.status;
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    updates.updatedAt = new Date();

    const [updated] = await db
      .update(tasks)
      .set(updates as any)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, authCtx.tenantId)))
      .returning();

    if (!updated) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    return Response.json({ task: updated });
  } catch (error) {
    console.error("Failed to update task:", error);
    return Response.json({ error: "Failed to update task" }, { status: 500 });
  }
}
