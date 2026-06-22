# RECONCILE.md — Spec 23 Send Port and Instantly Adapter (T0)

> Read-only reconciliation. Instantly is wired for mailbox IMPORT + inbound unibox; no outbound SEND port exists. Every precondition is a hard gate.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | `SendPort` (send/status/webhook) + Instantly v2 adapter, scalar custom_variables | **missing** | `instantly-import.ts` imports mailboxes, `instantly-unibox.ts` ingests inbound; no send |
| AC2 | Rotate the pool (21), respect caps + warmup, human-like window | **partial** | spec-21 capacity (merged) + `mailbox-selector` exist; send-time rotation + window is new |
| AC3 | Refuse unverified (17) or suppressed (22) — hard gates | **missing** | The guards exist (spec-17 `isEmailSendable`, spec-22 `isSuppressed`); gating at send is new |
| AC4 | Idempotent per (stepId, contactId) | **missing** | No send idempotency |
| AC5 | Meter sends + emit a send event (29/27) | **partial** | meter exists; `send_event` emission is new |

## Reuse inventory (injected, decoupled)
- spec-17 `isEmailSendable`, spec-22 `isSuppressed`, spec-21 capacity — injected as predicates so spec 23 builds off main regardless of spec-22's merge order (PR #321 in flight).
- `lib/integrations/instantly-import.ts` — confirms the Instantly v2 API + shared-workspace mailbox model (provider `instantly`, sends go through the API, not SMTP).
- spec-02 `meter` — injected (parked).

## Decisions (taken, full autonomy)
1. Build `lib/sending/send/*` (SendPort + orchestration) and `lib/providers/instantly/*` (send adapter). Blast radius `sending/send/*`, `providers/instantly/*`.
2. **AC1:** `SendPort { send, status? }`; `InstantlySendAdapter` maps canonical message + contact → Instantly v2, with `toInstantlyCustomVariables` keeping **scalars only** (objects/arrays dropped, per data-contract).
3. **AC3 hard gates (injected predicates):** refuse `unverified` then `suppressed` before any spend — not warnings.
4. **AC2:** `selectSendMailbox(pool)` rotates to the authenticated mailbox with the most remaining capacity (spreads load, never exceeds cap); `isWithinSendWindow` enforces the human-like window.
5. **AC4:** `sendEmail` dedupes on the idempotency key `(stepId, contactId)` via an injected store — a retry after success returns the prior result (single provider call). The key is forwarded to the adapter for provider-side dedup on the 5xx-retry path.
6. **AC5:** the provider call is metered and a `send_event` emitted. A typed 4xx surfaces (no retry, not stored); a 5xx bubbles to retry under the same key.
7. **No schema** (guards/store/meter/event injected) → mergeable off main.
