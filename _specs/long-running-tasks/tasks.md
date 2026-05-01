# Long-Running Tasks Infrastructure — Tasks

## Task 1: Database migration for agent_tasks table
- Add `agent_tasks` table to Drizzle schema
- Create migration
- **Verify**: table exists with all columns and indexes
- **Test**: schema validation test

## Task 2: Task manager service
- Create `src/lib/tasks/task-manager.ts`
- `createAgentTask()`: insert row, trigger Inngest, return task ID
- `updateProgress()`: update progress_current
- `saveCheckpoint()`: update checkpoint JSONB
- `getCheckpoint()`: read checkpoint
- `isCancelled()`: check status === 'cancelled'
- `completeTask()`: set status, result, completed_at
- `failTask()`: set status, error
- **Verify**: create task, update progress, complete
- **Test**: all task lifecycle methods

## Task 3: Tasks API endpoints
- Create `src/app/api/tasks/route.ts` (GET: list user tasks)
- Create `src/app/api/tasks/[id]/route.ts` (GET: task details)
- Create `src/app/api/tasks/[id]/cancel/route.ts` (POST: cancel)
- Pagination on list, status filtering
- **Verify**: list tasks, get details, cancel a running task
- **Test**: API endpoint tests, permission tests

## Task 4: Inngest task wrapper
- Create `src/inngest/agent-task-runner.ts`
- Generic Inngest function that wraps task execution
- Reads checkpoint on start (for resume)
- Provides TaskContext to executor
- Handles cancellation check per batch
- Retries on failure (3 attempts)
- **Verify**: trigger task via Inngest, see it execute with progress
- **Test**: execution test, retry test, cancellation test

## Task 5: Chat progress component
- Create `src/components/chat/task-progress.tsx`
- Progress bar with percentage and X/Y counter
- Elapsed time display
- Cancel button
- SWR polling every 5 seconds
- Terminal state rendering (success summary or error)
- **Verify**: see progress bar update in real-time during task
- **Test**: component rendering tests, polling behavior tests

## Task 6: Notification on completion
- On task complete/fail: insert notification via existing system
- Append result message to chat thread if chatThreadId exists
- **Verify**: complete a task, see notification appear
- **Test**: notification creation test

## Task 7: Concurrent limits and queue
- Enforce max 5 concurrent tasks per user
- If at limit: return error with "X tasks running, try again later"
- Display running task count in UI
- **Verify**: start 6 tasks, get rejection on #6
- **Test**: concurrency limit test

## Task 8: Integration with existing Inngest functions
- Migrate existing long-running Inngest functions to use task manager:
  - enrichment functions → wrap with createAgentTask
  - email sync → wrap with createAgentTask (if user-initiated)
- Update agentic import spec to use createAgentTask
- **Verify**: existing enrichment shows progress in UI
- **Test**: migration compatibility test
