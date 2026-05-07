# SENDING-001 — Warmup Engine: Design

## System fit
The engine plugs into the existing outbound stack:
- Reads from `connectedMailboxes` (status, warmup columns, dailyLimit, healthScore)
- Writes to `warmupEmails` (already-defined table) and `outboundEmails` (for tracking)
- Triggered by Inngest cron (new function `warmup-engine`)
- Calls existing `email-send-worker` machinery for actual SMTP delivery (no new send path)
- Surfaces state via `deliverability/page.tsx` (extend existing component)
- Integrates with `sending-identity.ts` guardrail (extend, don't replace)

No new tables. No schema migration beyond a small extension (see below).

## Data model deltas

### Extend `connectedMailboxes` (`apps/web/src/db/schema/outbound.ts`)
Add columns:
- `warmupOptedIntoNetwork boolean default false` — opt-in to cross-tenant warmup pool
- `warmupOverrideUsedAt timestamp` — last time user overrode the guardrail
- `warmupReadinessVerdict text` — cached: `not_ready | low_risk_only | ready` (computed nightly)
- `warmupTimezone text default 'Europe/Paris'` — for time-of-day distribution

### Extend `warmupEmails` (existing table)
Add columns:
- `parentMessageId text` — for threading (replies link to original)
- `intent text not null` — `initial | reply | thread_continuation`
- `behaviorMarkers jsonb default '{}'` — `{ marked_important: bool, archived: bool, replied: bool }`
- `subjectPoolId text` — which subject template was drawn (for diversity tracking)

### New table `warmupNetworkParticipants`
Tracks tenants opted into the cross-tenant warmup network.
```sql
- id uuid pk
- tenantId uuid fk
- joinedAt timestamp
- mailboxCount integer  -- updated nightly
- reciprocityScore numeric  -- sends to network / receives from network ratio
- bannedUntil timestamp  -- if reciprocity falls below threshold
```

## Component contracts

### `warmupEngine.ts` (new)
```typescript
// apps/web/src/lib/warmup/engine.ts
export async function runWarmupTick(tenantId: string): Promise<WarmupTickResult>
// Called by cron. Selects mailboxes due for warmup, computes targets, dispatches sends.

export function getDailyTarget(daysSinceStart: number, mailboxLimit: number): number
// Pure function. Returns target for day N within mailbox's cap.

export function selectRecipient(
  sourceMailbox: ConnectedMailbox, 
  pool: WarmupPool
): ConnectedMailbox | null
// Selects a peer mailbox from same-tenant pool first, falls back to network if opted in.

export function buildWarmupMessage(
  source: ConnectedMailbox,
  recipient: ConnectedMailbox,
  threadContext?: WarmupEmail[]
): WarmupMessage
// Returns subject, body, headers (In-Reply-To if thread continuation).

export function shouldReplyTo(received: WarmupEmail): boolean
// Probabilistic: 50% baseline, modulated by thread depth and time of day.
```

### `warmup-engine.ts` (new Inngest function)
```typescript
// apps/web/src/inngest/warmup-engine.ts
export const warmupEngineCron = inngest.createFunction(
  { id: 'warmup-engine-tick', concurrency: 50 },
  { cron: '*/15 * * * *' },  // every 15 min
  async ({ step }) => {
    const tenants = await step.run('list-tenants-with-warming', listTenantsWithWarming)
    await step.run('process-tenants', () => Promise.all(
      tenants.map(t => runWarmupTick(t.id))
    ))
  }
)
```

### Subject/body pools (`apps/web/src/lib/warmup/content-pools.ts`)
Static JSON files in `apps/web/src/lib/warmup/pools/`:
- `subjects-fr.json`, `subjects-en.json` (1500+ entries each)
- `bodies-fr.json`, `bodies-en.json` (matched to subject tone registers)

Format:
```json
{
  "register": "question",
  "subject": "Question rapide sur le projet X",
  "body": "Hey [first_name],\n\n[body_template_with_placeholders]\n\nMerci,\n[sender_first_name]",
  "expectedReplyRegister": "answer"
}
```

Templates use lightweight placeholder substitution from a small fact pool (project names, time references, etc.) — generated once, sampled per-send. **Not LLM-generated per send** (cost prohibitive + introduces homogeneity that filters detect).

## Data flow

```
[Cron tick every 15min]
        │
        ▼
[List tenants with warming mailboxes]
        │
        ▼ for each tenant
[runWarmupTick]
        │
        ├─► [For each warming mailbox]
        │       │
        │       ├─► [Compute today's target via getDailyTarget]
        │       ├─► [Compute hourly schedule via time-of-day distribution]
        │       ├─► [Check if this tick is a send-tick]
        │       │       │
        │       │       ▼ if yes
        │       │   [selectRecipient → buildWarmupMessage → email-send-worker]
        │       │   [Insert warmupEmails row]
        │       │
        │       └─► [Check reply queue: any received warmupEmails awaiting reply?]
        │               │
        │               ▼
        │           [shouldReplyTo? → buildReplyMessage → email-send-worker]
        │
        └─► [Update warmupReadinessVerdict cache for each mailbox]
```

## Failure handling

| Failure | Detection | Response |
|---|---|---|
| Mailbox SMTP auth fails | Send returns 401/535 | Mark mailbox `auth_expired`, pause warmup, surface to dashboard |
| Send returns soft bounce | 4xx response | Retry once after 30 min, then skip the day |
| Send returns hard bounce | 5xx response | Increment `bounceCount7d`, AC-6 throttle kicks in |
| Recipient inbox quota full | 552 / quota error | Skip this recipient for 24h, pick another |
| Cross-tenant network has no available recipients | `selectRecipient` returns null | Fall back to same-tenant pool; if also empty, skip this tick (don't error) |
| LLM-graded "is this reply realistic?" returns score < 0.3 (future, deferred) | — | Phase 2 only |

## Security & privacy

- Cross-tenant warmup network: emails sent BETWEEN tenants are clearly marked in `behaviorMarkers.is_warmup` so they're never confused with real prospect mail.
- Warmup mail content is generic and contains zero PII beyond first names and tenant-mailbox metadata.
- Reciprocity score in `warmupNetworkParticipants` prevents abuse (one tenant trying to leech the network without sending back).
- All warmup emails carry an `X-Elevay-Warmup: true` header — invisible to recipients, used by Elevay's own reply-handler to skip them.
- The reply-handler (`apps/web/src/inngest/reply-handler.ts`) MUST be patched to ignore inbound emails with this header.

## Observability

New metrics emitted to existing pipeline-events trace:
- `warmup_send_attempted` (per mailbox per send)
- `warmup_send_succeeded`
- `warmup_send_bounced`
- `warmup_reply_sent`
- `warmup_completed` (one-shot when AC-7 fires)
- `warmup_health_throttled` (when AC-6 fires)

Dashboard tile (deliverability page): "Warmup pipeline" — shows for each warming mailbox: day N of M, today's sends/target, last 7 days health, projected completion.

## Deferred (out of scope, document for follow-up)
- Microsoft-specific warmup behavioral tuning (assume ~80% identical to Gmail patterns; revisit after Phase 6 eval).
- Sender-reputation API integration (Talos, Senderscore, GlockApps) as a feedback loop into warmup pace.
- LLM-graded warmup content quality scoring.
- Domain-level warmup vs mailbox-level warmup distinction (currently mailbox-level only; domain-level reputation builds organically as a side effect).
- Auto-detection of optimal `dailyLimit` ceiling per provider/domain (currently hardcoded by the user).
