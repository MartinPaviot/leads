import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { agentTasks } from "@/db/schema";
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

  const [task] = await db
    .select()
    .from(agentTasks)
    .where(and(eq(agentTasks.id, id), eq(agentTasks.tenantId, authCtx.tenantId)))
    .limit(1);

  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  return Response.json({
    id: task.id,
    type: task.type,
    title: task.title,
    description: task.description,
    status: task.status,
    progressCurrent: task.progressCurrent,
    progressTotal: task.progressTotal,
    progressMessage: task.progressMessage,
    result: task.result,
    error: task.error,
    chatThreadId: task.chatThreadId,
    dependsOn: task.dependsOn,
    queuedAt: task.queuedAt?.toISOString(),
    startedAt: task.startedAt?.toISOString(),
    completedAt: task.completedAt?.toISOString(),
  });
}
