# CLE-11 — Extend audit `tool_call_events` + undo to PAR actions + outbound (undo window) — Requirements

> Constitution: `_specs/chat-live-executor/README.md` (§1 doctrine: "un seul plan de contrôle … un journal/undo (`tool_call_events`)"; §3.2 `PageAction.reversible`/`PageActionResult.undo`; §3.5 the result envelope; §4.5 "Étendre `tool_call_events` à TOUT (headless + PAR), et implémenter le pattern « fenêtre d'undo » pour le sortant : envoi programmé + délai annulable = unsend de facto").
> Audit: `_research/chat-task-executor-audit-2026-06-16.md` — §1.3 "Audit + undo (CHAT-04) : LIVRÉ et câblé pour create/update … **Trou** : aucune action sortante/irréversible (envoi email, enroll, launch, call, enrich) n'est dans le système d'undo" + §4.5 "fenêtre d'undo".
> Depends on: **CLE-04** (`invokePageAction` exists, emits `invokeActionDirective`; `decideAction` reachable) and **CLE-10** (the real `decideAction` body — outbound under `auto-high-confidence` returns `confirm` today, but `decideAction` is the SSOT and `execute` for outbound is the case this feature must make safe). This spec adds **no** new approval vocabulary and does **not** re-open `decideAction`'s decision logic (that is CLE-10).

Hook rules applied to this spec: **Applying rules: none returned by hook** (no `[Coding Rules from Rippletide]` context was injected for this request). The spec still follows the repo conventions in CLAUDE.md (English UI prose, no emoji, tenant-scoped reads, 100% test coverage, migration note for any DB change, commit trailer).

---

## 1. User story

**As** a founder using the chat as a live task executor,
**I want** every action the agent takes — the ones it runs live on my page (filters, stage moves, bulk ops) **and** the ones that leave my workspace (an email send, a sequence step, a meeting invite) — to be recorded in one audit log and undoable,
**so that** "undo that" reverses the last reversible change, and an accidental or wrong outbound is **caught before it actually leaves** (a real unsend window), without ever silently dropping a send or sending it twice.

Today (`tool-call-log.ts` + `tools/undo.ts`, audit §1.3): the audit log + `undoLastAction` cover ~10 **reversible CRM types** (create/update/delete/bulk_update/merge_contacts/delete_sequence_step) for **headless** tools only. Two gaps:
1. **PAR actions** invoked via `invokePageAction` (CLE-04) are not logged and not undoable — even when the page declared `reversible:true` and returned a `PageActionResult.undo()`.
2. **Outbound / irreversible** actions (email send, sequence step, meeting invite) are never in the undo system: once dispatched they are gone.

CLE-11 closes both: (a) log every mutating PAR action with a reversible snapshot when the action declared `reversible:true`; (b) teach `reverseToolCall`/`undoLastAction` to reverse a PAR action; (c) put a **cancellable hold** between "decideAction says execute an outbound" and the bytes leaving, so the undo window is a de-facto unsend.

---

## 2. EARS acceptance criteria

EARS = Easy Approach to Requirements Syntax (WHEN/IF … THE SYSTEM SHALL …). Each maps to a test in `tasks.md`.

### Logging PAR actions (scope a)

- **AC-1** — WHEN `invokePageAction` emits an `invokeAction` directive for an action whose manifest entry has `mutating:true`, THE SYSTEM SHALL record exactly one `tool_call_events` row for that invocation, with `toolName = "invokePageAction:<actionId>"`, `args = { actionId, params }`, `surfaceType` from the request, and `status = "executed"` only after the client reports the run succeeded.
- **AC-2** — WHEN that PAR action's manifest entry has `mutating:false` (a pure read: filter, view toggle), THE SYSTEM SHALL NOT record a `tool_call_events` row (reads are not audited, matching the headless rule — no read tool calls `logToolCall` today).
- **AC-3** — WHEN a logged PAR action's `PageActionResult` carried a serializable `undo` descriptor (an inverse `actionId` + inverse `params`, see §3.2 of design), THE SYSTEM SHALL store a `snapshot` of `type:"page_action"` capturing that inverse so the action is later reversible; IF the action declared `reversible:true` but returned **no** undo descriptor, THE SYSTEM SHALL store the row with `snapshot = null` and treat the action as **not reversible** (AC-12).
- **AC-4** — WHEN the client reports the PAR action **failed** (`ok:false` in the envelope, README §3.5), THE SYSTEM SHALL record the row with `status = "failed"` and `errorMessage` set, and SHALL NOT make it appear as a reversible action to `undoLastAction` (a failed action changed nothing to undo).

### Reversing a PAR action (scope b)

- **AC-5** — WHEN the user says "undo that" and the most recent reversible event is a `type:"page_action"` snapshot, THE SYSTEM SHALL reverse it by re-emitting an `invokeAction` directive (CLE-03) for the stored **inverse** `actionId`/`params`, so the inverse runs **on the live page** the same way the original did, and SHALL mark the original event `reverted` only after the inverse is dispatched (design §3.3 explains why dispatch, not completion, is the server-observable boundary, and how completion is reconciled).
- **AC-6** — WHEN a PAR action's effect is a pure server-owned DB row (the page declared the action but the underlying mutation is a plain CRM create/update/delete the server already owns), THE SYSTEM SHALL be allowed to record a server-reversible snapshot (`type:"create"|"update"|"delete"`, reusing the existing path) instead of `page_action`, and `reverseToolCall` SHALL reverse it server-side with no client round-trip (design §3.2 "two reversal modes").
- **AC-7** — IF the most recent action is a PAR action that is **not** reversible (read-only, or `reversible:false`, or no undo descriptor), THE SYSTEM SHALL skip it when finding "the last reversible call" and reverse the next reversible one instead (the existing `getLastReversibleCall` "first row with a snapshot" rule, extended).

### Outbound undo window / de-facto unsend (scope c)

- **AC-8** — WHEN `decideAction` returns disposition `"execute"` for an **outbound** action (email send, sequence step, meeting invite) AND the tenant's grace window > 0, THE SYSTEM SHALL NOT dispatch the send immediately; it SHALL enqueue it with a cancellable hold (`status:"held"`, `holdUntil = now + grace`), and SHALL record a `tool_call_events` row of `snapshot type:"outbound_send"` referencing the held row.
- **AC-9** — WHEN the hold window elapses with no cancellation, THE SYSTEM SHALL release the held send into the normal queue so it is sent by the existing path, applying **all** existing guardrails at release time (test-mode allowlist, opt-out suppression, plan limit, mailbox window/daily cap) — the hold composes with, never replaces, those checks (design §4).
- **AC-10** — WHEN the user undoes (via `undoLastAction` or a UI "Undo" affordance) **before** `holdUntil`, THE SYSTEM SHALL cancel the send (flip `held → canceled`) so nothing leaves the workspace, mark the `tool_call_events` row `reverted`, and report the cancellation; the recipient SHALL receive nothing.
- **AC-11** — WHEN the user attempts to undo an outbound action **after** the window has elapsed (the send was already released/sent), THE SYSTEM SHALL refuse with a clear, honest message ("This email was already sent <time> and can't be unsent") and SHALL NOT mark it reverted — an already-sent email is **not reversible** (audit's "outbound/irréversible" reality).
- **AC-12** — WHEN the tenant grace window is `0` (the default for backwards-safety, see §5), THE SYSTEM SHALL behave exactly as today: outbound actions whose disposition is `"execute"` dispatch immediately with no hold, and outbound under the current SSOT (`decideAction` returns `confirm`, CLE-10) still card-confirms — i.e. CLE-11 changes **nothing** until a tenant opts into a non-zero window.
- **AC-13** — THE SYSTEM SHALL make the grace window **tenant-configurable** (a single integer of seconds, stored on tenant settings), with a safe default of `0` and a recommended range surfaced in copy (e.g. 30–60s); an out-of-range or malformed value SHALL coerce to the default (fail-safe).

### Cross-cutting invariants

- **AC-14** — THE SYSTEM SHALL never lose a send silently: every held send either releases (sent) or is explicitly canceled by an undo, and a crash/restart of the worker SHALL re-evaluate held rows from their `holdUntil` (the cron is the durable clock, not an in-memory timer) — design §4 + §6.
- **AC-15** — THE SYSTEM SHALL never double-send: releasing a held row SHALL be an atomic status transition (`held → queued`) guarded so two concurrent cron passes cannot both release the same row (design §6, mirroring the existing `mark-sending` claim).
- **AC-16** — THE SYSTEM SHALL keep all reversal scoped to the acting `(tenantId, userId)` exactly as `reverseToolCall`/`getLastReversibleCall` do today (no cross-tenant or cross-user undo).

---

## 3. Edge cases

| # | Case | Required behaviour |
|---|---|---|
| E-1 | **PAR action with no `undo`** but `reversible:true` declared | Row logged, `snapshot = null`, treated as not reversible. `undoLastAction` skips it (AC-3/AC-7). No crash; honest "nothing to undo" if it's the only candidate. |
| E-2 | **Multi-step PAR action** (e.g. `moveStage` that also writes a close-reason; bulk op over N rows) | The inverse descriptor must capture the **whole** effect (one inverse action that undoes all steps), or the action declares `reversible:false`. The snapshot stores one inverse invocation; partial inverses are out (design §3.2). A bulk PAR op whose handler maps to a server bulk write SHOULD prefer the server-side `bulk_update` snapshot (AC-6) over a client inverse. |
| E-3 | **Undo requested after the page changed/unmounted** | The reversal re-emits an `invokeAction` directive. If the inverse action id is **not currently registered** (user navigated away), the client returns `action_not_registered` (CLE-03 §2.3) in the envelope; the server has marked the event `reverted` on dispatch, so we **reconcile**: on an `action_not_registered`/`ok:false` reversal envelope, re-open the event (`status` back to `executed`, clear `revertedAt`) and tell the user to reopen the page to undo there (design §3.3). No false "undone". |
| E-4 | **Concurrent undo** (two "undo" requests, or undo while the hold cron is releasing) | The event-level `revertedAt` guard (`reverseToolCall` already refuses an already-reverted event) + the atomic `held → canceled` transition (must affect exactly 1 row) make the second undo a no-op with a clear message. For outbound, cancel and release race on the same row: a conditional UPDATE `WHERE status='held'` lets exactly one win (AC-15). |
| E-5 | **Send already in flight** (cron flipped `held → queued → sending` between the undo read and the undo write) | The cancel UPDATE is conditioned on `status='held'`; if the row already moved past `held`, the cancel affects 0 rows → undo refuses with "already sending/sent, can't unsend" (AC-11). Never partially cancel an in-flight send. |
| E-6 | **Undo of a PAR read** (filter/view) | Reads are not logged (AC-2), so they are never the "last reversible call". If a user asks to undo a filter, the model uses a **forward** page action (re-apply the previous filter) — not the undo log. Documented in the prompt note (design §7), not enforced here. |
| E-7 | **`logToolCall` insert fails** (missing migration / DB blip) for a PAR action | Fire-and-forget swallow stays as today (`tool-call-log.ts:132-137`): the action still ran; only auditability is lost for that row. For an **outbound held** send this is different — the hold row is the send itself, so its write is **not** best-effort (design §4: the held row must persist or the send must fall back to immediate-with-confirm, never vanish). |
| E-8 | **Grace window changed mid-flight** | A held row carries its own `holdUntil` (computed at enqueue). Changing the tenant window later does not retro-shorten/extend in-flight holds; new sends use the new window. |
| E-9 | **Meeting invite / calendar write as outbound** | Same hold pattern if it funnels through a cancellable enqueue; if a particular outbound path cannot be deferred (synchronous third-party call with no queue), the action declares it **not** holdable and `decideAction`'s `confirm` (CLE-10) remains the only guard — honesty over a fake unsend (design §4 "what is holdable"). |
| E-10 | **Undo after restart** | `reverseToolCall` reads the durable `tool_call_events` + `outbound_emails` rows; no in-memory state. A held send past `holdUntil` after a restart is released by the next cron pass (AC-14). |

---

## 4. Out of scope

- **The permission matrix** (who may undo what, role × action) — that is **CLE-12**. CLE-11 keeps undo scoped to the acting `(tenantId, userId)` as today and adds no new role gate.
- **`decideAction`'s decision logic** — CLE-11 does **not** change what disposition outbound gets; that is **CLE-10**. CLE-11 only adds the *hold mechanism* that activates when the disposition is `execute` and a window is configured, and is inert (window 0) otherwise.
- **Per-action confidence/threshold learning (F005)** and wiring autonomy `level` to truly auto-send — **CLE-16**.
- **Send-guardrail hardening** (enforceSendingIdentity wiring, opt-out on every chokepoint, TZ-aware windows, signalAutoEnroll gate) — **CLE-13**. CLE-11 must *compose* with the guardrails that exist; it does not add or move them.
- **A new UI "Undo" toast component** beyond the affordance contract — the chat-side undo (`undoLastAction`) is the required surface; a richer inline toast is CLE-05/CLE-15 polish. CLE-11 specifies the *cancel endpoint/path* the affordance calls, and a minimal hook, not a designed component.
- **Reversing already-sent email via "recall"** (Exchange-style server recall) — impossible/irreversible; explicitly refused (AC-11).

---

## 5. The grace window default — why `0`

The window is `0` by default so CLE-11 is **backwards-safe**: merging it changes no behaviour for any tenant. A tenant (or Martin, per `OUTBOUND_TEST_MODE` posture) opts into a 30–60s unsend by setting the value. This mirrors the audit's "boil the lake but flag oceans" posture: the mechanism is complete and tested at window 0 and window > 0, but it is **off** until chosen, so it cannot regress the live Pilae tenant. (Also: prod has 0 active sequences and `OUTBOUND_TEST_MODE` history per memory, so the hold has no live send to affect on day one.)

---

## 6. Evaluation steps (Phase 6, hostile QA)

Pure logic first (vitest), then a scripted live check (the worker is Inngest; tests drive its `step` logic or an extracted pure helper — pattern matches `email-send-worker` tests in the repo).

1. **PAR log happy path.** Construct a `tool_call_events` write for a mutating PAR action with an undo descriptor → assert one row, `toolName="invokePageAction:opportunities.moveStage"`, `snapshot.type="page_action"`, inverse captured (AC-1/AC-3).
2. **PAR read not logged.** A `mutating:false` action → no row (AC-2).
3. **PAR reverse (client inverse).** `reverseToolCall` on a `page_action` snapshot → returns a directive payload re-invoking the inverse action; event marked `reverted` (AC-5). Then simulate an `ok:false` reversal envelope → event re-opened, not falsely "undone" (E-3).
4. **PAR reverse (server-owned).** A PAR action logged as `type:"update"` → `reverseToolCall` restores `before` server-side, no directive (AC-6).
5. **Outbound hold, window > 0.** Enqueue an outbound at disposition `execute` with grace 60s → row `status="held"`, `holdUntil≈now+60s`, a `tool_call_events` `outbound_send` snapshot exists; the cron does **not** send it before `holdUntil` (AC-8/AC-9).
6. **Undo within window cancels.** Call the cancel path before `holdUntil` → row `status="canceled"`, event `reverted`, and a release attempt after that affects 0 rows; recipient got nothing (AC-10/AC-15).
7. **Window elapsed → sent, not reversible.** Advance time past `holdUntil`, run the cron → row released and sent through the normal path **with** guardrails applied; then attempt undo → refused "already sent" (AC-9/AC-11).
8. **Guardrail composition.** A held send to a non-allowlisted recipient under `OUTBOUND_TEST_MODE=on`, released after the window → blocked/failed by the existing test-mode guardrail (not silently sent); opt-out + plan-limit equally enforced at release (AC-9, design §4).
9. **Grace = 0 is a no-op.** Same outbound at grace 0 → immediate dispatch path, no `held` status, behaviour byte-identical to pre-CLE-11; the existing `email-send-worker` tests pass unchanged (AC-12).
10. **No double-send / no lost send.** Two concurrent release passes on one held row → exactly one transitions it to `queued`/sent (AC-15); a held row past `holdUntil` after a simulated restart is released by the next pass (AC-14).
11. **Scope.** Undo refuses an event from another `userId`/`tenantId` (AC-16). `lib/capture/approval.ts` and `decideAction`'s body are unmodified (out-of-scope proof).
12. **Migration applied.** `0077_outbound_hold.sql` adds the `held`/`canceled` enum values + `hold_until` column; `tsc` + `db:migrate` smoke green; an existing queued row is unaffected.
