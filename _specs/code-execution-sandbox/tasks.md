# Code Execution Sandbox — Tasks

## Task 1: Install isolated-vm and database migration
- `npm install isolated-vm` in web app
- Add `code_executions` table to Drizzle schema
- Create migration
- **Verify**: `isolated-vm` imports successfully, table exists
- **Test**: basic isolate creation test (hello world)

## Task 2: Sandbox executor
- Create `src/lib/sandbox/executor.ts`
- V8 isolate creation with 256MB limit, 30s timeout
- Inject CRM data access layer as host functions
- Inject console.log capture
- Execute code, return output + logs
- Clean disposal of isolate after execution
- **Verify**: execute `const x = 1 + 1; x` → returns 2
- **Test**: basic execution test, timeout test, memory limit test, console capture test

## Task 3: CRM data access layer
- Create `src/lib/sandbox/crm-bridge.ts`
- Implement host-side CRM methods: contacts/accounts/deals/activities/notes list/get
- Tenant isolation on every call
- Pagination (max 1000 per call)
- Read mode: only list/get methods
- Write mode: add update methods
- **Verify**: execute code that calls `crm.deals.list()` in sandbox, get real data
- **Test**: data access tests, tenant isolation test, pagination test

## Task 4: Code execution API endpoint
- Create `src/app/api/code/execute/route.ts`
- Accept code + mode + chatThreadId
- Validate: auth, rate limit (20/hour), concurrent limit (3)
- Execute via sandbox
- Save to code_executions table
- Return result
- **Verify**: POST code via API, get execution result
- **Test**: API endpoint test, rate limit test, auth test

## Task 5: Write mode approval flow
- Create `src/app/api/code/execute/[id]/approve/route.ts`
- When mode=write: save code_execution with status "pending_approval"
- On approve: re-execute with write methods enabled
- On reject: mark as rejected
- Generate diff preview: show which records would be affected
- **Verify**: submit write code, see preview, approve, verify changes
- **Test**: approval flow test, rejection test, preview accuracy test

## Task 6: Chat tool integration
- Add `executeCode` tool to chat tools registry in tool-router
- Agent system prompt: instructions for when to use code execution vs queries
- Code output formatting: tables, metrics, reports in chat
- Collapsible code blocks in chat UI
- Iteration support: agent can re-execute with modified code
- **Verify**: ask analytical question in chat, agent writes and executes code
- **Test**: tool invocation test, output formatting test

## Task 7: Chat UI for code execution
- Code block rendering in chat messages (syntax highlighted, collapsible)
- Execution status indicator (running/completed/failed)
- Output rendering: tables, metrics, error messages
- Write mode: approval buttons (Approve/Reject) inline in chat
- **Verify**: see code + results rendered properly in chat
- **Test**: component rendering tests

## Task 8: Execution history and cleanup
- Execution history viewable in chat thread (all code runs for that thread)
- Auto-cleanup: delete code_executions older than 30 days
- Execution metrics: track usage per user for billing/limits
- **Verify**: view execution history in a thread
- **Test**: cleanup cron test
