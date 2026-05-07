# SENDING-002 — Instantly Send Routing: Tasks

Eval-first. Each task ships independently and is verifiable on staging before the next.

---

## Task 1: Schema migration — add `transport`, `providerMessageId`, `transportAttempts`, `instantlyAccountId`
**Estimate:** 0.5h
**Eval:** Drizzle migration generates and applies cleanly. Existing rows get `transport = 'resend'` default.
**Implementation:** Add columns per `design.md` "Data model deltas".
**Verify:** `pnpm --filter web drizzle-kit push` then `select transport, count(*) from outbound_emails group by transport` returns existing rows on `'resend'`.

---

## Task 2: Define `Transport` interface and registry skeleton
**Estimate:** 1h
**Eval:** `apps/web/src/__tests__/transport-registry.test.ts`
- `selectTransport({intent: 'warmup'})` returns `{primary: mailbox-direct, fallbacks: []}`
- `selectTransport({intent: 'reply'})` returns mailbox-direct primary
- `selectTransport({intent: 'transactional'})` returns resend primary
- `selectTransport({intent: 'cold', tenant has Instantly})` returns instantly primary, managed-pool fallback (stubbed available=false for now)
- `selectTransport({intent: 'cold', tenant has nothing})` returns empty plan (no available transport)
- `selectTransport({intent: 'follow_up', last touchpoint via instantly})` returns instantly sticky
**Implementation:**
1. Create `apps/web/src/lib/transports/types.ts` with the interface.
2. Create `apps/web/src/lib/transports/registry.ts` with the routing logic, using stubs for each transport.
3. Stub transports return `isAvailableFor` results based on tenant fixtures.
**Verify:** `pnpm vitest run transport-registry`

---

## Task 3: Refactor existing Resend send into `ResendTransport`
**Estimate:** 1.5h
**Eval:** `apps/web/src/__tests__/transport-resend.test.ts`
- `ResendTransport.isAvailableFor({intent: 'transactional'})` returns true always
- `ResendTransport.isAvailableFor({intent: 'cold'})` returns false (per AC-10)
- `ResendTransport.send(validPayload)` calls Resend API and returns `{ok: true, providerMessageId}`
- All existing transactional emails (welcome, password reset) keep working — regression test on existing flows
**Implementation:**
1. Create `apps/web/src/lib/transports/resend.ts` wrapping current Resend logic from `email-send-worker.ts`.
2. Refactor `email-send-worker.ts` to call `ResendTransport.send()` for transactional intent.
3. Remove the `FALLBACK_FROM = "Elevay <outbound@resend.dev>"` use for cold intent — fail explicitly per AC-10.
**Verify:** `pnpm vitest run transport-resend`; manually trigger a welcome email on staging.

---

## Task 4: `MailboxDirectTransport` for warmup + reply intents
**Estimate:** 3h
**Eval:** `apps/web/src/__tests__/transport-mailbox-direct.test.ts`
- For Gmail-OAuth mailbox, `send()` uses the Gmail API (mocked) and returns success
- For Outlook-OAuth, uses Microsoft Graph (mocked)
- For custom-SMTP, uses nodemailer SMTP transport (mocked)
- `isAvailableFor({intent: 'warmup', mailboxId})` returns true if mailbox has valid credentials
- `isAvailableFor({intent: 'reply', mailboxId})` returns true if mailboxId matches the original thread
- OAuth token expired returns `{ok: false, error: {code: 'auth_expired', retryable: false}}`
**Implementation:** `apps/web/src/lib/transports/mailbox-direct.ts`. Reuse OAuth helpers already in the codebase for Gmail/Outlook.
**Verify:** `pnpm vitest run transport-mailbox-direct`

---

## Task 5: `InstantlyTransport` — full send path
**Estimate:** 4h
**Eval:** `apps/web/src/__tests__/transport-instantly.test.ts`
- `isAvailableFor({intent: 'cold', tenantId})` queries `connectedMailboxes` for Instantly provider with valid creds
- `send(payload)` builds correct Instantly API request: campaign assignment, account selection, headers preserved, tracking pixel + footer NOT stripped
- Successful send returns `{ok: true, providerMessageId, sentAt}`
- API 4xx returns `{ok: false, retryable: false, error}`
- API 429 returns `{ok: false, retryable: true, error: {code: 'rate_limited'}}` with `retryAfter` parsed from header
- API timeout returns `{ok: false, retryable: true}`
**Implementation:**
1. Extend `apps/web/src/lib/providers/instantly-client.ts` with `sendEmail()` method.
2. Create `apps/web/src/lib/transports/instantly.ts` wrapping the client.
3. Map Elevay's intent metadata to Instantly campaign/account selection logic.
**Verify:** `pnpm vitest run transport-instantly`; smoke test on staging with real Instantly sandbox.

---

## Task 6: Refactor `email-send-worker.ts` to dispatch via registry
**Estimate:** 3h
**Eval:** `apps/web/src/__tests__/email-send-worker-routing.test.ts`
- Cold intent with Instantly available routes through Instantly
- Cold intent with no providers fails with `blocked_no_transport`
- Warmup intent always routes through mailbox-direct
- Reply intent routes through the original thread's mailbox
- All sends, regardless of transport, get tracking pixel + footer + unsubscribe header (regression)
- `pipelineEvents` records `transport_selected` with the chosen transport and reason
- `transportAttempts` JSON on `outboundEmails` records each attempt with timestamp + ok flag
**Implementation:** Refactor per `design.md` "email-send-worker.ts refactor" pseudocode.
**Verify:** `pnpm vitest run email-send-worker-routing`. Then on staging: send 5 cold emails, verify they go via Instantly (check Instantly dashboard for outgoing).

---

## Task 7: Fallback chain with retry budget
**Estimate:** 2h
**Eval:** `apps/web/src/__tests__/email-send-worker-fallback.test.ts`
- Primary returns `retryable: true` → fallback transport called
- All transports in chain return retryable failure → email marked `failed_all_transports` after max 2 attempts
- Primary returns `retryable: false` → fallback NOT called, fail immediately
- Successful fallback records both attempts in `transportAttempts`
**Implementation:** Extend the worker dispatch loop with the retry/fallback logic.
**Verify:** `pnpm vitest run email-send-worker-fallback`

---

## Task 8: Webhook handler `/api/webhooks/instantly`
**Estimate:** 2h
**Eval:** `apps/web/src/__tests__/webhook-instantly.test.ts`
- Valid signature + bounce event → increments `connectedMailboxes.bounceCount7d`, inserts `emailOptouts` row for hard bounce, triggers SENDING-001 health check
- Valid signature + complaint event → increments `spamComplaints7d`, inserts opt-out row
- Invalid signature → 401, logs to security audit
- Webhook for unknown providerMessageId → retries 3x with backoff, then writes to dead-letter
- Idempotent: same event delivered twice doesn't double-increment counters
**Implementation:**
1. Create `apps/web/src/app/api/webhooks/instantly/route.ts`.
2. HMAC verification with per-tenant secret stored in `connectedMailboxes.webhookSecret` (new column or reuse existing key field).
3. Event handlers: `email.bounced`, `email.complained`, `email.delivered`, `email.opened` (the last two also feed `pipelineEvents`).
**Verify:** `pnpm vitest run webhook-instantly`; force a bounce on staging.

---

## Task 9: Settings UI — `/settings/sending`
**Estimate:** 3h
**Eval:** Manual visual + interaction test (Playwright e2e: `apps/web/tests/e2e/settings-sending.spec.ts`)
- User can land on `/settings/sending` and see "Resend (always-on)" + "Instantly (Connect)" cards
- Clicking "Connect Instantly" opens API key form
- Submitting valid key calls `validateCredentials`, shows success, persists encrypted, redirects to provider list
- Invalid key shows inline error, does not persist
- After connection, the card shows: account name, today's volume, 7d bounce rate, last error if any
- "Disconnect" button removes the credentials and reverts cold sends to no-transport state (with warning)
**Implementation:**
1. New route `apps/web/src/app/(dashboard)/settings/sending/page.tsx`.
2. Server actions for connect/disconnect/test.
3. Component `apps/web/src/components/sending-providers-panel.tsx`.
**Verify:** `pnpm --filter web playwright test settings-sending`; visual inspection.

---

## Task 10: Observability — per-transport metrics
**Estimate:** 1.5h
**Eval:** `apps/web/src/__tests__/transport-metrics.test.ts`
- `pipelineEvents` queries can roll up volume + success rate by transport over a time window
- Dashboard tile renders the metrics correctly
- Sentry captures non-retryable errors with `transport`, `intent`, `errorCode` tags
**Implementation:**
1. Server-side aggregation helper `apps/web/src/lib/analytics/transport-metrics.ts`.
2. Add tile to settings/sending page.
3. Verify Sentry tagging on errors.
**Verify:** `pnpm vitest run transport-metrics`; trigger a few sends + a failure on staging, check Sentry events.

---

## Task 11: Phase 6 eval — end-to-end real-world test
**Estimate:** 1 day
**Eval:** Per requirements.md "Evaluation steps".
**Pass criterion:** all 50 sends succeed via Instantly, all tracking events flow, all failure modes produce structured errors, zero Resend fallbacks for cold intent.

---

## Sprint sequencing
- Tasks 1, 2, 3: parallelizable, day 1.
- Tasks 4, 5: parallelizable, days 2-3.
- Task 6: integration day 4.
- Tasks 7, 8: parallel days 5-6.
- Task 9, 10: parallel day 7.
- Task 11: day 8 (Phase 6).

**Total:** ~21h engineering + 1 day eval. Realistic 1.5-week sprint or 1-week with two engineers.
