# CLE-11 — tracked follow-ups (post-implementation)

CLE-11 shipped: (1) PAR audit — every **mutating** `invokePageAction` is recorded
in `tool_call_events` via `POST /api/chat/page-action-log`; (2) PAR undo —
`undoLastAction` reverses reversible page actions via their `UndoDescriptor`;
(3) the outbound undo-window **mechanism** — `enqueueOutbound` (hold seam),
`cancelHeldOutbound`, the worker `release-holds` step + held-guard, the
`POST /api/outbound/:id/cancel` route, and the `outboundUndoWindowSeconds` tenant
setting. tsc 0; ~52 tests; adversarially reviewed (no Critical).

The following are deliberate, tracked deferrals — not oversights.

## 1. Outbound undo-window is DORMANT until the inserters are wired (activation ticket)
`enqueueOutbound` has **zero production callers**. The ~11 existing
`db.insert(outboundEmails)` sites (sequence-draft-to-outbound, reply-handler,
reply-agent, campaign-functions, campaign-decision-engine, auto-pipeline-email-handler,
workflow-engine, nl-workflow-builder, stale-deals cron, outbound/review, and the
inline `deliver-interactive.ts`) still insert `status:"queued"` directly. So **no
real send writes a `held` row even at `outboundUndoWindowSeconds > 0`** — there is
no user-visible unsend yet.

This is the SAFE factoring: the window-0 inertness property is unconditional (the
default path is byte-identical to today for every tenant), exactly matching CLE-10's
"prod has 0 active sequences" posture. Rewriting all ~11 live-send inserters at once
is an OCEAN (each is a real send path; one — `sequence-draft-to-outbound` — relies on
a `message_id` dedup key, and a blind reroute that dropped it would double-send), so
activation stays a deliberate, per-caller ticket rather than a blind sweep.

### Seam de-risked 2026-06-18 (the dedup blocker is removed)
`enqueueOutbound` now accepts an optional `messageId` (free-form dedup key →
`message_id` column), defaulting to null so an unset call is byte-identical to today.
This was the one hard blocker for routing the dedup-bearing caller: the
`message_id` column is nullable free-form text (no unique constraint), and
`sequence-draft-to-outbound` dedups by **select-then-insert** on
`messageId = draft:<draftId>`. So that caller can now route through the seam without
losing idempotency. Covered by 2 tests in `outbound-hold.test.ts`.

### Ready-to-run activation recipe (per-caller, test each; do NOT sweep)
1. **`sequence-draft-to-outbound`** (lowest-risk first — already deferrable, now
   dedup-safe): keep the existing select-on-`messageId` idempotency pre-check; replace
   the direct `db.insert(outboundEmails).values({…status:"queued"…})` with
   `enqueueOutbound({ …, messageId: dedupKey, settings })`. Pass the tenant settings
   already loaded in the function. Write the `tool_call_events` `outbound_send`
   snapshot keyed on the returned id (so undo can target it). Regression-test
   window-0 (queued, byte-identical) AND window-N (held + holdUntil) for this caller.
2. **Other deferrable/queue callers** (reply-handler, reply-agent, campaign-functions,
   campaign-decision-engine, auto-pipeline-email-handler, workflow-engine,
   nl-workflow-builder, stale-deals cron, outbound/review): same pattern, one PR each,
   a test each. Any caller with its own dedup passes its key as `messageId`.
3. **Interactive path** (`deliver-interactive.ts`, inline insert today): LAST and
   gated on a product call — switching it to enqueue-on-hold adds a 30–60s latency to
   chat-initiated sends (that delay IS the unsend window). Confirm the product
   expectation (design §4 / checkpoint) before changing its latency profile.

Each rewired caller re-opens the window-0-vs-window-N regression surface, so do it
per-caller with a test each. The seam itself is complete; activation is now purely
the per-caller reroute + its regression test.

## 2. Mode-A (`undo:{kind:"server", snapshot}`) is client-asserted at write time (MEDIUM)
`POST /api/chat/page-action-log` persists the client-supplied server snapshot
verbatim. Blast radius is confined: on undo, `reinsertEntity`/`restoreEntity` force
`tenantId` to the session value and only touch allowlisted entity tables, so a
forged snapshot cannot escape the actor's own tenant. Acceptable for M2; a future
hardening could validate the snapshot shape/entity against the recorded action
server-side before persisting.

## 3. Deploy: migration `0077_outbound_hold.sql` must be applied
Adds the `held`/`canceled` enum values + `hold_until` column + index. NOT run by the
implementation. Apply with `pnpm db:migrate:apply`. Code is safe pre-migration
(window 0 never writes/reads the new states). Requires PostgreSQL >= 12 (Neon is).

## 4. Minor: audit row can be lost on a fast page unmount
If the page unmounts before `getRegisteredActionMeta` resolves in `postPageActionLog`,
the forward mutating action runs (dock-owned promise) but its audit/undo row is not
written → that one action is not undoable. Tolerated by design E-7; documented here
so it is a known limitation.
