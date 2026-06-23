# RECONCILE.md — Spec 03 Orchestration and Gates (T0)

> Read-only reconciliation, 5-finder audit, cited `file:line`. Inngest v4.5.1 is used pervasively (113 `createFunction`, 351 `step.run`), but there is **no module/gate/run abstraction** — every function is hand-written and HITL is a defer+cron-poll pattern, not a blocking gate.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Module = Inngest step fn, per-step retry + idempotency | **partial** | `step.run` memoization + `retries:N` everywhere; no `defineModule` harness; native `idempotency:` used 0× (hand-rolled DB guards) |
| AC2 | `createGate(runId,kind,payload)` persists `approval_gate`; workflow blocks on `waitForEvent` | **partial** | No `approval_gate`, no `createGate`, **0 uses of `waitForEvent`**; defer pattern records `agent_actions` + returns early + cron-polls |
| AC3 | reject→halt, edit→resume-edited, approve→unchanged | **partial** | reject/approve exist (agent-actions); edit→resume only for `sequence_drafts` (email-specific); not unified, not run-resume |
| AC4 | Retry w/ backoff to bounded limit, preserve partial results | **partial** | Bounded `retries` + step memoization done; backoff is implicit (platform default); no `NonRetriableError`/`RetryAfterError` in app code |
| AC5 | `workflow_run` with `current_module` + `state` | **partial** | No `workflow_run` table; state fragmented across `agent_tasks.checkpoint`, `tenants.settings.runCount` |

## AC1 — module harness — `partial`
- Building blocks present: `inngest/client.ts:1-3` (bare client), `step.run` memoization (`outbound-smtp-send.ts:27-49` `send-${id}`), `retries:N` on ~113 functions (`agent-task-runner.ts:21`, `agent-reactor.ts:90-92`). Nearest registry: `TASK_EXECUTORS` Map (`agent-task-runner.ts:15-23`).
- Missing: no `defineModule`/`createModule` (grep = 0); native `idempotency:` config 0× (idempotency hand-rolled via DB select-then-insert).
- **Delta:** thin `defineModule(name, steps)` wrapping `createFunction` with house defaults (retries + onFailure + tenant concurrency) + a deterministic idempotency key.

## AC2 — gate primitive — `partial`
- **0 uses of `step.waitForEvent`** anywhere. No `approval_gate` table, no `createGate`. The defer pattern: `recordAgentAction({awaitingApproval:true})` writes an `agent_actions` row (`agent-actions.ts:42-69`, `schema/agent.ts:59-72`), the function **returns early** (`signal-to-sequence.ts:242-278` → `{skipped, deferred}`), and a 1-min cron (`agent-action-dispatcher.ts:30-55`) resumes once `approveAgentAction` stamps the time (`agent-actions.ts:158-194`). Keyed by tenant+actionType, **not runId**.
- **Delta:** `approval_gate` table keyed by `runId` + `createGate(runId,kind,payload)`; replace defer+poll with `step.waitForEvent('gate.decided', {match:'data.gateId', timeout})` so the same run durably blocks.

## AC3 — decision semantics — `partial`
- reject→halt + approve→unchanged exist on the agent-actions gate (`agent-actions.ts:158-208` approve, `90-150` reverse) but **no edit path** (routes are only `approve`+`reverse`; feed UI shows Approve/Dismiss only — `agent-feed.tsx:531-546`). The dispatcher runs the **stored payload unchanged** (`agent-action-dispatcher.ts:63-86`).
- edit→resume-with-edited-payload exists **only** for `sequence_drafts` (`drafts/[id]/edit/route.ts` mutates content, stays `pending_approval`; `reject/route.ts:86-133` halt+pause) — email-specific, not reusable.
- **Delta:** unify on the gate primitive; add `editGate(gateId, editedPayload)` so approve dispatches the edited payload (mirrors the draft-edit version+guard pattern).

## AC4 — retry/backoff — `partial`
- Bounded retries (`retries:0-3` on ~120 functions) + partial-results via named `step.run` memoization (`email-send-worker.ts:143-291`, `agent-action-dispatcher.ts:64-75` atomic DB claim) + re-throw-to-retry + `onFailure` after exhaustion (`agent-task-runner.ts:21-46,99-106`) — all satisfied.
- Gap: backoff is the Inngest **platform default** (engine.js exponential+jitter), never asserted in app code; **0 uses** of `NonRetriableError`/`RetryAfterError` → no permanent-vs-transient classification.
- **Delta:** classify errors (`NonRetriableError` for bad input/missing tenant; default/`RetryAfterError` for transient) in the module harness.

## AC5 — workflow_run — `partial` (effectively missing the canonical record)
- No `workflow_run`/`run_state` table, no `current_module` column (migrations 0000-0084). State is fragmented: `agent_tasks` (`schema/agent.ts:289-319`: status + `checkpoint` jsonb + progress, no module pointer), `agent_work_items` (per-entity), `workflow-engine.ts` (stateless — defs in `tenants.settings` JSON, only `runCount`/`lastRunAt` persisted, `36-43`/`264-278`).
- **Delta:** `workflow_runs` table (id, tenantId, kind, current_module, state ∈ {running,blocked,halted,completed,failed}, payload, inngestEventId, timestamps); the orchestrator creates one row per run and updates current_module/state at each boundary.

## Reuse inventory
- Inngest client + `step.run` + `retries` + `onFailure` — the harness wraps these.
- `agent-actions.ts` approve/reverse + the `sequence_drafts` edit/reject flow — the decision-semantics seed (generalize into the gate).
- `agent-action-dispatcher.ts` atomic DB claim — the idempotent-resume pattern.

## Decisions (taken)
1. **Build the abstraction layer** (`orchestration/*`): `defineModule`, `createGate`/`decideGate` over `approval_gate`, `workflow_run` state — wrapping existing Inngest, not replacing any function.
2. **Gate uses `step.waitForEvent`** (durable block/resume) over the defer+cron pattern; the gate primitive is keyed by `runId`.
3. Make the gate-decision resolution (reject/edit/approve → halt/resume(payload)) a **pure, unit-testable** function; DB + Inngest wiring stays thin (gated integration for the live path).
4. Keep the existing defer pattern working (don't rip out agent-actions); new gated modules use the new primitive.

**Schema-changing** (`approval_gate` + `workflow_run`, migration 0085) → merge parks pending prod migration. Builds off main; independent of parked specs.
