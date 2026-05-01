# Long-Running Tasks Infrastructure — Requirements v2

## User Story

**As a** user of Elevay,
**I want** background agent operations (imports, bulk skills, analysis) to show real-time progress in chat, be cancellable, and resume after interruption,
**so that** I can continue working while complex operations complete reliably.

## Context

This is the foundation layer. Agentic Import, Bulk Skill Execution, and Code Execution all depend on this. Lightfield invested in "significant upgrades to chat infrastructure to allow the agent to work on long-running tasks, log its progress, and resume when able."

**Current state**: Inngest handles 40+ async functions but with NO progress tracking, NO user-facing status, NO cancellation, NO resume. Chat uses Vercel AI SDK streaming (TextStreamChatTransport) with no mechanism for post-stream updates.

## Acceptance Criteria

### AC-1: Task creation from chat agent
**GIVEN** the chat agent starts a long-running operation (e.g., "Import this CSV", "Qualify all my new leads")
**WHEN** the operation will take >5 seconds
**THEN** the agent creates an agent_task entry, triggers the Inngest function, and immediately responds in chat with a task progress card
**AND** the chat message includes a `task-progress` part that renders inline

### AC-2: Real-time progress via SSE
**GIVEN** a task is running (status: running)
**WHEN** the client connects to `/api/tasks/[id]/stream`
**THEN** it receives SSE events: `{ progress: 450, total: 1523, message: "Importing row 450/1523..." }`
**AND** the chat task-progress component updates live (no polling)
**AND** the SSE connection closes when task reaches terminal state

### AC-3: Task cancellation
**GIVEN** a task is running
**WHEN** the user clicks "Cancel" on the task card in chat OR types "cancel the import"
**THEN** the task status is set to "cancelling" in DB
**AND** the Inngest function checks status every batch (100 rows) and stops
**AND** partial work is preserved (already imported records stay)
**AND** the task card shows "Cancelled — 450/1523 processed"

### AC-4: Task resume after crash
**GIVEN** a task was interrupted (server restart, Inngest timeout)
**WHEN** Inngest retries the function (3 attempts, exponential backoff)
**THEN** the function reads the checkpoint from agent_tasks (last processed offset + partial results)
**AND** resumes from last checkpoint, not from beginning
**AND** the user sees "Resumed from row 450" in the progress card

### AC-5: Task completion notification
**GIVEN** a task completes (success or failure)
**WHEN** the user is anywhere in the app
**THEN** they receive an in-app notification via the existing notification system
**AND** the chat thread where the task was started shows the final result message
**AND** the task card transitions to completed state with summary

### AC-6: Task list
**GIVEN** the user has multiple tasks (running, queued, completed)
**WHEN** they ask "What tasks are running?" in chat OR check the notification panel
**THEN** the agent lists all active tasks with status, progress, and ETA
**AND** completed tasks from the last 24h are included

### AC-7: Concurrent task limits
**GIVEN** a user already has 5 running tasks
**WHEN** they try to start another
**THEN** the agent explains the limit and shows the queue: "You have 5 tasks running. The next one will start when one completes."
**AND** the task is created with status "queued"
**AND** it auto-starts when a slot opens

### AC-8: Task dependencies (DAG)
**GIVEN** a multi-file import creates 3 tasks: import companies → import contacts → import deals
**WHEN** the first task completes
**THEN** the second task auto-starts
**AND** the third waits for the second
**AND** the user sees all 3 tasks in the chat with dependency arrows

## Edge Cases

- SSE connection drops (user closes tab) → reconnect with Last-Event-ID header, resume from last event
- Task takes >10 minutes (Inngest step timeout) → split into substeps, each checkpointed
- All 3 retries fail → task status "failed", notification with error, option to retry manually
- Task in "cancelling" but Inngest function already completed → treat as completed
- User deletes chat thread with active task → task continues, notification sent
- Concurrent task limit hit during dependency chain → dependent tasks exempt from limit
