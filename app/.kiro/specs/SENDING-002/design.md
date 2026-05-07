# SENDING-002 — Instantly Send Routing: Design

## System fit
Refactor of the existing `apps/web/src/inngest/email-send-worker.ts`. No new schemas. Reuses:
- `connectedMailboxes` table (existing)
- `outboundEmails` table (existing — adds `transport` and `providerMessageId` columns)
- `pipelineEvents` table (for observability)
- `apps/web/src/lib/providers/instantly-client.ts` (extend existing)

## Data model deltas

### Extend `outboundEmails` (`apps/web/src/db/schema/outbound.ts`)
Add columns:
- `transport text not null default 'resend'` — `resend | instantly | mailbox-direct | smartlead | managed-pool`
- `providerMessageId text` — already may exist, ensure indexed
- `transportAttempts jsonb default '[]'` — for fallback chain audit (each entry: `{transport, attemptedAt, ok, error}`)

### Extend `connectedMailboxes`
Add column:
- `instantlyAccountId text` — Instantly's per-account ID (one Instantly API key can drive multiple sending accounts)

No new tables.

## Component contracts

### `Transport` interface (`apps/web/src/lib/transports/types.ts`)
```typescript
export interface Transport {
  id: TransportId
  isAvailableFor(args: TransportContext): Promise<boolean>
  send(payload: OutboundPayload): Promise<TransportResult>
  reportBounce?(providerMessageId: string): Promise<void>
  reportComplaint?(providerMessageId: string): Promise<void>
}

export type TransportId = 'resend' | 'instantly' | 'mailbox-direct' | 'managed-pool' | 'smartlead'

export interface TransportContext {
  tenantId: string
  mailboxId?: string
  intent: EmailIntent
}

export interface OutboundPayload {
  to: string
  from: { email: string; name?: string }
  subject: string
  htmlBody: string  // already includes tracking pixel + click rewriting + footer
  textBody: string
  replyTo?: string
  headers: Record<string, string>  // including List-Unsubscribe, X-Elevay-* tags
  intent: EmailIntent
  metadata: { outboundEmailId: string; tenantId: string; sequenceEnrollmentId?: string }
}

export interface TransportResult {
  ok: boolean
  transport: TransportId
  providerMessageId?: string
  sentAt?: string
  error?: { code: string; message: string; retryable: boolean }
}
```

### Transport registry (`apps/web/src/lib/transports/registry.ts`)
```typescript
export async function selectTransport(
  ctx: TransportContext
): Promise<TransportPlan>
// Returns: { primary: Transport, fallbacks: Transport[] }
// Routing logic per AC-2.
```

### `apps/web/src/lib/transports/instantly.ts` (new)
Implements `Transport` for Instantly. Uses existing `instantly-client.ts` for HTTP calls; adds the `send()` method.

### `apps/web/src/lib/transports/resend.ts` (new — refactor)
Wraps the existing Resend logic into the interface. Limit it to `transactional` intent only (per AC-10).

### `apps/web/src/lib/transports/mailbox-direct.ts` (new)
For `warmup` and `reply` intents. Uses OAuth-stored credentials on `connectedMailboxes` to send via Gmail API / Microsoft Graph / direct SMTP. (For SMTP: leverage `nodemailer`. For Gmail/Outlook: use the existing OAuth tokens.)

### `email-send-worker.ts` refactor
Current shape (simplified):
```typescript
async function sendEmail(payload) {
  // mutate payload: tracking pixel, click rewriting, footer, headers
  // dispatch via Resend
  // record result
}
```

New shape:
```typescript
async function sendEmail(payload) {
  // mutate payload: tracking pixel, click rewriting, footer, headers (UNCHANGED)
  const plan = await selectTransport({ tenantId, mailboxId, intent })
  for (const t of [plan.primary, ...plan.fallbacks]) {
    if (!await t.isAvailableFor(ctx)) continue
    const result = await t.send(payload)
    recordAttempt(payload.metadata.outboundEmailId, result)
    if (result.ok) return result
    if (result.error?.retryable === false) break  // hard fail, don't fallback
  }
  // mark email failed with structured reason
}
```

## Data flow

```
[Sequence step due] OR [signal-triggered enrollment]
        │
        ▼
[email-send-worker enqueues outbound]
        │
        ▼
[Build OutboundPayload — apply tracking pixel, click rewriting, footer, headers]
        │
        ▼
[selectTransport(tenantId, mailboxId, intent)] ── consults connectedMailboxes + tenant settings
        │
        ▼
[Try primary.send()] ────► [Persist providerMessageId, transportAttempts]
        │       │
        │       ▼ (success)
        │   [Mark sent]
        │
        ▼ (retryable failure)
[Try fallback.send()] ──► …  (max 2 attempts in chain)
        │
        ▼ (all failed OR non-retryable)
[Mark failed with reason in failureReason]
```

## Failure handling

| Failure | Response |
|---|---|
| Primary transport returns `retryable: true` | Try next in fallback chain |
| Primary returns `retryable: false` (auth, blocklist, banned recipient) | Stop fallback chain, mark failed |
| All transports unavailable for intent | Mark `blocked_no_transport`, surface to onboarding |
| Webhook signature invalid | Reject with 401, log to security audit |
| Webhook arrives before DB record | Retry lookup 3x with exp backoff, then dead-letter to manual review queue |
| Instantly rate limit (429) | Treat as retryable, requeue Inngest step with delay matching the `Retry-After` header |
| Tenant has 0 connected providers and tries to send cold | UI prevents this in the campaign wizard; if it slips through, AC-10 catches it |

## Security

- Instantly API key stored encrypted at rest (existing `connectedMailboxes` encryption — confirm it covers the new column).
- Webhook endpoint verifies HMAC signature using a per-tenant secret rotated on connect.
- No PII (recipient email, subject) ever logged in plain text in `transportAttempts.error.message` — sanitize before persistence.
- Rate limit `/api/webhooks/instantly` at 100 req/sec per tenant to prevent flood.

## Observability
- `pipelineEvents` writes per send: `transport_selected`, `transport_send_succeeded`, `transport_send_failed`, `transport_fallback_used`.
- New dashboard tile (settings/sending): per-transport last 24h volume + success rate + error breakdown.
- Sentry captures all non-retryable transport errors with structured tags (transport, intent, errorCode).

## Deferred
- Smartlead transport (stub the implementation, prove the abstraction works, defer real wiring).
- In-house SMTP pool with rotation across Elevay-managed domains (this is the "managed-pool" transport, scoped to SENDING-003 in part — full pool rotation deferred to a future sprint).
- Per-message transport selection by content type (e.g., HTML-heavy through one provider, plain-text through another) — not warranted at current scale.
- Multi-region Instantly accounts (one account US, another EU) — single-account assumed.
