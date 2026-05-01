# Code Execution Sandbox — Requirements

## User Story

**As a** founder using Elevay,
**I want** the AI agent to write and execute code (JavaScript/Python) in a sandbox to analyze my CRM data at scale,
**so that** I can get custom pipeline analyses, visualizations, and reports that go beyond pre-built queries.

## Context

Lightfield gives its agent a code execution tool: the agent plans an approach, writes a Python script, runs it in a sandbox, evaluates results, and iterates. This enables processing thousands of records for custom scoring, sentiment analysis, and board-ready reports. Elevay currently has no code execution — all automation is JSON-defined or pre-built skill handlers.

## Acceptance Criteria

### AC-1: Agent writes and executes code
**GIVEN** the user asks "Analyze win rates by company size over the last 6 months"
**WHEN** the agent determines this requires data processing beyond simple queries
**THEN** it writes a JavaScript script that queries the CRM data, processes it, and generates results
**AND** executes the script in a sandboxed environment
**AND** presents the results to the user in chat

### AC-2: Iterative execution
**GIVEN** the agent's first script produces incomplete or incorrect results
**WHEN** it evaluates the output
**THEN** it can modify the script and re-execute (up to 5 iterations)
**AND** presents the final refined result

### AC-3: Sandbox isolation
**GIVEN** the agent executes code
**WHEN** the code runs
**THEN** it cannot access the filesystem, network (except CRM API), or environment variables
**AND** it has a 30-second execution timeout
**AND** it has a 256MB memory limit
**AND** it cannot modify CRM data (read-only by default)

### AC-4: Data access via CRM API
**GIVEN** a script needs CRM data
**WHEN** it runs in the sandbox
**THEN** it has access to a pre-injected `crm` object with methods: `crm.contacts.list()`, `crm.accounts.list()`, `crm.deals.list()`, `crm.activities.list()`
**AND** all methods respect tenant isolation
**AND** results are paginated (max 1000 per call)

### AC-5: Structured output with visualizations
**GIVEN** the script produces results
**WHEN** the agent presents them
**THEN** it can render:
  - Tables (structured data)
  - Key metrics (single numbers with labels)
  - Markdown reports
  - JSON data for further processing

### AC-6: Execution history
**GIVEN** the agent has executed code in a chat session
**WHEN** the user scrolls through the chat
**THEN** they can see the code that was executed (collapsible) and the output
**AND** failed executions show the error message

### AC-7: Write mode (with approval)
**GIVEN** the user asks "Update all stale deals to Lost"
**WHEN** the agent writes code that modifies CRM data
**THEN** it shows the code with a diff preview of affected records
**AND** requires explicit user approval before executing the write operation

## Edge Cases

- Infinite loop → 30-second timeout kills execution
- Memory exhaustion → 256MB limit kills execution
- Script syntax error → agent sees error, rewrites, retries
- No data returned → agent reports "No results found" with explanation
- Very large result set → truncate to first 100 rows with total count
- User asks to execute arbitrary code → agent only executes code it wrote, never user-provided raw code
- Concurrent executions → max 3 per user, queue additional
