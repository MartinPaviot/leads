import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { agentTasks } from "@/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 100);

  const conditions = [eq(agentTasks.tenantId, authCtx.tenantId)];

  if (statusFilter) {
    const statuses = statusFilter.split(",");
    conditions.push(inArray(agentTasks.status, statuses));
  }

  const [tasks, runningCount] = await Promise.all([
    db
      .select()
      .from(agentTasks)
      .where(and(...conditions))
      .orderBy(desc(agentTasks.queuedAt))
      .limit(limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.userId, authCtx.userId),
          inArray(agentTasks.status, ["running", "cancelling"])
        )
      ),
  ]);

  return Response.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      type: t.type,
      title: t.title,
      description: t.description,
      status: t.status,
      progressCurrent: t.progressCurrent,
      progressTotal: t.progressTotal,
      progressMessage: t.progressMessage,
      result: t.result,
      error: t.error,
      chatThreadId: t.chatThreadId,
      queuedAt: t.queuedAt?.toISOString(),
      startedAt: t.startedAt?.toISOString(),
      completedAt: t.completedAt?.toISOString(),
    })),
    running: runningCount[0]?.count ?? 0,
    limit: 5,
  });
}
