# CLE-11 — Extend audit `tool_call_events` + undo to PAR actions + outbound (undo window) — Design

> Constitution `_specs/chat-live-executor/README.md`: §1 "un seul … journal/undo (`tool_call_events`)"; §3.2 `PageAction.reversible` + `PageActionResult.undo`; §3.5 the result envelope `{ invocationId, ok, summary, data?, error? }`; §4.5 "Étendre `tool_call_events` à TOUT + pattern « fenêtre d'undo » pour le sortant". Builds on **CLE-04** (`page-actions.ts` emits `invokeActionDirective`, runs `decideAction`), **CLE-03** (`invokeActionDirective`, `runRegisteredAction`, the `[[action-result]]` envelope, `PageActionResult.undo`), **CLE-10** (the `decideAction` body; outbound → `confirm` is the SSOT today). No frozen contract is redefined; one additive field on `PageActionResult` is proposed as a README §3.2 amendment (see §10).

---

## 1. System fit (where each piece lands, file:line)

The audit log + undo already exist and are clean; CLE-11 extends them along two axes (PAR actions; outbound) without touching the headless create/update/delete paths that work today.

| Concern | Today | After CLE-11 |
|---|---|---|
| Audit table | `db/schema/intelligence.ts:84-123` `toolCallEvents` — `snapshot jsonb` (freeform), `status text` (`proposed\|executed\|failed\|reverted`), `revertedAt`, `reverseOpId`, `surfaceType`. | **No change to this table.** `snapshot` is freeform jsonb, so two new snapshot `type`s (`page_action`, `outbound_send`) need **no migration** here. (The only migration is on `outbound_emails`, §5.) |
| Snapshot union + reversal | `lib/chat/tool-call-log.ts:48-92` `ReversibleSnapshot` (6 types) + `reverseToolCall` switch `:208-333` (`create`/`update`/`delete`/`bulk_update`/`merge_contacts`/`delete_sequence_step`); allowlist of reversible entities `:36-46,352-362`; `getLastReversibleCall` `:144-171` ("first row with a snapshot"). | + two snapshot types in the union; + two `else if` arms in `reverseToolCall`; + a `logPageActionCall` helper; + a `logOutboundHold`/cancel helper. `getLastReversibleCall` unchanged (the new snapshots are non-null → naturally picked up). |
| `undoLastAction` tool | `lib/chat/tools/undo.ts:8-41` — finds last reversible, calls `reverseToolCall`, returns `{ reverted }` or `{ error }`. | + when `reverseToolCall` returns a **directive payload** (PAR client-side reversal, §3.3), the tool spreads it so the client re-invokes the inverse on the live page; outbound reversal returns a plain `{ reverted }`. Signature unchanged. |
| Where a PAR action is logged | CLE-04 `invokePageAction` (`lib/chat/tools/page-actions.ts`) **emits a directive and returns** — it never sees the run outcome (the client runs it and round-trips the envelope via CLE-03). So logging cannot happen inside `invokePageAction`. | A new server endpoint **`POST /api/chat/page-action-log`** (or the existing chat route's envelope-ingest seam) records the row **when the client reports the outcome** — i.e. logging is driven by the **result envelope**, not the emit. §2 picks and justifies the exact seam. |
| Outbound send path | `inngest/email-send-worker.ts` — `processOutboundEmails` cron (`:101`, fetch `status="queued"` `:114-121`) + `sendSingleEmail` event (`:510`, `email/send-now`). Interactive sends: `lib/emails/deliver-interactive.ts:114` (`deliverInteractiveEmail`, sends inline). Chat send tool: `lib/chat/tools/action.ts:362` (`sendMeetingFollowUp` → `deliverInteractiveEmail`). | A **hold seam** in front of the queue: `enqueueOutbound(...)` writes `status:"held"` + `holdUntil` when a grace window applies, else the existing immediate path. `processOutboundEmails` learns to (a) skip `held` rows whose `holdUntil` is in the future, (b) release `held` rows whose `holdUntil` has passed into `queued`. A `cancelHeldOutbound(...)` flips `held → canceled`. |
| Grace window config | `lib/config/tenant-settings.ts` holds tenant settings (e.g. `agentApprovalMode`). | + one integer setting `outboundUndoWindowSeconds` (default `0`), read by the hold seam. No migration (tenant settings is a jsonb/columned config object; follow how `agentApprovalMode` is stored — confirm in tasks). |
| Guardrail composition | `lib/emails/recipient-guardrail.ts` (`isRecipientAllowed`), opt-out + plan-limit + mailbox window/cap inside the worker (`:259,339,308,321`) and `deliver-interactive.ts:124,129,139`. | **Untouched and authoritative.** The hold runs *before* the queue; all guardrails still fire at **release/send** time. The hold can only *delay or cancel*, never *bypass*, a guardrail. |

CLE-11 stops at: PAR mutating actions are logged (with inverse when reversible), `undoLastAction` reverses a PAR action (client inverse or server-owned), and outbound `execute` is held-and-cancellable when a window is set (inert at 0).

---

## 2. The `tool_call_events` mapping for a PAR action

### 2.1 When is the row written? (the seam decision)

`invokePageAction` (CLE-04) emits a directive and returns *before* the action runs — it cannot log the outcome. The run happens **client-side** (CLE-03 `runRegisteredAction`) and its result comes back as the `[[action-result]]{ invocationId, ok, summary, data?, error? }[[/action-result]]` envelope on the next POST (CLE-03 §2.4, README §3.5). Two candidate seams:

- **(α) Log inside `invokePageAction` at emit time** — rejected: we would log `executed` before we know the run succeeded, violating AC-1 ("only after the client reports success") and AC-4 (failed runs must log `failed`). It also has no `snapshot` (the undo descriptor only exists *after* the run).
- **(β) Log when the result envelope is ingested** — chosen. The envelope carries `invocationId` (correlates to the emit), `ok`, and (extended, §3.1) the undo descriptor inside `data`. The server already receives this envelope as a user turn on the next POST. We add a tiny **envelope-ingest hook** on the chat route that, when it parses an `[[action-result]]` turn, calls `logPageActionCall(...)`.

**Chosen seam, concretely:** a dedicated endpoint **`POST /api/chat/page-action-log`** that the client calls from the `invokeAction` arm of `runUiDirective` (CLE-03 §2.4) **right after** `runRegisteredAction` settles, passing `{ invocationId, actionId, params, ok, error, surfaceType, undo?: { actionId, params } }`. Rationale over parsing the chat turn:
- It is **explicit and typed** (no fragile re-parse of a synthetic user message server-side; the envelope text is for the *model*, the log is for the *server*).
- It carries the `undo` descriptor, which is **not** in the frozen envelope (the envelope only crosses `ok/summary/data/error` to the model; the undo descriptor is server-only metadata we deliberately keep out of the model's context — §3.1).
- It reuses the auth context the dock already has (same-origin POST, session cookie), so tenant/user scoping is free.
- The dock already round-trips the envelope to the model via `chat.sendMessage`; this is a **second, parallel** fire-and-forget call for the audit row. The model path and the audit path are independent (one is for chaining, one is for undo).

> Fallback (recorded, no contract change): if a reviewer prefers zero new routes, the same `logPageActionCall` can be invoked from the chat route when it detects an inbound `[[action-result]]` turn (the envelope-ingest hook), reading a sidecar map of `invocationId → { actionId, params, undo }` the client posted alongside. The dedicated endpoint is cleaner and is **chosen**; the hook is the fallback.

### 2.2 The row shape

For a mutating PAR action `opportunities.moveStage` moving deal `d1` from `qualified` to `won`:

```jsonc
{
  "tenantId": "<from session>",
  "userId":   "<from session>",
  "threadId": "<optional, from body>",
  "toolName": "invokePageAction:opportunities.moveStage",   // namespaced so forensics/undo can tell PAR from headless
  "args":     { "actionId": "opportunities.moveStage", "params": { "dealId": "d1", "stage": "won" } },
  "result":   { "ok": true, "summary": "Moved “Acme” to Won" },   // the envelope (no undo descriptor here)
  "status":   "executed",                                     // "failed" if ok:false (AC-4)
  "surfaceType": "opportunities",
  "snapshot": /* see §3.2 — page_action (client inverse) OR a server-owned create/update/delete */
}
```

- `toolName` is prefixed `invokePageAction:` so `getLastReversibleCall` results and any analytics can distinguish PAR from headless without a schema change.
- `args` mirrors the headless convention (the validated input).
- `result` is the **frozen envelope minus the undo descriptor** (the undo lives only in `snapshot`).
- `status` is `executed` only on `ok:true` (AC-1); `failed` + `errorMessage` on `ok:false` (AC-4), and a `failed` row has `snapshot:null` so it is never a reversal candidate.

---

## 3. The reversal mechanism for client-side actions — THE key design decision

### 3.1 The problem

A `PageActionResult.undo` (README §3.2) is a **closure** that runs on the client (`use-ui-directives.ts` arm, CLE-03). The undo log lives on the **server** (`tool_call_events`). A closure is **not serializable** and the page that holds it may be **unmounted** by the time the user says "undo". So the server **cannot** call the recorded `undo()` directly. We must pick how a server-side undo log reverses a client-executed action.

### 3.2 Two reversal modes (chosen)

**Mode A — server-owned reversal (reuse the existing path).** When a PAR action's *effect* is a plain DB row the server already owns (e.g. a page "create deal" action whose handler is the same insert the headless `createDeal` does), the log records a **server-reversible** snapshot (`type:"create"|"update"|"delete"|"bulk_update"`, the existing union) instead of `page_action`. `reverseToolCall` reverses it **server-side with no client round-trip** (AC-6). This is preferred whenever the effect is purely a server row, because it works even if the page is gone and reuses tested code. The PAR action declares this by returning, in its `PageActionResult.data.undo`, a server snapshot rather than a client inverse (the registering page chooses — design boundary, documented for CLE-06+).

**Mode B — client inverse re-invocation (the new mechanism for UI-state effects).** When the action's effect is genuinely on the **live page** (a filter, a kanban drag with optimistic UI, a view toggle that the server doesn't model as a row), the reversal is **itself a Page Action**: the action declares an **inverse** — another registered `actionId` + `params` — that, when run, undoes it. The snapshot stores that inverse:

```ts
| {
    /** CLE-11: a PAR action reversed by re-invoking a declared inverse action
     *  on the live page. The server log holds only the inverse DESCRIPTOR
     *  (ids + params), never a closure. reverseToolCall returns an invokeAction
     *  directive for this inverse; the client runs it via runRegisteredAction. */
    type: "page_action";
    actionId: string;                       // the original action (forensics)
    inverse: { actionId: string; params: Record<string, unknown> };
  }
```

The inverse descriptor is produced by the page's `run` and returned in `PageActionResult` (the `undo` field is widened from a closure to `closure | { kind:"reinvoke"; actionId; params }` — §10 amendment; the closure form stays valid for purely-client undos that never need server persistence, but **only the descriptor form is persisted**). `logPageActionCall` (§2.1) reads the descriptor off the `POST /api/chat/page-action-log` body, not off the envelope.

### 3.3 How a server log "reverses" a client action — the round-trip

`reverseToolCall` for a `page_action` snapshot does **not** mutate anything; it **returns a directive payload** the `undoLastAction` tool spreads, so the *client* runs the inverse on the live page (exactly the CLE-03/CLE-04 path the forward action used):

```ts
// inside reverseToolCall, new arm:
} else if (snapshot.type === "page_action") {
  // Client-side reversal: we cannot run the inverse here (it lives on the page).
  // Emit an invokeAction directive for the declared inverse; the client runs it
  // and round-trips an [[action-result]] envelope. Mark reverted on DISPATCH;
  // reconcile on the reversal envelope (E-3).
  const invocationId = crypto.randomUUID();
  await db.update(toolCallEvents)
    .set({ status: "reverted", revertedAt: new Date() })   // optimistic; reconciled on envelope
    .where(eq(toolCallEvents.id, eventId));
  return {
    ok: true,
    reverseEventId: null,
    reversedAction: `${event.toolName} (undo sent to the page)`,
    directive: invokeActionDirective(invocationId, snapshot.inverse.actionId, snapshot.inverse.params, /*requireConfirm*/ false),
    reconcileEventId: eventId,   // so the envelope-ingest can re-open on failure
  };
}
```

`undoLastAction` (`tools/undo.ts`) spreads `result.directive` into its return so the dock dispatches it (the same shape `invokePageAction` returns). The CLE-03 client runs `runRegisteredAction(inverse)`, and the **reversal envelope** comes back. The **envelope-ingest / `page-action-log` endpoint** is taught to recognise a reversal (it carries `reconcileEventId` the client echoes back, or the `invocationId` we minted): on `ok:false`/`action_not_registered`, it **re-opens** the original event (`status:"executed"`, `revertedAt:null`) and the tool tells the user "open <page> to undo there" (E-3). On `ok:true` it leaves the `reverted` mark.

**Why dispatch-time mark + reconcile, not completion-time mark?** The server's only synchronous observable is "the inverse directive was emitted". Waiting for completion would block `undoLastAction` on a client round-trip across a new POST (the AI-SDK turn boundary) — not available synchronously. So we mark optimistically and reconcile when the envelope returns. This is honest: the worst case (E-3, page gone) re-opens the event and tells the truth, never a false "undone".

**Justification for choosing re-invocation over alternatives:**
- **vs. a server endpoint per inverse** — would re-duplicate every page handler on the server (the exact 1-for-1 anti-pattern the audit/README reject in doctrine §1/§3). Re-invocation reuses the page's *existing, tested* handler. Zero duplication.
- **vs. serializing the closure** — impossible (closures aren't serializable) and unsafe.
- **vs. persisting a generic "DOM patch"** — that is computer-use, explicitly rejected (README doctrine §3).
- Re-invocation keeps the **same containment** as forward PAR: only a *currently-registered* inverse id can run (CLE-03 §7), double-resolved (server emits an id; client runs only ids its mounted registry holds). A stale/forged inverse id → `action_not_registered` → reconcile, no effect.

### 3.4 Honesty about what is reversible

| PAR action class | Reversible? | Mode |
|---|---|---|
| Read (filter, view toggle, sort) | n/a (not logged, AC-2) | — |
| Reversible server-owned mutation (create deal, update field, bulk score) | yes | A (server snapshot) |
| Reversible UI-state mutation (optimistic kanban move, inline edit with a declared inverse) | yes | B (client inverse) |
| Mutation with no declared inverse / `reversible:false` (e.g. `delete` with no soft-delete, an enrich that spends credits) | **no** | logged, `snapshot:null`, skipped by undo (AC-3/AC-7, E-1) |
| Outbound (send/enroll/invite) | only **within the hold window** | §4 (`outbound_send` snapshot) |
| Already-sent outbound | **no** | refused (AC-11) |

---

## 4. The hold-until + cancel wiring in `email-send-worker`

### 4.1 What is holdable

Holdable = any outbound that goes through a **deferrable enqueue** (a row in `outbound_emails`, processed by the cron). That covers sequence steps and chat/queue email sends. **Interactive** sends (`deliver-interactive.ts`) send **inline** today; to make them holdable they must **enqueue** (write an `outbound_emails` row with a hold) instead of calling Resend/SMTP synchronously — but only when a window applies. A meeting invite / calendar write that is a **synchronous** third-party call with no queue is **not holdable**; for those, `decideAction`'s `confirm` (CLE-10) stays the only guard and the action declares it non-holdable (AC-9/E-9). Honesty over a fake unsend.

### 4.2 Schema change (migration `0077`, §5)

`outbound_emails` (`db/schema/outbound.ts:274`) gains:
- two **enum values** on `outboundStatusEnum` (`:207-216`): `"held"`, `"canceled"`.
- one **column** `hold_until timestamptz` (null for non-held rows).

### 4.3 The enqueue seam

A single helper all outbound chat/queue paths funnel through:

```ts
// lib/emails/outbound-hold.ts (NEW) — pure-ish, one DB write.
export async function enqueueOutbound(input: EnqueueOutboundInput): Promise<{ id: string; held: boolean; holdUntil: Date | null }> {
  const windowSec = readOutboundUndoWindowSeconds(input.settings); // default 0, coerced safe (AC-13)
  const held = windowSec > 0;                                      // AC-12: 0 → never held
  const holdUntil = held ? new Date(Date.now() + windowSec * 1000) : null;
  const [row] = await db.insert(outboundEmails).values({
    tenantId: input.tenantId, contactId: input.contactId ?? null, mailboxId: input.mailboxId ?? null,
    fromAddress: input.fromAddress ?? "pending@rotation", toAddress: input.to,
    subject: input.subject, bodyHtml: input.bodyHtml, bodyText: input.bodyText,
    status: held ? "held" : "queued",
    queuedAt: held ? null : new Date(),
    holdUntil,
  }).returning({ id: outboundEmails.id });
  return { id: row.id, held, holdUntil };
}
```

- **Grace 0 → `status:"queued"`, no `holdUntil`** → the existing cron picks it up unchanged (AC-12, byte-identical to today).
- **Grace > 0 → `status:"held"`, `holdUntil` set** → the cron will skip it until the window passes, then release it (AC-8/AC-9).

The caller (the chat outbound tool / the disposition handler) writes the `tool_call_events` `outbound_send` snapshot referencing `row.id`:

```ts
| {
    /** CLE-11: an outbound send placed on a cancellable hold. Reversal cancels
     *  the held row before it leaves; after it's sent it is irreversible. */
    type: "outbound_send";
    outboundEmailId: string;
    holdUntil: string;          // ISO — for the "already sent" message (AC-11)
    channel: "email" | "sequence_step" | "meeting_invite";
  }
```

### 4.4 The cron changes (`processOutboundEmails`, `:114-121`)

Two surgical changes, both composing with every existing guardrail (none removed):

1. **Release matured holds.** Before the `status="queued"` fetch, an atomic claim transitions due holds:
   ```ts
   // Release: held rows whose window elapsed → queued (atomic; AC-14/AC-15).
   await db.update(outboundEmails)
     .set({ status: "queued", queuedAt: new Date(), holdUntil: null, updatedAt: new Date() })
     .where(and(eq(outboundEmails.status, "held"), lte(outboundEmails.holdUntil, new Date())));
   ```
   This is the **durable clock** (AC-14): no in-memory timer; a crash just means the next 2-minute pass releases due holds. Held rows whose `holdUntil` is still in the future are **not** matched, so the existing `status="queued"` fetch never sees them (AC-8).

2. **Everything after release is unchanged.** Released rows are now `queued` and flow through the **existing** `filter-optouts` → `mark-sending` → test-mode guardrail (`:259`) → opt-out (`:131`) → mailbox window/cap (`:308,321`) → plan-limit (`:339`) → Resend send. **The hold delays; it never bypasses** (AC-9, design invariant). A held send to a blocked recipient still fails the test-mode/opt-out check at release — exactly as if it had been queued normally.

`sendSingleEmail` (`email/send-now`, `:510`) gains a one-line guard: if the row is `held` and `holdUntil` is in the future, no-op (`{ sent:false, reason:"held" }`) so an event-driven trigger can't jump the hold; once released it sends normally.

### 4.5 The cancel path

```ts
// lib/emails/outbound-hold.ts
export async function cancelHeldOutbound(tenantId: string, outboundEmailId: string): Promise<{ canceled: boolean; reason?: string }> {
  // Atomic: only a row STILL held can be canceled (AC-15/E-5). 0 rows affected → already moved on.
  const res = await db.update(outboundEmails)
    .set({ status: "canceled", failedAt: new Date(), errorMessage: "Canceled by undo within the send window", updatedAt: new Date() })
    .where(and(eq(outboundEmails.id, outboundEmailId), eq(outboundEmails.tenantId, tenantId), eq(outboundEmails.status, "held")))
    .returning({ id: outboundEmails.id });
  if (res.length === 0) return { canceled: false, reason: "already_sending_or_sent" }; // AC-11/E-5
  return { canceled: true };
}
```

`reverseToolCall` for an `outbound_send` snapshot calls `cancelHeldOutbound`:
- canceled → mark event `reverted`, return `{ ok:true, reversedAction:"email send (canceled before it left)" }` (AC-10).
- `already_sending_or_sent` → **do not** mark reverted; return `{ ok:false, error:"This email was already sent <holdUntil> and can't be unsent." }` (AC-11).

The UI "Undo" affordance (CLE-05/CLE-15 owns the component) calls a thin `POST /api/outbound/:id/cancel` that wraps `cancelHeldOutbound` for the acting user; chat-side, `undoLastAction` is the surface. Both funnel through the same atomic transition (no divergence).

---

## 5. Migration

**`drizzle/0077_outbound_hold.sql`** (next free number; latest is `0076_call_lists.sql`):

```sql
-- CLE-11: outbound undo window (de-facto unsend). Add two lifecycle states and
-- a hold-until clock to outbound_emails. Backwards-safe: no existing row is
-- touched; default behaviour (window 0) never produces a 'held' row.
ALTER TYPE "outbound_status" ADD VALUE IF NOT EXISTS 'held';
ALTER TYPE "outbound_status" ADD VALUE IF NOT EXISTS 'canceled';
ALTER TABLE "outbound_emails" ADD COLUMN IF NOT EXISTS "hold_until" timestamptz;
CREATE INDEX IF NOT EXISTS "outbound_hold_idx" ON "outbound_emails" ("status", "hold_until");
```

Notes:
- `ALTER TYPE … ADD VALUE` cannot run inside a transaction block in Postgres; the drizzle runner applies enum additions in their own statement (confirm the runner/`db:migrate:apply` handles this — tasks T-mig). The `IF NOT EXISTS` makes re-runs idempotent.
- The `(status, hold_until)` index makes the cron's release query (`status='held' AND hold_until <= now()`) and the queued fetch cheap.
- **Drizzle schema mirror:** add `"held"`/`"canceled"` to `outboundStatusEnum` (`outbound.ts:207`) and `holdUntil: timestamp("hold_until", { withTimezone: true })` to the table + the new index in the `(table) => [...]` block, so `tsc` and generated types agree.
- **`tool_call_events`: no migration.** `snapshot` is freeform `jsonb` (`intelligence.ts:106`); the two new snapshot `type`s are application-level. **`tenant_settings`: no migration** for `outboundUndoWindowSeconds` if the config is a jsonb settings object (confirm in tasks; if it is a typed column store, add it to that migration — flagged).

---

## 6. Failure handling (never lose a send; never double-send)

| Failure | Where caught | Outcome |
|---|---|---|
| `logPageActionCall` insert fails (PAR audit) | `POST /api/chat/page-action-log` try/catch (mirrors `logToolCall` `:132`) | Swallowed; the action already ran. Only that undo row is lost (E-7). **Not** applied to outbound — the held row IS the send (below). |
| Held-row insert fails (outbound) | `enqueueOutbound` — **not** best-effort | The send must persist or not exist. On insert failure, the caller surfaces an error and does **not** report "sent/scheduled" (E-7). No phantom send. |
| Two cron passes release the same held row | atomic `UPDATE … WHERE status='held' AND hold_until<=now()` | Set-based update is idempotent; a row already moved to `queued` is not matched again. Then `mark-sending` (`:176`, `WHERE status` claim) prevents double-send at the send step (AC-15). |
| Cancel races release | both conditioned on `status='held'`; exactly one UPDATE matches | Cancel wins → `canceled`, release matches 0. Release wins → `queued`, cancel matches 0 → undo refuses "already sending" (AC-11/E-5). Never half-canceled. |
| Worker crash with held rows | the cron is the durable clock (no timer) | Next pass releases due holds (AC-14/E-10). |
| Reversal directive can't run (page gone) | envelope-ingest reconcile (§3.3) | Event re-opened (`executed`), user told to reopen the page (E-3). No false "undone". |
| Undo of an event from another user/tenant | `reverseToolCall` WHERE `tenantId,userId` (`:188-194`) | "Event not found" (AC-16). |
| `decideAction` returns `confirm` (the current outbound SSOT) | the hold seam only triggers on `execute` | Card-confirm path unchanged; no hold (AC-12 — hold is additive to, not a replacement for, the confirm path). |
| Grace value malformed/out of range | `readOutboundUndoWindowSeconds` coerces to 0 | Fail-safe → no hold (AC-13). |

**The two load-bearing invariants:** a held send is in exactly one terminal state (sent via release, or canceled via undo) — never both, never neither (AC-14); and every status transition that could send is an atomic conditional UPDATE (AC-15).

---

## 7. System-prompt note (minimal)

One sentence added to the existing `<page_actions>` block (CLE-04 §2.9) so the model uses the right tool for "undo":
> To undo the last change, call `undoLastAction`. It reverses a reversible CRM change or a reversible page action, and cancels an outbound email that is still within its send window. To revert a **filter or view** (which is not "undone" from the log), just apply the previous filter as a forward page action. An email already sent past its window cannot be unsent — say so.

No new approval/permission language (that is CLE-10/CLE-12).

---

## 8. Data flow

```
PAR action (mutating):
  invokePageAction (CLE-04) ─emit─▶ client runRegisteredAction (CLE-03) ─▶ result + undo descriptor
        │                                                                      │
        │ (model path) chat.sendMessage("[[action-result]]{ok,summary}")       │ (audit path)
        ▼                                                                      ▼
  model chains                                            POST /api/chat/page-action-log
                                                          → logPageActionCall → tool_call_events row
                                                            snapshot = page_action(inverse)  OR  create/update/delete (server-owned)

Undo a PAR action:
  "undo that" → undoLastAction → reverseToolCall(page_action)
        ├─ server-owned snapshot → restore row server-side (no round-trip)            (AC-6)
        └─ page_action snapshot  → return invokeActionDirective(inverse) ─▶ client runs inverse
                                    mark reverted (optimistic) ─▶ reversal envelope ─▶ reconcile (E-3)

Outbound with a window:
  decideAction = execute (CLE-10) + windowSec>0
        → enqueueOutbound: outbound_emails row status=held, holdUntil=now+window
        → tool_call_events snapshot = outbound_send(outboundEmailId, holdUntil)
  cron processOutboundEmails (every 2m):
        held & holdUntil<=now  ─atomic─▶ queued ─▶ [test-mode, opt-out, window, cap, plan] ─▶ Resend  (AC-9)
        held & holdUntil>now   ─skip─▶ (window still open)                                            (AC-8)
  "undo" before holdUntil → cancelHeldOutbound: held ─atomic─▶ canceled ; event reverted               (AC-10)
  "undo" after sent        → cancel matches 0 rows → refuse "already sent"                              (AC-11)
  windowSec=0              → enqueue writes status=queued directly → today's path, no hold              (AC-12)
```

---

## 9. Security

- **No privilege escalation via reversal.** The PAR inverse is re-invoked through the *same* registry gate as the forward action (CLE-03 §7): only a currently-mounted, registered inverse id can run, double-resolved server (mints id) + client (runs only its own registered ids). A forged snapshot inverse id → `action_not_registered` → reconcile, no effect.
- **Undo is tenant/user-scoped** exactly as today (`reverseToolCall`/`getLastReversibleCall` WHERE `tenantId,userId`, `:152-159,188-194`) — AC-16. The new `page-action-log` and `/api/outbound/:id/cancel` endpoints take the acting session's `tenantId,userId`; the cancel UPDATE is `WHERE id AND tenantId AND status='held'` (no cross-tenant cancel).
- **The hold never weakens a guardrail.** Every existing send gate (test-mode allowlist, opt-out, plan-limit, mailbox window/cap) runs at **release/send** time, after the hold (§4.4). The hold can only delay or cancel. A reviewer can verify: the `send-<id>` step (`:255-499`) is unchanged; release just feeds it `queued` rows.
- **The audit log is not a model surface.** The undo descriptor lives only in `snapshot` (server), never crossed to the model in the §3.5 envelope — so a prompt-injected turn cannot read or forge an inverse. The model can *ask* to undo; only the server-held snapshot decides what the inverse is.
- **Outbound held rows carry no new secret**; `hold_until` is a timestamp. Canceled rows retain the body for forensics like a `failed` row (no new exposure).

---

## 10. Test strategy + contract tension

**Test strategy (vitest; pattern matches `email-send-worker`/`tool-call-log` tests, no Playwright — the cron logic is exercised via extracted helpers + a fake clock):**

- **`tool-call-log.page-action.test.ts`** — `logPageActionCall` writes the right row for a mutating action (AC-1), writes nothing for a read (AC-2), writes `status:"failed"` + null snapshot for `ok:false` (AC-4), stores the `page_action` inverse when present and `snapshot:null` when `reversible` but no inverse (AC-3/E-1).
- **`tool-call-log.reverse-page-action.test.ts`** — `reverseToolCall` on a `page_action` snapshot returns `{ ok:true, directive }` with `directive._uiDirective.kind==="invokeAction"` and the inverse id/params, marks the event `reverted` (AC-5); on a server-owned `update` snapshot restores `before` with no `directive` (AC-6); a non-reversible PAR row is skipped by `getLastReversibleCall` so the next reversible one is returned (AC-7).
- **`reconcile-page-action.test.ts`** — an `ok:false`/`action_not_registered` reversal envelope re-opens the event (`status:"executed"`, `revertedAt:null`) (E-3); an `ok:true` one leaves it `reverted`.
- **`outbound-hold.test.ts`** — `enqueueOutbound` with window 60 → `status:"held"`, `holdUntil≈+60s` (AC-8); with window 0 → `status:"queued"`, `holdUntil:null`, **and a snapshot/assertion that the row is byte-identical to today's queued insert** (AC-12); malformed window → 0 (AC-13).
- **`outbound-release.test.ts`** (the worker logic, fake clock) — a held row with `holdUntil` in the future is **not** released and **not** in the `queued` fetch (AC-8); past `holdUntil` → released to `queued` then sent **through the existing guardrail chain** (assert test-mode block still fires for a non-allowlisted recipient; opt-out + plan-limit still fire) (AC-9); two concurrent release passes → the row transitions once (AC-15); a held row past window after a simulated restart → released by the next pass (AC-14).
- **`outbound-cancel.test.ts`** — **REQUIRED: an outbound `execute` is cancellable within the window and irreversible after.** Cancel before `holdUntil` → `status:"canceled"`, event `reverted`, a subsequent release matches 0 rows, recipient got nothing (AC-10); advance past `holdUntil`, release+send, then cancel → 0 rows, `reverseToolCall` returns `{ ok:false }` "already sent", event **not** reverted (AC-11/E-5). Concurrent cancel vs release on one row → exactly one wins (E-4).
- **`undo-tool.test.ts`** — `undoLastAction` spreads `reverseToolCall`'s `directive` for a PAR reversal; returns plain `{ reverted }` for an outbound cancel; `{ error }` after-window. Scope: refuses another user's event (AC-16).
- **Out-of-scope proof** — `lib/capture/approval.ts` and `lib/guardrails/decide-action.ts` are unmodified (grep/`git diff --stat` in `regression.sh`); existing `email-send-worker` tests pass unchanged (AC-12).
- **Coverage:** 100% of new branches in `tool-call-log.ts` (two arms + the two log helpers), `outbound-hold.ts`, and the cron's release/skip logic. `tsc --noEmit` 0 errors. No new runtime dependency. `regression.sh` green. Migration `0077` applies + a smoke `db:migrate` check.

**Contract tension (flag at the M2 checkpoint):**
1. **`PageActionResult.undo` widening (README §3.2).** §3.2 freezes `undo?: () => Promise<void>`. CLE-11 needs a **serializable** inverse to persist server-side, so it widens to `undo?: (() => Promise<void>) | { kind: "reinvoke"; actionId: string; params: Record<string, unknown> } | { kind: "server"; snapshot: ReversibleSnapshot }`. The closure form stays valid (purely-client undos), but **only the descriptor forms are persisted** for cross-session undo. This is a README §3.2 **amendment** (per the constitution's own change rule, README §6): a spec cannot redefine a contract silently — so CLE-11 opens a one-line `spec-issues.md` proposing the widening and amends README §3.2 before merge. **Recommended: amend** (the closure-only contract is un-persistable, which the audit's "extend `tool_call_events` to PAR" requirement structurally needs).
2. **New route `POST /api/chat/page-action-log`** vs the envelope-ingest hook. The route is the chosen seam (§2.1); the hook is the recorded fallback. Either is internal (no §3 contract). Flag only so a reviewer picks one; the route is cleaner.
3. **Interactive sends become enqueue-on-hold.** `deliver-interactive.ts` sends inline today; to be holdable it must enqueue when a window applies. At window 0 it stays inline (no change). The divergence (inline vs enqueue) exists only when a tenant opts into a window — flagged so a reviewer confirms the interactive path's latency expectation (a 30–60s hold is the point).
