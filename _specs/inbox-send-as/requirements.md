# A2 — inbox-send-as · Requirements

**Feature**: a From-selector in the composer so a reply or a new mail can be sent from ANY
of the user connected, sendable mailboxes. Default = the thread own mailbox (reply from
the box that received the inbound); brand-new compose defaults to the user primary box.
The chosen `mailboxId` is carried through `/api/emails/send` -> `deliverInteractiveEmail` and
HONORED so the message physically leaves from that mailbox identity/credentials.

**Prio**: P0. **Depends on**: A1 (`inbox-mailbox-connect`).

## Ground-truth tags (verified against live code 2026-06-19)

| Tag | Meaning |
|----|----|
| `[NEW]` | real gap, needs code |
| `[DONE]` | already shipped — do NOT re-spec |
| `[LOCKED]` | stack/architecture decision — do NOT reopen |
| `[HORS SCOPE]` | tracked in another spec |

Key facts established by reading the code:

- `outboundEmails.mailboxId` already exists (`src/db/schema/outbound.ts:294`, FK ->
  `connectedMailboxes.id`) and is already written by `deliverInteractiveEmail`
  (`src/lib/emails/deliver-interactive.ts:246`). **NO migration.** `[DONE]`
- The composer send path is `/api/emails/send` -> `deliverInteractiveEmail`, NOT the Inngest
  worker. The worker (`src/inngest/email-send-worker.ts:311-314`) already honors a row
  `mailboxId`, but the composer never enqueues a row — it sends inline. `[LOCKED]`
- `resolveOwnerMailbox` (`src/lib/emails/deliver-interactive.ts:85-112`) currently picks the
  user FIRST `active` mailbox with `.limit(1)` and offers no way to pin a chosen box. **This
  is the single injection point.** `[NEW]`
- The thread own mailbox is already known to the client:
  `ConversationListItem.mailboxId/mailboxAddress/mailboxLabel`
  (`src/app/(dashboard)/inbox/_types.ts:39-41`), populated by `attributeMailbox`
  (`src/lib/inbox/mailbox-attribution.ts:72`) and emitted on the detail payload
  (`src/app/api/inbox/conversations/route.ts:205-207`). `[DONE]`
- The picker data source already exists: `GET /api/settings/mailboxes` returns the user
  `userId`-scoped boxes ordered by `created_at` (`src/app/api/settings/mailboxes/route.ts:14-33`). `[DONE]`
- Mailbox status enum: `warming_up | active | paused | disabled | error`
  (`src/db/schema/outbound.ts:199-205`). "Sendable" = `active`. `[DONE]`
- The never-auto-send contract is the explicit `handleSend`
  (`src/components/email-composer-panel.tsx:373`). A2 must not change it. `[LOCKED]`

## EARS requirements (GIVEN/WHEN/THEN + edge cases)

### R1 — From selector in the composer  `[NEW]`

- **R1.1** THE SYSTEM SHALL render a From selector in the composer header area that lists every
  one of the signed-in user connected mailboxes whose status is `active` (sendable), each
  shown as `display name <address>` (label falls back to the address when no display name).
- **R1.2** WHERE the user has exactly one sendable mailbox, THE SYSTEM SHALL collapse the From
  selector to a static, non-interactive label showing that mailbox (no dropdown affordance).
  GIVEN one active box / WHEN the composer opens / THEN the From row shows the box as plain
  text and is not clickable.
- **R1.3** WHERE the user has zero sendable mailboxes, THE SYSTEM SHALL show a non-interactive
  "No sendable mailbox — connect one in Settings -> Mail and Calendar" hint in the From row and
  leave Send enabled (the server is the authoritative gate — see R3.5/R4.x).
- **R1.4** THE SYSTEM SHALL list only sendable mailboxes in the selector; a `warming_up`,
  `paused`, `disabled`, or `error` mailbox SHALL NOT appear as a selectable From option.
- **R1.5** WHEN the user picks a mailbox from the selector, THE SYSTEM SHALL update the displayed
  From to the chosen box and carry that `mailboxId` into the send request (R3.1).
- **R1.6** THE SYSTEM SHALL NOT add or alter any other composer field, button, or keyboard
  behaviour (To/Cc/Bcc/Subject/Body, Rewrite/Translate/Draft, Cmd-J, Save draft, Send).

### R2 — Default selection  `[NEW]`

- **R2.1** WHEN the composer opens as a REPLY to a thread that has a known, currently-sendable
  mailbox, THE SYSTEM SHALL default the From selection to that thread mailbox
  (`detail.conversation.mailboxId`). GIVEN a thread attributed to box B which is active / WHEN
  reply opens / THEN From = B.
- **R2.2** WHEN the composer opens as a brand-new compose (no thread mailbox), THE SYSTEM SHALL
  default the From selection to the user primary mailbox — the first sendable mailbox by
  `connected_mailboxes.created_at` (the same order `GET /api/settings/mailboxes` returns).
- **R2.3** IF the thread attributed mailbox is no longer connected or is no longer sendable
  at open time, THEN THE SYSTEM SHALL fall back to the R2.2 default and select a valid sendable
  mailbox (no broken/disabled box pre-selected). Edge: thread mailbox revoked between sync and
  reply.
- **R2.4** IF the thread has no attributed mailbox (`mailboxId == null`, e.g. a legacy row),
  THEN THE SYSTEM SHALL apply the R2.2 default.

### R3 — Carry the choice through the send pipeline  `[NEW]`

- **R3.1** WHEN the user clicks Send, THE SYSTEM SHALL include the chosen `mailboxId` in the
  `POST /api/emails/send` body.
- **R3.2** THE SYSTEM SHALL accept an OPTIONAL `mailboxId` in the `/api/emails/send` request
  schema; WHERE `mailboxId` is absent, THE SYSTEM SHALL preserve today behaviour (resolve the
  user first active mailbox — back-compat for any caller that does not send it).
- **R3.3** WHEN `/api/emails/send` receives a `mailboxId`, THE SYSTEM SHALL pass it to
  `deliverInteractiveEmail`, which SHALL resolve THAT specific mailbox as the sender (its
  address, display name, provider, and SMTP/credential path) instead of the first-active default.
- **R3.4** WHEN the send succeeds, THE SYSTEM SHALL persist the chosen mailbox as
  `outbound_emails.mailbox_id` and its identity as `from_address`, so the sent message is
  correctly attributed back to that box in the unified inbox (existing attribution).
- **R3.5** THE SYSTEM SHALL transport the message via the chosen mailbox correct path:
  `smtp_custom` -> that box own SMTP credentials; otherwise -> Resend with that box address as
  From (identical to the existing per-owner transport rule, just pinned to the chosen box).

### R4 — Validation and tenancy (server-authoritative)  `[NEW]`

- **R4.1** THE SYSTEM SHALL NEVER trust the client-supplied `mailboxId`; on every send it SHALL
  re-resolve the mailbox server-side and confirm it belongs to the signed-in user
  (`connected_mailboxes.user_id == authCtx.userId` AND `tenant_id == authCtx.tenantId`).
- **R4.2** IF the supplied `mailboxId` does not resolve to a mailbox owned by the current user,
  THEN THE SYSTEM SHALL reject the send with a 403 and a clear error, and SHALL NOT fall back to
  another box silently. Edge: a forged/cross-tenant `mailboxId`.
- **R4.3** IF the supplied `mailboxId` resolves to a mailbox the user owns but whose status is
  not `active` (warming-up-blocked / paused / disabled / error / revoked), THEN THE SYSTEM SHALL
  reject the send with a clear, actionable error and SHALL NOT silently send from a different
  box. Edge: chosen box revoked between composer-open and Send.
- **R4.4** THE SYSTEM SHALL keep all existing send guardrails unchanged and applied to the chosen
  box: opt-out suppression, OUTBOUND_TEST_MODE, the sending-identity gate (`evaluateSend`), the
  monthly plan limit, and the CAN-SPAM unsubscribe footer.
- **R4.5** WHERE `mailboxId` is absent AND the user has no sendable mailbox, THE SYSTEM SHALL
  return the existing "No connected mailbox — connect one in Settings" failure (unchanged).

### R5 — Never-auto-send contract  `[LOCKED]`

- **R5.1** THE SYSTEM SHALL only send on the explicit `handleSend` user action; the From choice
  SHALL NOT trigger, schedule, or pre-send anything.
- **R5.2** THE SYSTEM SHALL NOT auto-select a From that causes a send; selection only stages the
  identity for the next explicit Send.

### R6 — Design gate (G-design)  `[NEW]`

- **R6.1** THE SYSTEM SHALL render the From selector to the F1 G-design 12-item checklist
  (`_specs/inbox-design-system/design.md` section 8): tokens-only colour, one shared
  `Button`/control system, lucide-only (no emoji), type scale snaps (label 12/tertiary,
  value 13/primary), radius family, dark-mode parity, the `:focus-visible` ring,
  transitions <=150ms, and empty/one-box states covered. Records a one-line PASS/FAIL per item
  in tasks.md.

### Non-goals (explicit)

- **NG-1** THE SYSTEM SHALL NOT add per-mailbox signature, display-name editing, or per-box
  writing voice. `[HORS SCOPE -> A3 inbox-mailbox-rail-identity]`
- **NG-2** THE SYSTEM SHALL NOT add the left mailbox rail / per-box unread UI. `[HORS SCOPE -> A3]`
- **NG-3** THE SYSTEM SHALL NOT add any mailbox connect/link/OAuth flow. `[HORS SCOPE -> A1]`
- **NG-4** THE SYSTEM SHALL NOT change per-mailbox sync fan-out, refresh, reauth, or health.
  `[HORS SCOPE -> A4 inbox-multimailbox-sync]`
- **NG-5** THE SYSTEM SHALL NOT add a DB migration — `outbound_emails.mailbox_id` already exists.
- **NG-6** THE SYSTEM SHALL NOT route the composer send through the Inngest queue/worker; the
  interactive path stays `deliverInteractiveEmail`.

### Eval gate (G-eval)

**N/A.** A2 has no LLM surface — the From selector and send-identity resolution are
deterministic. No `pnpm eval:run` bar applies. (Stated explicitly per the roadmap G-eval rule.)
