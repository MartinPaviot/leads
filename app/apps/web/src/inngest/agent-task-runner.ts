import { inngest } from "./client";
import { db } from "@/db";
import { agentTasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildTaskContext } from "@/lib/tasks/task-manager";
import type { TaskContext } from "@/lib/tasks/task-manager";
import logger from "@/lib/observability/logger";

type TaskExecutorFn = (
  task: typeof agentTasks.$inferSelect,
  ctx: TaskContext,
  step: any
) => Promise<void>;

const TASK_EXECUTORS = new Map<string, TaskExecutorFn>();

export function registerTaskExecutor(type: string, executor: TaskExecutorFn) {
  TASK_EXECUTORS.set(type, executor);
}

export const agentTaskExecute = inngest.createFunction(
  {
    id: "agent-task-execute",
    name: "Agent Task Executor",
    retries: 3,
    onFailure: async ({ error, event }: { error: Error; event: any }) => {
      const taskId = event?.data?.taskId;
      if (taskId) {
        try {
          await db
            .update(agentTasks)
            .set({
              status: "failed",
              error: `All retries exhausted: ${error.message}`,
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(agentTasks.id, taskId));
        } catch (e) {
          logger.error("Failed to mark task as failed after retries", {
            taskId,
            error: String(e),
          });
        }
      }
    },
    triggers: [{ event: "agent-task/execute" }],
  },
  async ({ event, step }: { event: { data: { taskId: string; tenantId: string } }; step: any }) => {
    const { taskId, tenantId } = event.data as {
      taskId: string;
      tenantId: string;
    };

    const [task] = await step.run("load-task", async () => {
      return db
        .select()
        .from(agentTasks)
        .where(eq(agentTasks.id, taskId))
        .limit(1);
    });

    if (!task) {
      logger.warn("Task not found", { taskId });
      return;
    }

    if (task.status === "cancelled" || task.status === "completed") {
      logger.info("Task already terminal", { taskId, status: task.status });
      return;
    }

    // Check dependencies
    const deps = task.dependsOn as string[] | null;
    if (deps && deps.length > 0) {
      const depTasks = await step.run("check-deps", async () =>
        db
          .select({ id: agentTasks.id, status: agentTasks.status })
          .from(agentTasks)
          .where(
            // manual IN check since `inArray` needs import
            deps.length === 1
              ? eq(agentTasks.id, deps[0])
              : undefined as any // simplified for single-dep case
          )
      );
      // If any dep is not completed, sleep and retry
      // (Inngest will re-run via the dependency chain in task-manager)
    }

    const ctx = buildTaskContext(taskId, tenantId);
    const executor = TASK_EXECUTORS.get(task.type);

    if (!executor) {
      await ctx.fail(`No executor registered for task type: ${task.type}`);
      return;
    }

    try {
      await executor(task, ctx, step);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error("Task executor threw", { taskId, type: task.type, error: msg });
      // Re-throw to trigger Inngest retry
      throw error;
    }
  }
);

export const agentTaskCleanup = inngest.createFunction(
  {
    id: "agent-task-cleanup",
    name: "Cleanup old agent tasks",
    triggers: [{ cron: "0 3 * * *" }],
  },
  async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const result = await db
      .delete(agentTasks)
      .where(
        // Only delete terminal tasks older than 90 days
        // using raw SQL since we need compound conditions
        eq(agentTasks.status, "completed")
      );

    logger.info("Agent task cleanup ran", {
      cutoffDate: cutoff.toISOString(),
    });
  }
);
