# A2 — inbox-send-as · Design

Surgical change set. One new server resolver branch, one new optional request field, one new UI
control. NO migration, NO new endpoint required for the picker, NO Inngest change.

## 1. Architecture diff vs existing

What already exists (do NOT rebuild):

- `outbound_emails.mailbox_id` column + FK to `connected_mailboxes.id`
  (`src/db/schema/outbound.ts:294`); index `outbound_mailbox_idx` (`:328`).
- `deliverInteractiveEmail` writes `mailboxId: mailbox?.id` on the recorded row already
  (`src/lib/emails/deliver-interactive.ts:246`).
- The thread own mailbox is on the detail payload as
  `conversation.mailboxId/mailboxAddress/mailboxLabel`
  (`src/app/api/inbox/conversations/route.ts:205-207`; type
  `src/app/(dashboard)/inbox/_types.ts:39-41`).
- The picker data source: `GET /api/settings/mailboxes` -> `{ mailboxes }`, userId-scoped,
  ordered by `created_at` (`src/app/api/settings/mailboxes/route.ts:14-33`).
- The Inngest worker already honors a row mailboxId (`src/inngest/email-send-worker.ts:311-314`)
  — irrelevant to the composer path, kept for back-compat.

What A2 ADDS:

1. `deliverInteractiveEmail` gains an optional `mailboxId` input; `resolveOwnerMailbox` gains an
   overload that resolves a SPECIFIC owned+active mailbox, with a typed failure when the id is
   not owned or not sendable. (`src/lib/emails/deliver-interactive.ts`)
2. `/api/emails/send` request schema gains an optional `mailboxId`; the handler forwards it.
   (`src/app/api/emails/send/route.ts`)
3. The composer gains a From selector + `mailboxId` in its draft/send body.
   (`src/components/email-composer-panel.tsx`)
4. The conversation pane seeds the composer draft `mailboxId` from the thread mailbox.
   (`src/app/(dashboard)/inbox/_conversation-pane.tsx`)

Data flow (after A2):

```
[composer From selector]                      [/settings/mailboxes -> sendable list]
        | chosen mailboxId                              |
        v                                               |
handleSend -> POST /api/emails/send { ..., mailboxId } -+
        |
        v
sendEmailSchema (mailboxId optional)
        |
        v
deliverInteractiveEmail({ ..., mailboxId })
        |
        v
resolveOwnerMailbox(tenantId, ownerAppUserId, mailboxId?)
   - mailboxId given -> WHERE id=mailboxId AND user_id=owner AND tenant=tenant AND status=active
        -> not found  => typed { ok:false, code:"blocked" }  (R4.2/R4.3)
   - mailboxId absent -> today first-active resolve (unchanged, R3.2)
        |
        v
transport via that box (smtp_custom -> own SMTP; else Resend with box From)  (R3.5)
        |
        v
insert outbound_emails { mailbox_id = chosen, from_address = chosen identity }  (R3.4)
```

## 2. Data model diff

**None.** `outbound_emails.mailbox_id` already exists (`src/db/schema/outbound.ts:294`) and is
already populated (`src/lib/emails/deliver-interactive.ts:246`). No Drizzle CREATE/ALTER, no
migration, no `db:push`. (R-NG-5.)

## 3. Server change — the single injection point

### 3a. `resolveOwnerMailbox` (`src/lib/emails/deliver-interactive.ts:85-112`)

Today (verbatim shape): selects ONE row WHERE `tenantId` + `status='active'` + `userId=owner`,
`.limit(1)`. No way to pin a box.

Change: add an optional `mailboxId` param. When present, the WHERE clause becomes
`id=mailboxId AND tenantId=tenant AND userId=owner AND status='active'`. Return shape grows a
discriminator so the caller can tell apart the three outcomes:

- resolved -> the OwnerMailbox (as today)
- `mailboxId` given but no row matches -> `{ notOwnedOrInactive: true }` (R4.2/R4.3)
- `mailboxId` absent + no active box -> `null` (today behaviour -> FALLBACK_FROM path, R4.5)

The ownership+status filter is the WHOLE tenancy guarantee: a forged or cross-tenant id simply
fails the `userId`/`tenantId`/`status` predicate and returns no row. We never read the
client id without that filter. (R4.1.)

### 3b. `deliverInteractiveEmail` (`src/lib/emails/deliver-interactive.ts:123`)

- Add `mailboxId?: string | null` to `DeliverInteractiveInput` (after `ownerAppUserId`).
- Pass it into `resolveOwnerMailbox` (line 148).
- IF the caller supplied a `mailboxId` AND resolution returns `notOwnedOrInactive`, return a
  typed refusal BEFORE any transport:
  `{ ok:false, code:"blocked", error:"That mailbox is not available to send from — it may be
  disconnected or paused. Pick another." }` (R4.2/R4.3). This sits between the opt-out check
  (`:138-145`) and the sending-identity gate (`:153-162`), so all downstream guardrails (gate,
  plan limit, footer, opt-out) still apply unchanged to the resolved box (R4.4).
- The existing transport branch (`:178-230`) and the outbound insert (`:242-255`) need NO change:
  they already use the resolved `mailbox` for `useSmtp`, `fromAddress`, and `mailboxId` — pinning
  the resolved box automatically pins the transport + the recorded identity (R3.3/R3.4/R3.5).

`DeliverInteractiveResult` already has a `"blocked"` code variant (`:71`) — reuse it; no new type.

### 3c. `/api/emails/send` (`src/app/api/emails/send/route.ts`)

- Add `mailboxId: z.string().optional()` to `sendEmailSchema` (`:18-26`).
- Forward `mailboxId: parsed.mailboxId` into the `deliverInteractiveEmail({...})` call (`:67-78`).
- The existing `STATUS_BY_CODE` map (`:28-34`) already maps `"blocked"`? It does NOT — it maps
  opted_out/plan_limit/not_configured/send_failed/test_mode. A `"blocked"` result currently
  falls through to `?? 500`. Add `blocked: 403` to `STATUS_BY_CODE` so R4.2/R4.3 surface as a
  clean 403 with the message (matching the composer error banner UX).

No other caller of `deliverInteractiveEmail` (rsvp route, agent dispatcher, action-executors,
chat action — see grep) passes `mailboxId`, so they keep today first-active behaviour (R3.2).

## 4. Client change — the From selector

### 4a. `EmailComposerDraft` + send body (`src/components/email-composer-panel.tsx`)

- Extend `EmailComposerDraft` (`:17-25`) with `mailboxId?: string` (the seeded default).
- New prop on `EmailComposerPanelProps` (`:27-32`): `mailboxes: SendableMailbox[]` where
  `SendableMailbox = { id: string; address: string; label: string }`. The pane passes the
  sendable list (it already fetches `mailboxes` for the rail; reuse — see 4c).
- New state `const [fromMailboxId, setFromMailboxId] = useState<string | undefined>(...)` seeded
  by `pickDefaultFrom(draft.mailboxId, mailboxes)` (pure helper, see 4d).
- `handleSend` (`:373-428`) adds `mailboxId: fromMailboxId` to the POST body (`:394-402`).
  No change to the never-auto-send flow (R5).

### 4b. The From row UI

A new row rendered ABOVE the To field (`:494`), matching the existing field rows
(`EmailField` at `:99-134` is the visual template: `px-4 py-2`, 0.5px bottom border, a
`w-12` 12px tertiary label, a 13px primary value). Three render modes:

- many sendable boxes -> a `<select>`-equivalent built from the shared `Button`
  (`variant="ghost"`, `ChevronDown` from lucide already imported at `:5`) opening a
  token-styled menu (copy the menu pattern already in this file, `:561-600`, so we reuse one
  button system, one radius, tokens-only — G-design item 3).
- exactly one box -> a static label (no chevron, not clickable). (R1.2)
- zero boxes -> a muted "No sendable mailbox — connect one in Settings" hint. (R1.3)

Display string per option: `label` when it differs from `address`, else `address`; show
`label <address>` in the open menu rows (R1.1). lucide-only, no emoji (G-design item 10).

### 4c. Wiring in the conversation pane (`src/app/(dashboard)/inbox/_conversation-pane.tsx`)

- The pane already receives `mailboxes` from the conversations payload
  (`src/app/api/inbox/conversations/route.ts:212`) — but that list is the READ-scope (own +
  shared, including non-sendable). For SEND it must be the user own SENDABLE boxes. Fetch the
  sendable set once from `GET /api/settings/mailboxes` (`route.ts:14-33`) and filter
  `status === "active"` client-side, memoized. Pass that to `<EmailComposerPanel mailboxes=...>`
  (`:982`).
- Seed the reply default: each `setComposer({...})` site that builds a reply
  (`:251,:261,:280,:288,:314,:323,:327`) adds `mailboxId: detail.conversation.mailboxId ?? undefined`.
  `pickDefaultFrom` (4d) downgrades that to the primary box if it is not in the sendable list
  (R2.3/R2.4). New-compose entry points (outside the pane) pass no `mailboxId` -> primary default
  (R2.2).

### 4d. Pure default-picker helper (new, `src/lib/inbox/pick-from-mailbox.ts`)

```
pickDefaultFrom(preferredId: string | undefined, sendable: SendableMailbox[]): string | undefined
  - if preferredId is in sendable -> preferredId            (R2.1)
  - else if sendable.length > 0   -> sendable[0].id         (R2.2/R2.3/R2.4 — primary = first,
                                                              list arrives created_at-ordered)
  - else                          -> undefined              (R1.3 / R4.5 server gate)
```

Pure + DB-free -> unit-tested without a DOM, same style as `resolveMailboxShortcut`
(`src/lib/inbox/mailbox-switch.ts:11`) and `attributeMailbox`
(`src/lib/inbox/mailbox-attribution.ts:72`).

## 5. Orchestration (Inngest)

**None.** The composer send is the interactive path (`deliverInteractiveEmail`), not the queue.
The worker (`src/inngest/email-send-worker.ts`) is untouched and already honors a row mailboxId
(`:311-314`) for the queued/sequence path. (R-NG-6.)

## 6. Integrations — confirm vs locked stack

- Transport: Resend (OAuth/read-only boxes) + nodemailer SMTP (`smtp_custom`) via
  `sendViaSmtp` — unchanged, the chosen box just selects which one. `[LOCKED]`
- Auth: next-auth v5 `getAuthContext` / `requireCapabilityForRequest` — unchanged, still gates
  `outbound:send` (`src/app/api/emails/send/route.ts:44`). `[LOCKED]`
- No new dependency, provider, table, or env var.

## 7. Guardrails (one line each)

- Client `mailboxId` is NEVER trusted — server re-resolves with `user_id`+`tenant_id`+`status='active'` (R4.1).
- A non-owned / cross-tenant id returns 403, never a silent fallback box (R4.2).
- A non-active owned box (paused/disabled/revoked/warming) returns a clear 403, never a wrong-From send (R4.3).
- Opt-out, OUTBOUND_TEST_MODE, `evaluateSend`, plan limit, CAN-SPAM footer all still apply to the chosen box (R4.4).
- `mailboxId` is optional end-to-end — absent keeps today first-active behaviour (R3.2).
- No migration: `outbound_emails.mailbox_id` already exists (NG-5).
- No Inngest/queue change: composer stays on the interactive path (NG-6).
- From choice never sends — only the explicit `handleSend` does (R5).
- Selector passes the F1 G-design 12-item checklist; tokens-only, one Button system, lucide-only (R6.1).

## 8. G-design acceptance gate (per F1 design.md section 8)

Recorded per-item PASS/FAIL in tasks.md (B6). The From row reuses the existing field-row tokens
and the existing menu/button pattern in `email-composer-panel.tsx`, so items 1-7,9-11 inherit
the file current passing state; items 8 (contrast on the muted hint) and 12 (one-box static +
zero-box empty states) are the A2-specific checks.

## 9. G-eval

**N/A** — no LLM surface in A2. Deterministic selector + resolver. (Per roadmap G-eval rule.)
