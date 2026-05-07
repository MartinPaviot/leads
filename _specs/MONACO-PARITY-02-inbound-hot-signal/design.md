# MONACO-PARITY-02 — Design

## System fit
The webhook surface already exists: `app/api/webhooks/inbound/route.ts` accepts form submissions and calls `skills/enrichment/inbound-lead-enrichment/handler.ts`. The handler enriches via Apollo but does NOT emit a signal or check against TAM scoring.

We add a post-enrichment step that:
1. Reads the contact's `companyId` after enrichment.
2. Looks up the company's TAM score.
3. Emits a `signals` row with appropriate priority.
4. Creates a `notifications` row when priority is hot.

## Data model
No new table. Reuse existing `signals` and `notifications`.

`signals` row fields used:
- `type = "inbound_demo_request"`
- `companyId`, `contactId` (both populated)
- `priority = "hot" | "normal" | "scoring_pending"`
- `verificationStatus = "verified"` (form submission IS evidence)
- `properties = { formProviderEventId, formPayload, scoreAtMatchTime }`

`notifications` row fields used:
- `kind = "hot_inbound"`
- `userId = tenant primary user`
- `metadata = { contactId, companyId, score }`
- `severity = "high"`

## API contracts

### Webhook (existing) — extended response
`POST /api/webhooks/inbound`
- After enrichment kicked off, synchronously do a lightweight TAM-score lookup (single SQL: `select score from companies where id = $1 and tenantId = $2`).
- If score available, decide priority immediately and emit signal.
- If score null (new account), emit `priority = "scoring_pending"` and let the post-enrichment Inngest job re-evaluate.

### Inngest function `score-tam-match` (new)
Triggered by event `enrichment/contact-enriched`. Re-runs the TAM-score lookup and upgrades the signal priority if the score has been computed since.

### Hot dashboard widget (new query)
```sql
SELECT s.*, c.* FROM signals s
JOIN contacts c ON c.id = s.contact_id
WHERE s.tenant_id = $1
  AND s.type = 'inbound_demo_request'
  AND s.priority = 'hot'
  AND s.created_at > now() - interval '7 days'
ORDER BY s.created_at DESC
LIMIT 20;
```

Front-end: `app/(dashboard)/home/components/hot-inbounds-widget.tsx`.

## Failure handling
- Enrichment fails (Apollo down) → still emit `priority = "scoring_pending"` so the inbound isn't lost.
- Notification creation fails → log warn, don't fail the webhook (webhook must always 200 to avoid form provider retries that double-fire enrichment).
- Free-email-provider edge case: detected via `lib/email/is-free-provider.ts` (already exists per git log mention).

## Security
- Webhook uses HMAC signature header per existing `webhook-signature.ts`. Unchanged.
- Form payload is sanitized via `sanitize-html.ts` before persistence.
- Notification body never echoes raw form input — uses extracted fields only.
