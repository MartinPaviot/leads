# LINKEDIN-INBOUND — capture inbound LinkedIn replies into the inbox

> **Why.** LinkedIn is Elevay's **primary** channel (memory `prod-readiness-and-channel`). Once the autopilot sends on LinkedIn, replies arrive on LinkedIn — and today they are **silently dropped**. This is the prerequisite review surface for any LinkedIn-led autonomy: without it, turning the autopilot on the primary channel loses inbound.
>
> **Status: BLOCKED on a live Unipile inbound source.** Grounded against `main` (cadrage workflow, 2026-06-26). The decisive finding below: there is no inbound LinkedIn message source wired, and wiring one needs live Unipile credentials + API wire-format verification (a human-in-the-loop first-live-action). Everything downstream is precisely designed and ready to build; it lands in one piece once the source exists.

---

## 1. The gating finding — no inbound source exists
## THE gating answer: NO real inbound LinkedIn message source is wired or available

There is **no inbound LinkedIn message source in the codebase** — neither a Unipile messaging webhook nor a message poll. Full ingestion is **NOT buildable this cycle**; only the plumbing is.

Proof (current `leads` repo; the area maps cite the parallel `leads-li` worktree — identical code):

1. **The Unipile client is send-only.** `UnipileClient` (`app/apps/web/src/lib/providers/unipile/client.ts:86-90`) declares exactly three methods — `sendInvitation`, `startNewChat`, `sendMessage`. There is **no** `listChats` / `listMessages` / `getMessages`. The live impl (`lib/providers/unipile/messaging-client.ts:56-74`) implements only those three POSTs (`/users/invite`, `/chats`, `/chats/{id}/messages`).
2. **The HTTP layer has no chat/message read endpoint.** `lib/providers/unipile/http.ts` exposes `createHostedAuthLink` (99), `getUnipileAccount` health probe (113), `getUnipileUserProfile` resolve (133), `searchLinkedIn` (180), `listUnipileRelations` (219). No `GET /chats` or `GET /chats/{id}/messages`.
3. **The only Unipile webhook handles account status, not messages.** `app/api/linkedin/unipile/account-webhook/route.ts:35-71` branches on `AccountStatus` and hosted-auth `status` (CREATION_SUCCESS / RECONNECTED / terminal) to flip `linkedin_account.status`. There is **no `message_received` / messaging-event branch**, and the route's doc header (lines 10-12) lists only the two account-status payload shapes.
4. **No message poll cron.** Grep of `app/apps/web/src/inngest/**` for LinkedIn shows only role-verify (`linkedin-role-verify.ts`), sourcing (`campaign-functions.ts`), and scoring (`signal-score-daily.ts`) — all outbound/enrichment. Nothing reads inbound chats.
5. **`notify_url` is registered for account status only.** `toHostedAuthBody` (`http.ts:61-74`) sets `notify_url` on the hosted-auth link (account lifecycle). Unipile's separate messaging subscription (`POST /webhooks` with `source: "messaging"`) is never created anywhere.

### What must exist first (the actual "L", not this cycle)
- **A read primitive**: add `listChats` / `listChatMessages` to `UnipileClient` (client.ts:86) + `messaging-client.ts` + `http.ts` (`GET /chats`, `GET /chats/{id}/messages`), with the exact wire shape confirmed against the live API (a T12-style first-live-action — the codebase already flags Unipile wire formats as "documented but not runtime-verified", messaging-client.ts:9-10).
- **A source, one of:**
  - **Webhook (real-time, mirrors EmailEngine `messageNew`)**: register a Unipile messaging webhook at connect time + a new route `app/api/linkedin/unipile/message-webhook/route.ts` that verifies the token, resolves tenant by `linkedin_account.unipileAccountId`, drops our own echoes, and calls the capture fn; OR
  - **Poll cron (mirrors `cronSyncEmails`)**: a new `inngest/linkedin-sync.ts` every 5 min per connected seat, paging `GET /chats` since a stored cursor → `GET /chats/{id}/messages` → capture each inbound.

Both require live Unipile verification and credentials, so they are out of a single buildable slice. The honest move is to build the **downstream plumbing behind a flag** so that wiring either source later is a thin adapter calling one capture function.

---

## 2. End-to-end design (grounded in the email-inbound template)
## End-to-end LinkedIn-inbound design, grounded in the email-inbound template

The email path is: **source → `captureInboundEmail` (one seam) → one `activities` row (`channel='email'`, `activityType='email_received'`) → `loadConversationRows` predicate → per-user scoping → `buildConversations`**. LinkedIn mirrors it exactly, with a `linkedin` channel and a `linkedin_message_received` type, plus a LinkedIn-account scoping identity in place of the mailbox `to` match.

### 1. SOURCE (to-be-built — see sourceVerdict; named here for completeness)
- **Read primitive** — add `listChats` / `listChatMessages` to `UnipileClient` (`lib/providers/unipile/client.ts:86`), `messaging-client.ts:56`, and `http.ts` (`GET /chats`, `GET /chats/{id}/messages`).
- **Real-time** — `app/api/linkedin/unipile/message-webhook/route.ts` (new), modeled on `account-webhook/route.ts`: `verifyWebhookToken` (http.ts:236) → resolve tenant via `linkedin_account.unipileAccountId` (mirror account-webhook.ts:48) → skip outbound echoes → call `captureInboundLinkedIn`. Subscription registered by a new `createMessagingWebhook(cfg, …)` in `http.ts`, called from `app/api/linkedin/connect/route.ts` after CREATION_SUCCESS.
- **OR poll** — `inngest/linkedin-sync.ts` (new) every `*/5 * * * *` per `status='connected'` `linkedin_account`, paging chats since a stored cursor → each inbound message → `captureInboundLinkedIn`. (Mirrors `inngest/sync-functions.ts:880` `cronSyncEmails`.)

### 2. CAPTURE — one new seam, mirroring `captureInboundEmail`
**New file `app/apps/web/src/lib/capture/linkedin-capture.ts`** → `captureInboundLinkedIn(input)`, structured exactly like `email-capture.ts:196`:
- Input: `{ tenantId, linkedinAccountId, providerId (sender ACoAA…), profileUrl, chatId, text, providerMessageId, occurredAt, senderName }`.
- **Dedup**: `SELECT activities WHERE tenantId AND channel='linkedin' AND metadata->>'providerMessageId' = ?` (mirror email-capture.ts:217-229, swap `channel='email'`→`'linkedin'` and `messageId`→`providerMessageId`). Duplicate → `{captured:false, reason:"duplicate"}`.
- **Attribution (CRM-graph rule)**: resolve `contacts` via `linkedin_provider_identity.providerId → contactId` (`db/schema/linkedin.ts:84`) first, else `contacts.linkedinUrl = linkedinPath(profileUrl)` (normalize via `db/canonical/identity.ts`). No domain exists for LinkedIn, so **skip auto-create** in the slice (email's company-domain auto-create at email-capture.ts:287-305 has no LinkedIn analog) → `entityType='contact'` when known, else `'unassigned'`.
- **Write via `recordCapturedActivity`** (`lib/capture/approval.ts:80`) — channel-agnostic, respects the tenant auto/review gate unchanged.
- **Side effect**: upsert `linkedin_provider_identity.chatId` (linkedin.ts:97) so a later reply rides the same chat.

### 3. ROWS WRITTEN — one `activities` row (same table as inbound email)
`activities` (`db/schema/core.ts:284`), exact fields:
- `channel: "linkedin"` (NEW enum value — see §5), `direction: "inbound"` (core.ts:295, exists).
- **`activityType: "linkedin_message_received"`** (NEW enum value) ← the field the read-model keys on.
- `threadId: chatId` (core.ts:301) → conversation grouping works.
- `actorType:"contact"`, `actorId: contact?.id ?? null`, `entityType/entityId` per attribution.
- `summary`: first line of text; `rawContent`: full text (core.ts:299).
- `metadata` JSONB (core.ts:297): `{ channel:"linkedin", providerMessageId, chatId, providerId, profileUrl, senderName, from: senderName/profileUrl, linkedinAccountId }` — LinkedIn fields mapped into the **same metadata keys** `conversations.ts:390-409` already reads (`from`, body via `rawContent`).
- Optional: upsert `linkedin_provider_identity.chatId`. **No new table** — inbound email already proves the activities-row pattern; `linkedin_action_event` (linkedin.ts:146) stays outbound-only.

### 4. INBOX READ-MODEL change
- **Loader** `lib/inbox/load.ts:50` — broaden the predicate from `eq(activities.activityType,"email_received")` to `inArray(activities.activityType,["email_received","linkedin_message_received"])` (import `inArray`). `contactId` derivation (load.ts:99) already handles `entityType==='contact'`.
- **Per-user scoping** `lib/inbox/user-scope.ts` — the gate is email-only: `inboundBelongsToUser` (user-scope.ts:146) matches `metadata.to` against `scope.addresses`; a LinkedIn row has no `metadata.to` → invisible. Fix: add `linkedinAccountIds: Set<string>` + `hasLinkedin` to `InboxScope` (user-scope.ts:27), populate in `getInboxScope` (user-scope.ts:95) from `linkedin_account WHERE tenantId AND userId=authUserId AND status='connected'`, and branch `inboundBelongsToUser`: if `metadata.channel==='linkedin'` → `scope.linkedinAccountIds.has(String(metadata.linkedinAccountId))`, else the email path. Relax the early return at `user-scope.ts:167` to `hasMailbox || hasLinkedin` so a LinkedIn-only user still sees their inbox.
- **Assembly** `lib/inbox/conversations.ts:262` `buildConversations` — channel-agnostic; groups by `threadId`(=chatId)/contact (conversations.ts:227-231). Message rendering (conversations.ts:390-409) reads `metadata.from`/`rawContent` → populated above. The `classifyInboundSender({fromHeader})` gate (conversations.ts:326-328) keys on an email From header; a LinkedIn message (no From) classifies as non-automated → attention lane (acceptable). Optional: thread `channel:"linkedin"` onto the rendered message for a future glyph.

### 5. ENUMS + migration
- `db/schema/enums.ts:48` (`channelEnum`) — add `"linkedin"`.
- `db/schema/enums.ts:17` (`activityTypeEnum`) — add `"linkedin_message_received"`.
- New SQL migration (e.g. `db/migrations/00NN_linkedin_inbound.sql`): `ALTER TYPE channel ADD VALUE IF NOT EXISTS 'linkedin'; ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'linkedin_message_received';`. `ADD VALUE` can't run in a txn and the custom runner stops at idx 12 → apply via `pnpm db:push` on `leadsens-localdev`; for prod use `DATABASE_URL_OWNER` (per the always-apply-migrations rule). `directionEnum` already has `inbound` — no change.

### Files/tables/enums touched (named)
Schema: `db/schema/enums.ts` (channel + activity_type), `db/schema/linkedin.ts` (`linkedin_provider_identity.chatId` upsert) · new migration. Tables written: `activities` (the one landing table). Capture: new `lib/capture/linkedin-capture.ts`, reusing `lib/capture/approval.ts`. Read: `lib/inbox/load.ts`, `lib/inbox/user-scope.ts`, `lib/inbox/conversations.ts`. Source (deferred): `lib/providers/unipile/{client,messaging-client,http}.ts`, `app/api/linkedin/unipile/message-webhook/route.ts`, `app/api/linkedin/connect/route.ts`, `inngest/linkedin-sync.ts`.

---

## 3. Buildable slice (when we proceed) vs the deferred source
## The honest buildable SLICE for this cycle: the plumbing, behind a flag

**No inbound LinkedIn source exists** (see sourceVerdict), so this cycle does **not** ship the full L. It ships everything *downstream* of the source — the enum, the capture function, and the read-model — fully testable, so that when a real Unipile messaging webhook/poll is wired later it is a thin adapter that calls one function. Stated plainly: **this is the pipe, not the water.**

### In the slice (buildable + testable now, no live Unipile call)
1. **Enums + migration** — add `linkedin` to `channelEnum` and `linkedin_message_received` to `activityTypeEnum` (`db/schema/enums.ts`); apply `ALTER TYPE … ADD VALUE` via `db:push` on `leadsens-localdev`.
2. **Capture seam** — new `lib/capture/linkedin-capture.ts` `captureInboundLinkedIn(input)`, a structural mirror of `captureInboundEmail` (email-capture.ts:196): dedup on `channel='linkedin'` + `metadata.providerMessageId`, contact resolution via `linkedin_provider_identity` / `contacts.linkedinUrl`, write one `activities` row through `recordCapturedActivity` (approval.ts:80), upsert `chatId`. Pure inputs, DB-tested.
3. **Read-model** — broaden `load.ts:50` to `inArray([...,"linkedin_message_received"])`; add `linkedinAccountIds`/`hasLinkedin` to `InboxScope` + a channel-aware branch in `inboundBelongsToUser` (user-scope.ts:146) and the `scopeConversationRows` early-return (user-scope.ts:167). Unit-tested without a DB.
4. **Flag** — `LINKEDIN_INBOUND_ENABLED`. Enum values exist always (harmless), but the `load.ts` predicate only includes `linkedin_message_received` when the flag is on → dark-launch; flip on once a source is wired.
5. **Exercise entrypoint** — new `app/api/test-e2e/capture-linkedin/route.ts` (mirror the existing `app/api/test-e2e/capture-inbound/route.ts`, non-prod gated) so the whole capture→row→read→render path is provable end-to-end against a synthetic message, with zero live Unipile dependency.

### Explicitly NOT in the slice (the deferred source — the real L)
- Unipile read primitives (`listChats`/`listChatMessages` on `client.ts`/`messaging-client.ts`/`http.ts`).
- The messaging webhook subscription + `app/api/linkedin/unipile/message-webhook/route.ts`, OR the `inngest/linkedin-sync.ts` poll cron.
- Live API wire-format verification (T12-style) + reply-attribution against outbound `linkedin_action_event`.

These need live credentials and runtime verification and so cannot be honestly called "done" in one cycle. The slice is designed so they bolt on as a single `captureInboundLinkedIn(...)` call site.

### Why this slice is the right altitude
The capture seam, approval gate, dedup, RAG ingest, lane assembly and the inbox route are all **already channel-agnostic** once a correctly-typed, correctly-scoped row lands. The slice removes the three email-only blockers (no channel/type enum value, email-only loader predicate, mailbox-`to` scoping) — which is the entire downstream cost — and leaves only the source adapter, which is genuinely external work.

---

## 4. Implementation plan
Ordered, implementable tasks for the slice. Format: **file:line | change | test**. Run from `app/apps/web` unless noted.

### T1 — Enums + migration
- `db/schema/enums.ts:48` | add `"linkedin"` to `channelEnum` | `pnpm tsc` clean.
- `db/schema/enums.ts:17` | add `"linkedin_message_received"` to `activityTypeEnum` | `pnpm tsc` clean.
- new `db/migrations/00NN_linkedin_inbound.sql` | `ALTER TYPE channel ADD VALUE IF NOT EXISTS 'linkedin'; ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'linkedin_message_received';` | apply with `pnpm db:push` on `leadsens-localdev`; verify `SELECT enum_range(NULL::channel)` contains `linkedin`. (Don't auto-migrate prod; runner stops at idx 12.)

### T2 — Capture function
- new `lib/capture/linkedin-capture.ts` | export `captureInboundLinkedIn(input: InboundLinkedInInput): Promise<InboundCaptureResult>` mirroring `email-capture.ts:196`. Dedup: `SELECT activities WHERE tenantId AND channel='linkedin' AND metadata->>'providerMessageId' = ?` (mirror email-capture.ts:217-229). Contact: `linkedin_provider_identity.providerId→contactId` (linkedin.ts:84-95) else `contacts.linkedinUrl = linkedinPath(profileUrl)` (db/canonical/identity.ts). Build activity `{activityType:'linkedin_message_received', channel:'linkedin', direction:'inbound', threadId:chatId, summary, rawContent:text, metadata:{channel:'linkedin', providerMessageId, chatId, providerId, profileUrl, senderName, from:senderName, linkedinAccountId}}`; persist via `recordCapturedActivity` (approval.ts:80). Upsert `linkedin_provider_identity.chatId`. | new `lib/capture/__tests__/linkedin-capture.test.ts` (Vitest): (a) inserts one `activities` row with `channel='linkedin'`/`activityType='linkedin_message_received'`; (b) repeat same `providerMessageId` → `{captured:false, reason:'duplicate'}`; (c) resolves contact by `linkedinUrl`; (d) unknown sender → `entityType='unassigned'`, still captured.

### T3 — Read-model predicate (flagged)
- `lib/inbox/load.ts:50` | replace `eq(activities.activityType,"email_received")` with `inArray(activities.activityType, INBOUND_TYPES)` where `INBOUND_TYPES = process.env.LINKEDIN_INBOUND_ENABLED ? ["email_received","linkedin_message_received"] : ["email_received"]`; import `inArray` from `drizzle-orm` | extend `lib/inbox/__tests__` (or load test): with flag on + a `linkedin_message_received` fixture, `loadConversationRows` returns it; flag off → excluded.

### T4 — Per-user scoping
- `lib/inbox/user-scope.ts:27` | add `linkedinAccountIds: Set<string>` and `hasLinkedin: boolean` to `InboxScope` | tsc.
- `lib/inbox/user-scope.ts:95` (`getInboxScope`) | also query `linkedin_account WHERE tenantId AND userId=authUserId AND status='connected'` → populate `linkedinAccountIds`/`hasLinkedin`; update `buildScopeFromRows` (user-scope.ts:55) + the empty-scope literal (user-scope.ts:99) | tsc.
- `lib/inbox/user-scope.ts:146` (`inboundBelongsToUser`) | branch: `if (row.metadata?.channel === 'linkedin') return scope.linkedinAccountIds.has(String(row.metadata?.linkedinAccountId)); ` else existing `metadata.to` path | unit test: LinkedIn row with owner's `linkedinAccountId` passes; foreign id filtered; email rows unaffected.
- `lib/inbox/user-scope.ts:167` | early return `if (!scope.hasMailbox && !scope.hasLinkedin) return {inbound:[],outbound:[],triage:rows.triage}` | test: LinkedIn-only user (no mailbox) still sees their LinkedIn rows.

### T5 — Rendering (light)
- `lib/inbox/conversations.ts:390-409` | ensure a LinkedIn message renders from `metadata.from`(senderName)/`rawContent` (no email subject/From) without crashing; optionally set `channel:'linkedin'` on the rendered message | test: `buildConversations` with a LinkedIn inbound fixture groups by `chatId` and renders the body; lands in attention lane.

### T6 — Exercise entrypoint (non-prod)
- new `app/api/test-e2e/capture-linkedin/route.ts` | mirror `app/api/test-e2e/capture-inbound/route.ts` (same non-prod guard); POST body → `captureInboundLinkedIn` | manual: POST a synthetic message → row appears → flag on → visible in `/api/inbox/conversations` for the seat owner. Covered by an e2e/integration test if the sibling has one.

### T7 — Verify + commit
- `pnpm test` + `pnpm tsc` + `pnpm lint` green | commit each logical unit separately (enum+migration / capture / read-model / scoping / entrypoint) per the one-logical-change rule. Branch `feat/linkedin-inbound`.

---

## 5. Summary
No inbound LinkedIn message source exists in the code: the Unipile client is send-only (`client.ts:86-90` — `sendInvitation`/`startNewChat`/`sendMessage`, no message read), `http.ts` has no chat/message GET, the only webhook (`account-webhook/route.ts`) handles account-status not messages, and no poll cron reads chats. So full L ingestion is NOT buildable this cycle — only the plumbing is. The recommended slice is the downstream pipe behind `LINKEDIN_INBOUND_ENABLED`: add a `linkedin` channel + `linkedin_message_received` activity_type enum, a `captureInboundLinkedIn` seam mirroring `captureInboundEmail` that writes one `activities` row, broaden the loader predicate (`load.ts:50`), and add a LinkedIn-account scoping branch to `user-scope.ts:146` (the email `metadata.to` gate would otherwise hide every LinkedIn row). A non-prod `capture-linkedin` route exercises the whole path with no live Unipile dependency. Biggest risk: the deferred source itself — Unipile's message read/webhook wire formats are documented-but-unverified in this repo (messaging-client.ts:9-10), so wiring the real source later still needs a live first-action verification and credentials; the slice is structured so that source bolts on as a single call site.

---

> **Bolt-on point.** The slice is structured so the deferred source (Unipile read primitive + messaging webhook **or** poll cron) attaches as a single `captureInboundLinkedIn(...)` call site. The capture seam, approval gate, dedup, lane assembly, and inbox route are already channel-agnostic once a correctly-typed, correctly-scoped row lands.
