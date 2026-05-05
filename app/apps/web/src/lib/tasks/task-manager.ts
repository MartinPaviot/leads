import { db } from "@/db";
import { agentTasks } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { sendNotification } from "@/lib/emails/notifications";
import logger from "@/lib/observability/logger";

export type AgentTaskType =
  | "import"
  | "bulk_skill"
  | "enrichment"
  | "code_execution"
  | "analysis"
  | "migration";

const MAX_CONCURRENT_TASKS = 5;

interface CreateTaskParams {
  type: AgentTaskType;
  title: string;
  tenantId: string;
  userId: string;
  description?: string;
  chatThreadId?: string;
  chatMessageId?: string;
  progressTotal?: number;
  dependsOn?: string[];
  metadata?: Record<string, unknown>;
}

export interface TaskContext {
  taskId: string;
  tenantId: string;
  updateProgress(current: number, message?: string): Promise<void>;
  saveCheckpoint<T extends Record<string, unknown>>(data: T): Promise<void>;
  getCheckpoint<T>(): Promise<T | null>;
  isCancelled(): Promise<boolean>;
  complete(result: unknown): Promise<void>;
  fail(error: string): Promise<void>;
}

export async function createTask(params: CreateTaskParams): Promise<string> {
  const [task] = await db
    .insert(agentTasks)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      description: params.description,
      status: "queued",
      progressTotal: params.progressTotal,
      chatThreadId: params.chatThreadId,
      chatMessageId: params.chatMessageId,
      dependsOn: params.dependsOn ?? [],
      checkpoint: params.metadata ? { metadata: params.metadata } : undefined,
    })
    .returning();

  const eventId = await inngest.send({
    name: "agent-task/execute",
    data: { taskId: task.id, tenantId: params.tenantId },
  });

  await db
    .update(agentTasks)
    .set({ inngestEventId: Array.isArray(eventId) ? eventId[0]?.ids?.[0] : undefined })
    .where(eq(agentTasks.id, task.id));

  return task.id;
}

export async function getActiveTaskCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentTasks)
    .where(
      and(
        eq(agentTasks.userId, userId),
        inArray(agentTasks.status, ["running", "cancelling"])
      )
    );
  return row?.count ?? 0;
}

export async function canStartTask(userId: string): Promise<boolean> {
  return (await getActiveTaskCount(userId)) < MAX_CONCURRENT_TASKS;
}

export function buildTaskContext(
  taskId: string,
  tenantId: string
): TaskContext {
  return {
    taskId,
    tenantId,

    async updateProgress(current: number, message?: string) {
      await db
        .update(agentTasks)
        .set({
          progressCurrent: current,
          ...(message !== undefined ? { progressMessage: message } : {}),
          status: "running",
          startedAt: sql`COALESCE(${agentTasks.startedAt}, now())`,
          updatedAt: new Date(),
        })
        .where(eq(agentTasks.id, taskId));
    },

    async saveCheckpoint<T extends Record<string, unknown>>(data: T) {
      await db
        .update(agentTasks)
        .set({ checkpoint: data as Record<string, unknown>, updatedAt: new Date() })
        .where(eq(agentTasks.id, taskId));
    },

    async getCheckpoint<T>(): Promise<T | null> {
      const [task] = await db
        .select({ checkpoint: agentTasks.checkpoint })
        .from(agentTasks)
        .where(eq(agentTasks.id, taskId))
        .limit(1);
      return (task?.checkpoint as T) ?? null;
    },

    async isCancelled(): Promise<boolean> {
      const [task] = await db
        .select({ status: agentTasks.status })
        .from(agentTasks)
        .where(eq(agentTasks.id, taskId))
        .limit(1);
      return task?.status === "cancelling";
    },

    async complete(result: unknown) {
      const [task] = await db
        .select({ userId: agentTasks.userId, title: agentTasks.title })
        .from(agentTasks)
        .where(eq(agentTasks.id, taskId))
        .limit(1);

      await db
        .update(agentTasks)
        .set({
          status: "completed",
          result: result as Record<string, unknown>,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentTasks.id, taskId));

      if (task) {
        await sendNotification({
          tenantId,
          userId: task.userId,
          type: "system",
          title: `Completed: ${task.title}`,
          body: formatResultSummary(result),
        }).catch((e) => logger.warn("Task completion notification failed", { error: String(e) }));
      }

      await startDependentTasks(taskId).catch((e) =>
        logger.warn("Failed to start dependent tasks", { error: String(e) })
      );
    },

    async fail(error: string) {
      const [task] = await db
        .select({ userId: agentTasks.userId, title: agentTasks.title })
        .from(agentTasks)
        .where(eq(agentTasks.id, taskId))
        .limit(1);

      await db
        .update(agentTasks)
        .set({
          status: "failed",
          error,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentTasks.id, taskId));

      if (task) {
        await sendNotification({
          tenantId,
          userId: task.userId,
          type: "system",
          title: `Failed: ${task.title}`,
          body: error.slice(0, 500),
        }).catch(() => {});
      }
    },
  };
}

async function startDependentTasks(completedTaskId: string) {
  const allQueued = await db
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.status, "queued"));

  for (const task of allQueued) {
    const deps = task.dependsOn as string[] | null;
    if (!deps?.includes(completedTaskId)) continue;

    const depTasks = await db
      .select({ status: agentTasks.status })
      .from(agentTasks)
      .where(inArray(agentTasks.id, deps));

    const allDone = depTasks.every((d) => d.status === "completed");
    if (allDone) {
      await inngest.send({
        name: "agent-task/execute",
        data: { taskId: task.id, tenantId: task.tenantId },
      });
    }
  }
}

function formatResultSummary(result: unknown): string {
  if (!result || typeof result !== "object") return "Task completed.";
  const r = result as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof r.created === "number") parts.push(`${r.created} created`);
  if (typeof r.updated === "number") parts.push(`${r.updated} updated`);
  if (typeof r.skipped === "number") parts.push(`${r.skipped} skipped`);
  if (typeof r.errors === "number" && r.errors > 0) parts.push(`${r.errors} errors`);
  return parts.length > 0 ? parts.join(", ") + "." : "Task completed.";
}

export async function cancelTask(taskId: string, userId: string): Promise<boolean> {
  const [task] = await db
    .select({ userId: agentTasks.userId, status: agentTasks.status })
    .from(agentTasks)
    .where(eq(agentTasks.id, taskId))
    .limit(1);

  if (!task || task.userId !== userId) return false;
  if (!["queued", "running"].includes(task.status)) return false;

  if (task.status === "queued") {
    await db
      .update(agentTasks)
      .set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(agentTasks.id, taskId));
  } else {
    await db
      .update(agentTasks)
      .set({ status: "cancelling", updatedAt: new Date() })
      .where(eq(agentTasks.id, taskId));
  }

  return true;
}
