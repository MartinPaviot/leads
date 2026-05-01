# Long-Running Tasks Infrastructure — Design v2

## Architecture Overview

```
Chat Agent                SSE Endpoint              Inngest Worker
    │                         │                          │
    ├─ creates agent_task ────┤                          │
    ├─ sends inngest event ───┼──────────────────────────►
    ├─ returns task-progress  │                          │
    │  chat part to client    │                          │
    │                         │◄─── client connects SSE  │
    │                         │                          │
    │                         │  ┌─ process batch ───────┤
    │                         │  │  update progress ─────►
    │                         │  │  DB write ────────────►
    │                         │◄─┤  SSE event pushed     │
    │                         │  │  check cancelled? ────►
    │                         │  │  save checkpoint ─────►
    │                         │  └─ next batch ──────────┤
    │                         │                          │
    │                         │  task complete ──────────►
    │                         │◄── final SSE event       │
    │                         │  SSE connection closes   │
    │                         │                          │
    │◄── notification ────────┤                          │
```

## Data Model

### Table: `agent_tasks`

```sql
CREATE TABLE agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- Task definition
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  
  -- Status machine: queued → running → completed|failed|cancelled
  status TEXT NOT NULL DEFAULT 'queued' 
    CHECK (status IN ('queued', 'running', 'cancelling', 'completed', 'failed', 'cancelled')),
  
  -- Progress tracking
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER,
  progress_message TEXT,
  
  -- Results
  result JSONB,
  error TEXT,
  
  -- Context
  chat_thread_id TEXT,
  chat_message_id TEXT,
  
  -- Inngest coordination
  inngest_event_id TEXT,
  
  -- Checkpointing for resume
  checkpoint JSONB,
  
  -- Dependencies (DAG)
  depends_on UUID[] DEFAULT '{}',
  
  -- Timestamps
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_tasks_tenant_status ON agent_tasks(tenant_id, status);
CREATE INDEX idx_agent_tasks_user_active ON agent_tasks(user_id) WHERE status IN ('queued', 'running', 'cancelling');
CREATE INDEX idx_agent_tasks_depends ON agent_tasks USING GIN (depends_on);
```

### Task types

```typescript
type AgentTaskType =
  | "import"
  | "bulk_skill"
  | "enrichment"
  | "code_execution"
  | "analysis"
  | "migration";
```

## API Contracts

### `POST /api/tasks` — Create task
Internal, called by chat agent tools.

```typescript
// Request
{ type, title, description?, chatThreadId?, chatMessageId?, dependsOn?: string[], metadata?: Record<string, unknown> }

// Response
{ id: "uuid", status: "queued", position?: 3 } // position in queue if limited
```

### `GET /api/tasks` — List user tasks
```typescript
// Query: ?status=running&limit=20
// Response
{ 
  tasks: AgentTask[],
  running: 3,
  queued: 1,
  limit: 5
}
```

### `GET /api/tasks/[id]` — Get task details
Full task with checkpoint and result.

### `POST /api/tasks/[id]/cancel` — Cancel task
Sets status to "cancelling". The Inngest function detects this on next batch.

### `GET /api/tasks/[id]/stream` — SSE endpoint
Real-time progress events.

```
event: progress
data: {"current":450,"total":1523,"message":"Importing contacts...","percent":29}

event: progress
data: {"current":500,"total":1523,"message":"Importing contacts...","percent":32}

event: complete
data: {"status":"completed","result":{"created":1400,"updated":100,"skipped":23}}

event: error
data: {"status":"failed","error":"Rate limit exceeded on row 501"}
```

Headers:
- `Last-Event-ID` for reconnect support
- Each event has `id: {taskId}-{progressCurrent}` for dedup

## SSE Implementation

```typescript
// /api/tasks/[id]/stream/route.ts
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const taskId = params.id;
  const authCtx = await getAuthContext();
  // ... auth + ownership check

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastProgress = -1;
      
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(
          `id: ${taskId}-${Date.now()}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        ));
      };

      // Poll DB every 1 second (SSE is the transport, DB is the source of truth)
      const interval = setInterval(async () => {
        try {
          const task = await db.select().from(agentTasks)
            .where(eq(agentTasks.id, taskId)).limit(1).then(r => r[0]);
          
          if (!task) { clearInterval(interval); controller.close(); return; }
          
          if (task.progressCurrent !== lastProgress) {
            lastProgress = task.progressCurrent;
            sendEvent("progress", {
              current: task.progressCurrent,
              total: task.progressTotal,
              message: task.progressMessage,
              percent: task.progressTotal 
                ? Math.round((task.progressCurrent / task.progressTotal) * 100) 
                : null,
            });
          }
          
          if (["completed", "failed", "cancelled"].includes(task.status)) {
            sendEvent(task.status === "completed" ? "complete" : "error", {
              status: task.status,
              result: task.result,
              error: task.error,
            });
            clearInterval(interval);
            controller.close();
          }
        } catch (e) {
          clearInterval(interval);
          controller.close();
        }
      }, 1000);

      // Cleanup on client disconnect
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

## Task Manager Service

```typescript
// src/lib/tasks/task-manager.ts

interface CreateTaskParams {
  type: AgentTaskType;
  title: string;
  tenantId: string;
  userId: string;
  chatThreadId?: string;
  chatMessageId?: string;
  progressTotal?: number;
  dependsOn?: string[];
}

interface TaskContext {
  taskId: string;
  tenantId: string;
  updateProgress(current: number, message?: string): Promise<void>;
  saveCheckpoint<T>(data: T): Promise<void>;
  getCheckpoint<T>(): Promise<T | null>;
  isCancelled(): Promise<boolean>;
  complete(result: unknown): Promise<void>;
  fail(error: string): Promise<void>;
}

export async function createTask(params: CreateTaskParams): Promise<string> {
  // 1. Check concurrent limit (5 running per user)
  const running = await db.select({ count: sql<number>`count(*)::int` })
    .from(agentTasks)
    .where(and(
      eq(agentTasks.userId, params.userId),
      inArray(agentTasks.status, ["running", "cancelling"])
    ));
  
  const status = (running[0]?.count ?? 0) >= 5 ? "queued" : "queued";
  // Tasks always start as queued; the Inngest function transitions to running
  
  // 2. Check dependencies satisfied
  if (params.dependsOn?.length) {
    const deps = await db.select().from(agentTasks)
      .where(inArray(agentTasks.id, params.dependsOn));
    const unsatisfied = deps.filter(d => d.status !== "completed");
    // If deps not done, stays queued until dependency check cron runs
  }
  
  // 3. Insert task
  const [task] = await db.insert(agentTasks).values({
    tenantId: params.tenantId,
    userId: params.userId,
    type: params.type,
    title: params.title,
    status,
    progressTotal: params.progressTotal,
    chatThreadId: params.chatThreadId,
    chatMessageId: params.chatMessageId,
    dependsOn: params.dependsOn ?? [],
  }).returning();
  
  // 4. Fire Inngest event
  await inngest.send({
    name: "agent-task/execute",
    data: { taskId: task.id, tenantId: params.tenantId },
  });
  
  return task.id;
}

export function buildTaskContext(taskId: string, tenantId: string): TaskContext {
  return {
    taskId,
    tenantId,
    
    async updateProgress(current: number, message?: string) {
      await db.update(agentTasks).set({
        progressCurrent: current,
        progressMessage: message ?? undefined,
        status: "running",
        startedAt: sql`COALESCE(${agentTasks.startedAt}, now())`,
        updatedAt: new Date(),
      }).where(eq(agentTasks.id, taskId));
    },
    
    async saveCheckpoint<T>(data: T) {
      await db.update(agentTasks).set({
        checkpoint: data as any,
        updatedAt: new Date(),
      }).where(eq(agentTasks.id, taskId));
    },
    
    async getCheckpoint<T>(): Promise<T | null> {
      const [task] = await db.select({ checkpoint: agentTasks.checkpoint })
        .from(agentTasks).where(eq(agentTasks.id, taskId)).limit(1);
      return (task?.checkpoint as T) ?? null;
    },
    
    async isCancelled(): Promise<boolean> {
      const [task] = await db.select({ status: agentTasks.status })
        .from(agentTasks).where(eq(agentTasks.id, taskId)).limit(1);
      return task?.status === "cancelling";
    },
    
    async complete(result: unknown) {
      await db.update(agentTasks).set({
        status: "completed",
        result: result as any,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(agentTasks.id, taskId));
      // Trigger dependent tasks
      await checkAndStartDependents(taskId);
    },
    
    async fail(error: string) {
      await db.update(agentTasks).set({
        status: "failed",
        error,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(agentTasks.id, taskId));
    },
  };
}

async function checkAndStartDependents(completedTaskId: string) {
  // Find tasks that depend on this one
  const dependents = await db.select().from(agentTasks)
    .where(sql`${completedTaskId} = ANY(${agentTasks.dependsOn})`)
    .where(eq(agentTasks.status, "queued"));
  
  for (const dep of dependents) {
    // Check if ALL dependencies are completed
    const allDeps = await db.select().from(agentTasks)
      .where(inArray(agentTasks.id, dep.dependsOn as string[]));
    const allCompleted = allDeps.every(d => d.status === "completed");
    
    if (allCompleted) {
      await inngest.send({
        name: "agent-task/execute",
        data: { taskId: dep.id, tenantId: dep.tenantId },
      });
    }
  }
}
```

## Inngest Task Runner

```typescript
// src/inngest/agent-task-runner.ts

const agentTaskExecute = inngest.createFunction(
  { id: "agent-task-execute", retries: 3 },
  { event: "agent-task/execute" },
  async ({ event, step }) => {
    const { taskId, tenantId } = event.data;
    
    const ctx = buildTaskContext(taskId, tenantId);
    
    // Load task to get type and route to executor
    const [task] = await db.select().from(agentTasks)
      .where(eq(agentTasks.id, taskId)).limit(1);
    
    if (!task || task.status === "cancelled") return;
    
    try {
      // Route to type-specific executor
      const executor = TASK_EXECUTORS[task.type as AgentTaskType];
      if (!executor) throw new Error(`No executor for task type: ${task.type}`);
      
      await executor(task, ctx, step);
    } catch (error) {
      await ctx.fail(error instanceof Error ? error.message : String(error));
      // Send notification on failure
      await sendNotification({
        tenantId,
        userId: task.userId,
        type: "system",
        title: `Task failed: ${task.title}`,
        body: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Registry of task executors — each feature registers its own
const TASK_EXECUTORS: Record<AgentTaskType, TaskExecutor> = {} as any;

export function registerTaskExecutor(type: AgentTaskType, executor: TaskExecutor) {
  TASK_EXECUTORS[type] = executor;
}

type TaskExecutor = (
  task: typeof agentTasks.$inferSelect,
  ctx: TaskContext,
  step: any // Inngest step context
) => Promise<void>;
```

## Chat Integration

### Task progress chat part

The chat agent returns a special message part when creating a task:

```typescript
// In chat tool handler for agenticImport, bulkSkill, etc.:
return {
  type: "task-started",
  taskId: taskId,
  title: "Importing contacts.csv",
  total: 1523,
};
```

### Chat UI component

```typescript
// src/components/chat/task-progress-card.tsx
// Connects to SSE endpoint, renders inline progress card
// - Progress bar with percentage
// - X/Y counter + ETA
// - Status badge (running/completed/failed/cancelled)
// - Cancel button (calls POST /api/tasks/[id]/cancel)
// - On complete: expandable result summary
```

## Notification on Completion

```typescript
// Inside TaskContext.complete():
await sendNotification({
  tenantId,
  userId: task.userId,
  type: "system",
  title: `Completed: ${task.title}`,
  body: formatTaskResult(task.type, result),
  entityType: task.type === "import" ? undefined : undefined,
  entityId: undefined,
});

// If chat thread exists, append result message
if (task.chatThreadId) {
  await db.insert(chatMessages).values({
    threadId: task.chatThreadId,
    role: "assistant",
    content: formatTaskResultForChat(task.type, result),
    metadata: { taskId: task.id, taskType: task.type },
  });
}
```

## Failure Handling

- Inngest retries 3 times with exponential backoff
- Each retry reads checkpoint → resumes from last position
- If all retries fail: status "failed", notification sent
- Cancellation: status transitions queued/running → cancelling → cancelled
- Inngest function checks `isCancelled()` every batch and stops cleanly
- Orphaned "running" tasks (no update in 10 minutes): Inngest cron marks as failed

## Security

- Tasks scoped to tenant + user (can only see own tasks)
- Cancel only by task owner or admin
- SSE endpoint requires auth (same cookie/token as API)
- Task results respect data access permissions
- Rate limit on task creation: 20/hour per user
