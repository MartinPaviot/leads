# Code Execution Sandbox — Design

## System Fit

Adds a code execution capability to the chat agent via a new `executeCode` tool. Code runs in a V8 isolate (via `isolated-vm` package) with a pre-injected CRM data access layer. The agent writes JavaScript (not Python — we're a Node.js stack), executes it, evaluates results, and iterates.

## Architecture

### Why JavaScript, not Python
- Elevay runs on Node.js — JavaScript isolates are native
- `isolated-vm` provides V8 sandboxing with no external dependencies
- No need for a Python runtime on the server
- TypeScript/JavaScript is the team's primary language
- The CRM data access layer is naturally JavaScript

### Sandbox via `isolated-vm`
- V8 isolate with 256MB memory limit
- 30-second execution timeout
- No filesystem, network, or process access
- Pre-injected `crm` API object for data access
- Pre-injected `console.log` that captures output

## Data Model

### New table: `code_executions`

```sql
CREATE TABLE code_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  chat_thread_id TEXT,
  code TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'read' CHECK (mode IN ('read', 'write')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'timeout', 'approved', 'rejected')),
  output JSONB,
  error TEXT,
  execution_time_ms INTEGER,
  iteration INTEGER NOT NULL DEFAULT 1,
  parent_execution_id UUID REFERENCES code_executions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_code_exec_tenant ON code_executions(tenant_id);
CREATE INDEX idx_code_exec_thread ON code_executions(chat_thread_id);
```

## API Contracts

### `POST /api/code/execute`
Execute code in sandbox. Internal, called by chat agent only.

Body:
```json
{
  "code": "const deals = await crm.deals.list({ stage: 'won' }); ...",
  "mode": "read",
  "chatThreadId": "thread_123"
}
```

Response:
```json
{
  "executionId": "uuid",
  "status": "completed",
  "output": { "type": "table", "data": [...], "summary": "..." },
  "executionTimeMs": 1234,
  "logs": ["Fetched 150 deals", "Grouped by company size"]
}
```

### `POST /api/code/execute/[id]/approve`
Approve a write-mode execution.

## Data Flow

```
User asks complex analytical question in chat
  → Agent determines code execution is needed
  → Agent writes JavaScript code
  → Calls executeCode tool
  → POST /api/code/execute
    → Create code_executions entry (status: running)
    → Create V8 isolate via isolated-vm
    → Inject CRM data access layer
    → Execute code with timeout
    → Capture output + logs
    → Update code_executions (status: completed/failed)
    → Return output to agent
  → Agent evaluates output
  → If unsatisfactory: rewrite code, re-execute (iteration++)
  → If satisfactory: present formatted results to user
  → If write mode: show preview, wait for approval, then execute writes

CRM Data Access Layer (injected into sandbox):
  crm.contacts.list(filters?) → Contact[]
  crm.contacts.get(id) → Contact
  crm.accounts.list(filters?) → Account[]
  crm.accounts.get(id) → Account
  crm.deals.list(filters?) → Deal[]
  crm.deals.get(id) → Deal
  crm.activities.list(entityType, entityId) → Activity[]
  crm.notes.list(entityType, entityId) → Note[]

All methods are async, paginated (max 1000), tenant-scoped.
In write mode, additional methods are available:
  crm.contacts.update(id, data) → Contact
  crm.accounts.update(id, data) → Account
  crm.deals.update(id, data) → Deal
```

## Sandbox Implementation

```typescript
import ivm from "isolated-vm";

async function executeInSandbox(
  code: string,
  tenantId: string,
  mode: "read" | "write"
): Promise<SandboxResult> {
  const isolate = new ivm.Isolate({ memoryLimit: 256 });
  const context = await isolate.createContext();

  // Inject CRM API as host functions
  const jail = context.global;
  await jail.set("_crmCall", new ivm.Reference(
    async (method: string, args: string) => {
      // Execute CRM query on host side, return JSON
      return JSON.stringify(await executeCrmMethod(method, JSON.parse(args), tenantId, mode));
    }
  ));

  // Inject wrapper that makes CRM calls async
  const wrapper = `
    const crm = {
      contacts: {
        list: (f) => _crmCall.apply(null, ["contacts.list", JSON.stringify(f || {})]).then(JSON.parse),
        get: (id) => _crmCall.apply(null, ["contacts.get", JSON.stringify({id})]).then(JSON.parse),
      },
      accounts: {
        list: (f) => _crmCall.apply(null, ["accounts.list", JSON.stringify(f || {})]).then(JSON.parse),
        get: (id) => _crmCall.apply(null, ["accounts.get", JSON.stringify({id})]).then(JSON.parse),
      },
      deals: {
        list: (f) => _crmCall.apply(null, ["deals.list", JSON.stringify(f || {})]).then(JSON.parse),
        get: (id) => _crmCall.apply(null, ["deals.get", JSON.stringify({id})]).then(JSON.parse),
      },
      // ... activities, notes
    };
    const logs = [];
    const console = { log: (...args) => logs.push(args.map(String).join(" ")) };
  `;

  const script = await isolate.compileScript(wrapper + "\n" + code);
  const result = await script.run(context, { timeout: 30000 });

  isolate.dispose();
  return { output: result, logs };
}
```

## Chat Tool Definition

```typescript
{
  name: "executeCode",
  description: "Write and execute JavaScript code to analyze CRM data at scale. Use when the user's question requires data processing, aggregation, or analysis beyond simple queries.",
  parameters: {
    code: "string - JavaScript code to execute",
    mode: "'read' | 'write' - read for analysis, write requires user approval",
    description: "string - what the code does (shown to user)"
  }
}
```

## Failure Handling

- Timeout (30s) → kill isolate, return timeout error, agent can retry with optimized code
- Memory limit → kill isolate, return OOM error
- Syntax error → return error message, agent rewrites
- CRM API error inside sandbox → propagate as exception, agent handles
- Max 5 iterations per question → after 5 failures, agent explains limitation

## Security

- V8 isolate: complete memory/CPU isolation from host
- No `require`, `import`, `eval`, `Function` constructor in sandbox
- CRM API calls go through host bridge — tenant isolation enforced on host side
- Write mode requires explicit user approval in chat
- Code is logged for audit (code_executions table)
- No access to env vars, secrets, or filesystem
- Rate limit: 20 executions per hour per user
