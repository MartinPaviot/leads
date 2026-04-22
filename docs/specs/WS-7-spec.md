# WS-7 — Reversibility / Undo layer

**Status:** Shipped — PR #22 (`64e06a8`)

## Problem statement

Autonomous agents that send emails and modify data without an undo
mechanism erode user trust. Users need the ability to reverse agent
actions within a time window, and the system needs to learn from
reversals (negative trust signal).

## Solution

An `agent_actions` table records every autonomous action with a
reversibility window. A reverse endpoint flips the action status and
feeds a negative trust event into the WS-1 trust score system.

## Architecture

### Database — migration 0026

Table `agent_actions`:
- `id` (text PK)
- `tenant_id`, `user_id` (FK refs)
- `action_type` (text) — e.g. "email_send", "data_write"
- `payload` (jsonb) — the full action payload for replay/audit
- `scheduled_execution_at` — for delayed sends (grace window)
- `executed_at`, `reversed_at`, `reversed_by_user_id`
- `reversible_until` — hard deadline for undo eligibility
- `status` — enum: `scheduled`, `executed`, `reversed`, `failed`
- `error_message` — captured on failure

Indexes: `(tenant_id, created_at DESC)`, `(scheduled_execution_at) WHERE status='scheduled'`, `(status)`.

### Library — `lib/agent-actions.ts`

**Exports:**
- `recordAgentAction(input)` — inserts row, computes grace/reversible
  windows. Default: 60s grace for sends, 24h reversibility for writes.
- `reverseAgentAction({ actionId, reversedByUserId, tenantId })` —
  flips to 'reversed', records `undone_after_send` trust event (-0.05
  delta via `recordAutonomyEvent`).
- `markAgentActionExecuted(actionId)` — flips scheduled → executed
- `markAgentActionFailed(actionId, errorMessage)` — captures error
- `claimDueActions(limit)` — returns scheduled rows past their execution
  time with no reversal (for Inngest dispatcher cron)
- `getRecentActions(tenantId, limit)` — history query for UI

### API — `POST /api/agent-actions/[id]/reverse`

Auth-gated. Returns:
- `200 { status: "reversed", previousStatus }` on success
- `404 { status: "not-found" }` if action doesn't exist
- `409 { status: "too-late", reason }` if window expired or already reversed

### Trust integration

Every reversal writes a trust event with `eventType: "undone_after_send"`
and `scoreDelta: -0.05`. This feeds the WS-1 progressive autonomy engine:
frequent reversals lower the trust score, which gates nudge surfacing.

## Acceptance criteria

- GIVEN an agent action recorded with a 60s grace window
- WHEN the user calls reverse within 60s
- THEN the action is marked reversed and a -0.05 trust event is logged
- AND the action is NOT executed by the dispatcher

- GIVEN an executed action with a 24h reversibility window
- WHEN the user calls reverse after 24h
- THEN the endpoint returns 409 "too-late"

## Follow-ups

- Inngest dispatcher cron job (`agent-action-dispatcher`)
- `<AgentActionToast>` — real-time toast with undo CTA
- Agent action history page in settings
