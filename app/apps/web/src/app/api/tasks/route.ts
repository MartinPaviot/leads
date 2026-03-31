import { db } from "@/db";
import { tasks } from "@/db/schema";
import { auth } from "@/auth";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db.select().from(tasks).orderBy(desc(tasks.createdAt)).limit(100);
    return Response.json({ tasks: result });
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return Response.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
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
        assigneeId: session.user.id,
        entityType: entityType || null,
        entityId: entityId || null,
        tenantId: "default",
      })
      .returning();

    return Response.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return Response.json({ error: "Failed to create task" }, { status: 500 });
  }
}
