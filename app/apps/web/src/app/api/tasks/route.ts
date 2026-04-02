import { db } from "@/db";
import { tasks } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { eq, desc, and } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db.select().from(tasks).where(eq(tasks.tenantId, authCtx.tenantId)).orderBy(desc(tasks.createdAt)).limit(100);
    return Response.json({ tasks: result });
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return Response.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { title, description, dueDate, priority, entityType, entityId } = body;

    if (!title) {
      return Response.json({ error: "Title is required" }, { status: 400 });
    }

    const [task] = await db
      .insert(tasks)
      .values({
        title: title.trim(),
        description: description || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority || "medium",
        assigneeId: authCtx.appUserId,
        entityType: entityType || null,
        entityId: entityId || null,
        tenantId: authCtx.tenantId,
      })
      .returning();

    return Response.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return Response.json({ error: "Failed to create task" }, { status: 500 });
  }
}
