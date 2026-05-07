# SENDING-002 — Instantly Send Routing: Requirements

## Audit pillar
Sending infrastructure / Cold sending readiness (Blocker #1 from the codebase audit, complementary to SENDING-001).

## Problem statement
`apps/web/src/lib/providers/instantly-client.ts` exists with credential validation but no send dispatch path. `apps/web/src/inngest/email-send-worker.ts` defaults to Resend with `FALLBACK_FROM = "Elevay <outbound@resend.dev>"`. Tenants with valid Instantly credentials cannot send through Instantly today; cold sends fall back to a useless test domain. The system needs a transport-agnostic dispatcher with Instantly as the first non-default transport.

## Acceptance criteria (EARS notation)

### AC-1: Transport interface defined
WHEN a developer wires a new transport,
the codebase SHALL expose a `Transport` interface with the contract:
```typescript
interface Transport {
  id: 'resend' | 'instantly' | 'mailbox-direct' | 'smartlead'
  isAvailableFor(tenantId, mailboxId, intent): Promise<boolean>
  send(payload: OutboundPayload): Promise<TransportResult>
  reportBounce?(messageId): Promise<void>
  reportComplaint?(messageId): Promise<void>
}
```
AND there SHALL be a registry that resolves the active transport per (tenant, mailbox, intent) tuple.

### AC-2: Routing rules per intent
WHEN the email-send-worker dispatches an email with intent X,
the transport SHALL be selected per this rule table:

| Intent | Primary Transport | Fallback |
|---|---|---|
| `warmup` | mailbox-direct (OAuth SMTP) | none — fail and pause warmup |
| `reply` | mailbox-direct (must match thread origin) | none — fail with `cannot_reply_from_different_mailbox` |
| `transactional` | resend | none |
| `cold` | instantly (if tenant has connected) → managed-pool (SENDING-003) → block | fallback chain |
| `follow_up` | same as last touchpoint of the sequence (sticky) | sticky fallback |

### AC-3: Instantly transport implements Transport
WHEN `cold` or `follow_up` intent is dispatched and tenant has `connectedMailboxes` row with `provider = 'instantly'` and valid credentials,
the Instantly transport SHALL:
- Map Elevay's outbound payload to Instantly's API request format
- Submit via Instantly's send API (POST `/v2/emails`)
- Persist the returned Instantly message ID to `outboundEmails.providerMessageId`
- Return `TransportResult { ok: true, providerMessageId, sentAt }` on 2xx
- Return `TransportResult { ok: false, error, retryable }` on failure with structured error

### AC-4: Tracking pixel + click rewriting still apply
WHEN any transport sends an email,
the existing tracking pixel injection and click rewriting in `email-send-worker.ts` SHALL still execute on the payload BEFORE handing to the transport,
AND the open-tracking and click-tracking endpoints (`/api/track/open`, `/api/track/click`) SHALL continue to receive events regardless of transport.

### AC-5: Unsubscribe + CAN-SPAM compliance unchanged
WHEN a transport sends an email,
the One-Click Unsubscribe header (RFC 8058), the unsubscribe link in the body, and the CAN-SPAM footer with physical address SHALL be present REGARDLESS of which transport handles the send.
This MUST be enforced at the email-send-worker level, not delegated to the transport.

### AC-6: Bounce + complaint webhooks
WHEN Instantly's webhook fires for a bounce or complaint event,
the endpoint `/api/webhooks/instantly` SHALL:
- Verify the webhook signature
- Look up the email by Instantly message ID
- Increment `connectedMailboxes.bounceCount7d` or `spamComplaints7d`
- Insert a row into `emailOptouts` for hard bounces and complaints
- Trigger SENDING-001's health-throttle if thresholds exceeded

### AC-7: Connection management UI
WHEN a tenant visits `/settings/sending`,
they SHALL see a list of connected providers (currently Resend always-on; Instantly if connected),
AND they SHALL be able to add Instantly credentials (API key) with validation that calls `instantly-client.ts:validateCredentials`,
AND they SHALL see per-provider health (sends today, bounce rate 7d, last error).

### AC-8: Routing decision is observable
WHEN the email-send-worker selects a transport,
the decision SHALL be logged to `pipelineEvents` with `stage = 'transport_selected'` and metadata `{ chosenTransport, candidates, reason }`,
so failures can be diagnosed without re-running the path.

### AC-9: Fallback chain on failure
WHEN the primary transport for a `cold` intent returns `{ ok: false, retryable: true }`,
the worker SHALL retry with the next transport in the fallback chain,
AND SHALL retry up to 2 times across the chain before marking the email `failed`.
Non-retryable failures (auth invalid, recipient banned, blocklisted) SHALL NOT trigger fallback — fail immediately.

### AC-10: No Resend fallback for cold intent
WHEN a tenant has not connected Instantly (or any other provider) and managed-pool (SENDING-003) is unavailable,
the worker SHALL refuse to send `cold` intent emails through Resend — instead, mark the email `blocked_no_transport` with actionable failureReason pointing to onboarding.
This is an explicit guardrail: never burn the user's Resend test domain reputation on cold outbound.

## Edge cases
- **Instantly campaign is paused at provider:** send returns `campaign_paused`. Mark non-retryable, surface to dashboard.
- **API key revoked at Instantly:** validation fails on next send; mark `connectedMailboxes.status = 'auth_expired'`, pause all cold sends through that transport, surface re-auth CTA.
- **Webhook signature missing:** treat as suspicious, log to security audit, do not process.
- **Race: webhook arrives before send is recorded in DB:** retry the lookup with exponential backoff (max 3 retries over 30s) before treating as orphan.
- **Instantly rate limit hit (429):** treat as retryable; queue for next worker tick.
- **Tenant connects Instantly mid-sequence:** sequences in flight continue on their original transport (sticky); new sequences pick up Instantly per AC-2.
- **Instantly returns success then silently drops:** detection requires correlation with bounce/open/reply rates over 7-day rolling window; if no events at all, surface "transport health unknown" to dashboard.

## Evaluation steps (Phase 6)
1. Connect a real Instantly account to a test tenant.
2. Send 50 cold emails through the worker. Verify all dispatch through Instantly transport (not Resend).
3. Confirm tracking pixel + click rewriting still work (open one of the emails, click a link).
4. Force a bounce (send to invalid address). Verify webhook arrives and increments counter.
5. Revoke Instantly API key. Verify next send fails fast with `auth_expired` status, no Resend fallback.
6. Reconnect, verify recovery without manual intervention.
7. **Pass criterion:** all 50 sends complete via Instantly, all tracking events flow correctly, all failure modes produce structured errors, zero Resend fallbacks for cold intent.
