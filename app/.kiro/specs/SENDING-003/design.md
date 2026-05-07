# SENDING-003 — Self-Service Sending Onboarding: Design

## System fit
Builds on top of SENDING-001 (warmup) and SENDING-002 (transports). Adds:
- Onboarding flow extension (`apps/web/src/components/onboarding-wizard.tsx`)
- New domain provisioning service (`apps/web/src/lib/sending/provisioning.ts`)
- Registrar adapters (`apps/web/src/lib/sending/registrars/`)
- Inbound mail processor for reply routing (`apps/web/src/app/api/inbound/route.ts`)
- New tables for managed-domain inventory and lifecycle

## Data model deltas

### New table `managedDomains`
Pool of Elevay-owned root domains and sub-domains assigned to tenants.
```sql
- id uuid pk
- rootDomain text not null  -- e.g. 'revenue-mail.com'
- subdomain text not null   -- e.g. 'pierre-1'
- fqdn text generated as (subdomain || '.' || rootDomain) stored unique
- registrarId text not null  -- 'cloudflare' | 'porkbun'
- tenantId uuid fk on tenants  -- nullable; null means in pool
- assignedAt timestamp
- releasedAt timestamp
- recyclableAfter timestamp  -- assignedAt + 12 months at minimum
- dkimSelector text  -- e.g. 'elevay20260601'
- dkimPublicKey text
- dkimPrivateKeyEncrypted text
- spfVerifiedAt timestamp
- dkimVerifiedAt timestamp
- dmarcVerifiedAt timestamp
- mxVerifiedAt timestamp
- status text  -- 'pool' | 'provisioning' | 'active' | 'releasing' | 'cooling_off'
- registrarMetadata jsonb  -- domain ID at registrar, expiry, etc.
```

### New table `provisioningJobs`
Track in-flight onboarding flows for resumability + observability.
```sql
- id uuid pk
- tenantId uuid fk
- mode text  -- 'managed' | 'byod'
- status text  -- 'pending' | 'registering' | 'configuring_dns' | 'verifying' | 'creating_mailboxes' | 'warmup_started' | 'completed' | 'failed'
- targetDomainCount integer default 3
- byodDomain text  -- only set if mode = 'byod'
- progress jsonb  -- { domainsRegistered, dnsConfigured, dnsVerified, mailboxesCreated }
- failureReason text
- startedAt timestamp
- completedAt timestamp
```

### Extend `tenantBillingMetadata` (or create if not exists)
Add `sendingInfraCostMonthly numeric` for unit-economics visibility.

## Component contracts

### `Registrar` interface (`apps/web/src/lib/sending/registrars/types.ts`)
```typescript
interface Registrar {
  id: 'cloudflare' | 'porkbun'
  registerSubdomain(rootDomain: string, subdomain: string): Promise<RegistrationResult>
  setDnsRecord(domain: string, record: DnsRecord): Promise<void>
  verifyDnsRecord(domain: string, expected: DnsRecord): Promise<boolean>
  releaseSubdomain(domain: string): Promise<void>
}
```

### `apps/web/src/lib/sending/registrars/cloudflare.ts`
Implements Registrar via Cloudflare API. Sub-domains are zones under Elevay's main account; DNS records via Cloudflare DNS API.

### `apps/web/src/lib/sending/registrars/porkbun.ts`
Same interface, Porkbun API. Used as fallback.

### `apps/web/src/lib/sending/provisioning.ts`
```typescript
export async function provisionManagedDomains(
  tenantId: string,
  count = 3
): Promise<ProvisioningResult>
// Allocates from pool OR registers new. Configures DNS via primary registrar with fallback.
// Creates connectedMailboxes rows. Triggers warmup engine.

export async function provisionByodDomain(
  tenantId: string,
  domain: string
): Promise<ByodInstructions>
// Returns the DNS records to set + verification token.

export async function verifyByodDomain(
  tenantId: string,
  domain: string
): Promise<ByodVerificationResult>
// Runs DNS lookups for each expected record. Returns per-record status.
```

### `apps/web/src/lib/sending/dns-records.ts`
Pure functions to generate the SPF, DKIM, DMARC record values for a given domain.
```typescript
generateSpfRecord(domain: string): string
generateDkimRecord(domain: string, publicKey: string, selector: string): { name, value }
generateDmarcRecord(domain: string, policy: 'none' | 'quarantine' | 'reject'): { name, value }
generateMxRecord(domain: string): { name, value, priority }  // points to Elevay inbound processor
```

### Inbound mail processor `apps/web/src/app/api/inbound/route.ts`
Receives forwarded mail from managed-domain MX record (via SES, Postmark, or Mailgun inbound parsing).
- Parses the email
- Looks up `managedDomains.tenantId` by recipient domain
- Persists to `inboundEmails` (existing or new)
- Forwards to user's connected primary inbox
- Updates the conversation thread in Elevay's CRM

## Onboarding flow (UX)

```
[Existing wizard: welcome → connect → privacy → product → icp]
        │
        ▼
[NEW: sending-mode]    Pre-selected: "Managed (recommended)"
   ├─ "Set up managed infrastructure" (default, single button)
   ├─ "Bring my own domain" (collapsed, click to expand)
   └─ "Connect existing mailbox" (collapsed; warning gate per AC-10)
        │
        ▼ (managed path)
[provisioning in progress]
   ├─ Step 1: Registering 3 domains (real-time)
   ├─ Step 2: Configuring DNS records
   ├─ Step 3: Verifying records
   ├─ Step 4: Creating mailboxes
   └─ Step 5: Starting warmup
        │
        ▼ (≤ 5 min total)
[ready-to-explore screen]
   "Your sending infrastructure is being warmed.
    You'll be ready to send cold on [date].
    In the meantime, let's build your first list."
        │
        ▼
[Continue to TAM builder / dashboard]
```

## Data flow — managed provisioning

```
[User clicks "Set up managed infrastructure"]
        │
        ▼
[Insert provisioningJobs row, status='pending']
        │
        ▼
[Inngest function: provision-managed-domains]
        │
        ├─► For each of 3 needed domains:
        │       │
        │       ├─► [Allocate from pool if available]
        │       │       │
        │       │       ▼ (else)
        │       │   [Generate subdomain candidate from tenant-slug + counter]
        │       │       │
        │       │       ▼
        │       │   [Try primary registrar (Cloudflare)]
        │       │       │
        │       │       ▼ (success)
        │       │   [Set SPF/DKIM/DMARC/MX via API]
        │       │       │
        │       │       ▼
        │       │   [Verify each record via DNS lookup, retry 3x over 90s]
        │       │       │
        │       │       ▼ (verified)
        │       │   [Update managedDomains row, status='active', tenantId set]
        │       │
        │       └─► [Insert connectedMailboxes row, status='warming_up']
        │
        ├─► [Update provisioningJobs.progress as each step completes]
        │
        └─► [Trigger warmup engine for new mailboxes]
        │
        ▼
[Mark provisioningJobs status='warmup_started', send completion email]
```

## Data flow — BYOD verification

```
[User submits domain]
        │
        ▼
[Generate DNS records (SPF/DKIM/DMARC) tied to verification token]
        │
        ▼
[Display copy-paste instructions]
        │
        ▼ (user copies records to their DNS provider)
        │
[User clicks "Verify"]
        │
        ▼
[Run DNS lookups for each expected record]
        │
        ▼
[Per-record verification status returned]
        │
        ├─► All verified → create connectedMailboxes, trigger warmup
        └─► Some failed → show specific error per record, allow retry
```

## Failure handling

| Failure | Response |
|---|---|
| Cloudflare API 5xx | Retry with exp backoff, fall back to Porkbun |
| Both registrars unavailable | Queue manual ops review (`sendingInfraRequests` row), notify user with honest 24h ETA |
| DNS verification fails after 3 retries | Mark domain `provisioning_failed`, surface error, do NOT proceed to mailbox creation |
| Tenant slug produces invalid subdomain | Sanitize, append random suffix, retry |
| BYOD domain has DNS provider that blocks our records (rare, e.g. Squarespace) | Detect via verification failure, surface "your DNS provider may need additional configuration" + link to docs |
| Warmup engine not running (SENDING-001 not deployed yet) | Provisioning still completes; mailboxes sit in `warming_up` status, picked up when SENDING-001 ships |
| User abandons mid-flow | Provisioning continues in background; user sees state on return |
| Domain count exceeds Cloudflare account limit | Auto-rotate to fresh Elevay-owned Cloudflare account (admin alert when threshold approached) |

## Security & privacy

- Cloudflare API tokens scoped to specific zones, never global account access
- DKIM private keys encrypted at rest (existing tenant key encryption)
- BYOD path NEVER asks for user's registrar credentials — only requires DNS read access (public lookups)
- Inbound mail processor verifies sender domain match before forwarding (prevents spoofing)
- Managed sub-domains use unique per-tenant DKIM selectors so cross-tenant key compromise is bounded
- Cooling-off period (12 months minimum) on released sub-domains prevents reputation inheritance attacks

## Observability

- New dashboard tile (admin): "Domain pool health" — pool size, allocation rate, registrar split, average provisioning time, failure rate by step
- Per-tenant: provisioning timeline visible at `/onboarding/sending/status`
- Sentry tags on failures: `step` (registering, configuring_dns, verifying, etc.), `registrar` (cloudflare, porkbun), `errorCode`
- `pipelineEvents` writes for each provisioning step

## Cost model

| Item | Per-tenant per month |
|---|---|
| 3 managed sub-domains (Cloudflare bulk pricing) | ~$1.50 |
| Inbound mail processing (SES/Postmark) | ~$0.50 |
| DNS API calls | negligible |
| Total | **~$2/month per tenant** |

At $999/mo pricing, this is 0.2% of revenue. Acceptable.

## Deferred
- Per-tenant custom domain naming preference (use deterministic for now).
- Cross-tenant managed-pool sharing where one tenant's idle domains warm another's mailboxes.
- Automatic domain replacement when one starts to degrade (would require continuous reputation monitoring).
- Multi-region domain selection (US vs EU TLDs based on recipient geography).
- BYOD provider-specific deep integrations (e.g. one-click Cloudflare auth for users who DO want API access).
- Domain transfer from registrar to user upon churn (let them keep what they paid for).
