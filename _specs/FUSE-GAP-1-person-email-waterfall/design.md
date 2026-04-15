# FUSE-GAP-1 · design

## System fit

```
┌─────────────────────────────────────────────────────────────────┐
│                      User surface                                │
│  /contacts/:id  │  /prospects/search  │  Chat (SalesGPT-LS)     │
└─────────────┬───────────┬────────────────────┬──────────────────┘
              │           │                    │
              ▼           ▼                    ▼
        ┌─────────────────────────────────────────────────┐
        │   API: /api/enrich/person-email                  │
        │   (POST single + POST /batch for ≤100)           │
        └──────────────┬──────────────────────────────────┘
                       │
                       ▼
             ┌──────────────────────┐
             │ EnrichmentService    │ ← new: lib/enrichment/
             │  - checkCache()      │
             │  - runWaterfall()    │
             │  - logAudit()        │
             │  - updateUsage()     │
             └───────┬──────┬───────┘
                     │      │
          ┌──────────▼──┐  ┌▼─────────────┐
          │ DropContact  │  │   Hunter     │
          │ Provider     │  │   Provider   │
          └──────────────┘  └──────────────┘
                     │              │
                     ▼              ▼
              (external API calls)
```

## Data model

### New tables

```sql
-- Cache lookups for 90d to avoid re-billing the user on same person
CREATE TABLE enrichment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_key text NOT NULL, -- normalize(firstName) || '|' || normalize(lastName) || '|' || normalize(domain)
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text,                   -- null if no match
  confidence text,              -- 'high' | 'medium' | 'low' | 'inferred' | null
  source text,                  -- 'dropcontact' | 'hunter' | 'inferred' | 'no_match'
  status text,                  -- 'valid' | 'catch-all' | 'risky' | 'invalid' | null
  full_response jsonb,          -- raw provider response for debugging
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  UNIQUE (tenant_id, lookup_key)
);
CREATE INDEX idx_enrichment_cache_lookup ON enrichment_cache (tenant_id, lookup_key) WHERE expires_at > now();

-- Audit log (RGPD compliance)
CREATE TABLE enrichment_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  person_first_name text,
  person_last_name text,
  company_domain text,
  provider text,                -- which provider (or 'cache', 'inferred', 'no_match')
  match_result text,            -- 'matched' | 'no_match' | 'opted_out' | 'rate_limited' | 'error'
  confidence text,
  cost_credits int NOT NULL DEFAULT 0,
  latency_ms int,
  opted_out boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_enrichment_audit_tenant_date ON enrichment_audit_log (tenant_id, created_at DESC);

-- Provider health rollup (aggregated daily, for dashboards)
CREATE TABLE enrichment_provider_health (
  provider text NOT NULL,
  day date NOT NULL,
  calls_total int NOT NULL DEFAULT 0,
  calls_matched int NOT NULL DEFAULT 0,
  errors_5xx int NOT NULL DEFAULT 0,
  errors_timeout int NOT NULL DEFAULT 0,
  errors_rate_limit int NOT NULL DEFAULT 0,
  avg_latency_ms int,
  total_credits_spent int NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, day)
);
```

### Existing tables touched

- `usageEvents` (from `db/billing-schema.ts`) : add event_type `'enrichment_email'` with `metadata.provider` et `metadata.confidence`. No schema migration — `metadata` jsonb already flexible.
- `contacts` (main CRM table) : no schema change. The email field is populated by the enrichment service via existing update mutation.

### Tenant-level settings

Add to `tenants.settings` jsonb (or create dedicated config table if settings grows):

```json
{
  "enrichment": {
    "waterfall_order": ["dropcontact", "hunter"],
    "monthly_cap_lookups": null,  // null = use plan default
    "enable_llm_fallback": true,
    "disabled_providers": []
  }
}
```

## API contracts

### POST /api/enrich/person-email (single)

**Request body:**
```typescript
{
  firstName: string;
  lastName: string;
  companyDomain?: string;    // preferred
  companyName?: string;      // fallback if no domain
  linkedinUrl?: string;      // fallback if Hunter supports it
  contactId?: string;        // if enriching an existing contact → update on match
  bypassCache?: boolean;     // default false; true forces fresh call
}
```

**Response 200:**
```typescript
{
  email: string | null;
  confidence: 'high' | 'medium' | 'low' | 'inferred' | null;
  source: 'dropcontact' | 'hunter' | 'inferred' | 'cache' | 'no_match';
  status: 'valid' | 'catch-all' | 'risky' | 'invalid' | null;
  creditsCharged: number;
  cacheHit: boolean;
  alternativeCandidates?: Array<{ email: string; confidence: string }>;
  reason?: 'opted_out' | 'no_work_email' | 'rate_limited' | 'quota_exceeded';
}
```

**Error responses:**
- 400 : missing required fields (firstName + lastName + (domain || companyName))
- 402 : monthly enrichment cap reached for tenant (with `Retry-After` header = days till reset)
- 422 : domain is a free email provider (gmail/yahoo/etc.) — no work email supported
- 429 : all providers rate-limited, retry later
- 500 : unexpected error

### POST /api/enrich/person-email/batch

**Request body:**
```typescript
{
  items: Array<{
    firstName: string;
    lastName: string;
    companyDomain?: string;
    companyName?: string;
    contactId?: string;
  }>;  // max 100
  bypassCache?: boolean;
}
```

**Response 202 Accepted:**
```typescript
{
  jobId: string;
  estimatedCredits: number;  // max possible if all miss cache
  cachedCount: number;       // how many were already in cache
}
```

Client polls `/api/enrich/person-email/jobs/:jobId` for progress / result. Use existing Inngest pattern (`app/apps/web/src/inngest/sync-functions.ts`).

### POST /api/chat/tools/enrichPersonEmail (internal — called from chat runtime)

Same shape as single endpoint, but wrapped in tool-call format with structured output for streaming.

## Waterfall algorithm

```typescript
async function runWaterfall(input: EnrichmentInput, config: TenantEnrichmentConfig): Promise<EnrichmentResult> {
  // 0. Validate input
  if (isFreeEmailDomain(input.companyDomain)) return { email: null, reason: 'no_work_email' };

  // 1. Check cache
  const cached = await cache.get(lookupKey(input));
  if (cached && !input.bypassCache) {
    return { ...cached, source: 'cache', creditsCharged: 0, cacheHit: true };
  }

  // 2. Check quota
  const quota = await quotaCheck(input.tenantId);
  if (!quota.allowed) throw new QuotaExceededError(quota);

  // 3. Run providers in order
  let lastError = null;
  for (const providerName of config.waterfall_order) {
    if (config.disabled_providers.includes(providerName)) continue;
    const provider = getProvider(providerName);  // dropcontact | hunter
    try {
      const result = await provider.lookup(input);
      if (result.opted_out) return { email: null, reason: 'opted_out' };
      if (result.email && (result.confidence === 'high' || result.confidence === 'medium')) {
        await cache.set(lookupKey(input), result);
        await audit.log({ ...input, provider: providerName, ...result });
        await usage.increment(input.tenantId, 'enrichment_email', result.creditsCharged);
        return { ...result, source: providerName, cacheHit: false };
      }
      // confidence 'low' → continue to next provider
    } catch (err) {
      lastError = err;
      await audit.logError(input.tenantId, providerName, err);
      continue;
    }
  }

  // 4. LLM inference fallback (layer 2)
  if (config.enable_llm_fallback && input.companyDomain) {
    const inferred = await llmInferEmail(input);  // pattern-based, e.g. firstname.lastname@domain
    if (inferred) {
      // Do NOT cache inferred emails — low confidence is transient
      await audit.log({ ...input, provider: 'inferred', ...inferred });
      return { ...inferred, source: 'inferred', confidence: 'inferred', cacheHit: false, creditsCharged: 5 };
    }
  }

  // 5. No match
  await audit.log({ ...input, provider: 'no_match', match_result: 'no_match' });
  return { email: null, source: 'no_match', creditsCharged: 0, cacheHit: false };
}
```

## Provider interface

```typescript
// lib/enrichment/providers/types.ts
export interface EnrichmentProvider {
  name: 'dropcontact' | 'hunter' | 'findymail' | 'kaspr';
  lookup(input: EnrichmentInput): Promise<ProviderResult>;
  healthCheck?(): Promise<{ ok: boolean; latencyMs: number }>;
  costPerLookup: number;  // in credits
}

export interface ProviderResult {
  email: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  status: 'valid' | 'catch-all' | 'risky' | 'invalid' | null;
  opted_out?: boolean;       // Dropcontact
  full_response: unknown;     // raw for debugging
  latencyMs: number;
  creditsCharged: number;     // what WE charge the user
}
```

### DropContact implementation notes

- API docs : https://api.dropcontact.io
- Endpoint : `POST /batch` (even for single lookup, they don't have a single-item endpoint)
- Rate limit : 60 req/min, 2000 req/day (free tier) or per contract
- Auth : `X-Access-Token` header
- Pricing : ~€0.05 per validated email (contract dependent)
- Special behavior : returns `siren` (FR business ID) — useful for our french-first positioning
- **Opt-out handling** : field `opted_out` in response — respect it

### Hunter implementation notes

- API docs : https://hunter.io/api-documentation/v2
- Endpoint : `GET /email-finder?domain={}&first_name={}&last_name={}`
- Rate limit : 100 req/min (Starter plan)
- Auth : query param `api_key`
- Pricing : ~€0.03 per verified email
- **Confidence score** : 0-100 → map to high (≥75) / medium (50-74) / low (<50)

## Failure handling

| Failure | Response |
|---|---|
| Single provider timeout (>5s) | Skip to next, log `providerTimeout` metric |
| All providers down | Return `502 Service Unavailable` with `Retry-After: 60` header |
| LLM fallback crash | Degrade gracefully, return `no_match` |
| Cache unavailable (db down) | Log `cacheUnavailable`, proceed with live call (user pays a redundant credit, accepted risk) |
| Audit log write fails | **Do not fail the enrichment** — audit is best-effort. Alert on `auditWriteFailure` metric. |

## Security & RGPD

- **Audit log** : all enrichments logged with user/tenant, person data minimal (first + last name, domain — NO email content) — sufficient for RGPD accountability, minimizes PII footprint.
- **Dropcontact opt-out** : honored at the provider level + we re-check before exposing to UI.
- **Data export** (RGPD Art.20) : audit log exportable in CSV via `/settings/data-privacy` for tenant admin.
- **Data deletion** (RGPD Art.17) : if a contact is hard-deleted from CRM, the corresponding `enrichment_audit_log` entries are anonymized (person names nulled, domain retained for provider health analytics) via cascade trigger. Do NOT delete audit rows — needed for accountability.
- **No third-party tracking** : no client-side beacons to providers. Provider API calls are server-side only.

## Metering + pricing

- Cost per successful lookup : 20 credits (LeadSens internal unit), matches current `basic_email_enrichment` pricing
- Inferred-only match : 5 credits (cheaper because no external API call)
- No-match attempt : 0 credits
- Cached lookup : 0 credits
- Batch : each item counted individually, but batch overhead is 0 credits
- Plan caps (default):
  - Free trial 14d : **20 enrichments/trial total** (hard)
  - Starter $49/mo : **200 enrichments/mo** (soft, upgrade prompt)
  - Pro $99/mo : **2000 enrichments/mo** (soft, usage alerts at 80%)
  - Enterprise : custom

Reuses existing `billing.ts` `checkPlanLimit()` pattern.

## Observability

- Sentry span per enrichment call, tagged with provider, confidence, cache_hit
- PostHog event `enrichment.requested` + `enrichment.succeeded` + `enrichment.no_match` (for funnel analysis)
- Admin dashboard `/settings/enrichment` pulls from `enrichment_provider_health` table
- Nightly rollup job (Inngest) that aggregates `enrichment_audit_log` → `enrichment_provider_health`

## Rollout plan

1. **Dev env** — build + Dropcontact only + LLM fallback. Test with team's own data.
2. **Staging** — add Hunter. Run parallel probes on 100 known contacts to measure real match rate.
3. **Alpha** (3-5 early users) — feature flag `ENRICHMENT_V1` on Starter plans. Collect real feedback.
4. **Beta** (all tenants) — gradual rollout with circuit-breaker on provider failure.
5. **GA** — document in public pricing + blog post "Now in LeadSens: person email enrichment".

## Open questions (to resolve in implementation)

- [ ] Contract preferred with Dropcontact (monthly flat vs per-call) ? Direct to their sales.
- [ ] Hunter : Starter plan €49/mo for 500 req or Growth €149 for 2000 req ? Match against our expected volume.
- [ ] Exact cap on Free trial — 20 trial lookups is my guess; validate with Martin based on funnel data.
- [ ] Dashboard UI on `/settings/enrichment` — full page or embedded panel ? My take : embedded panel initially, upgrade to full page once we add Hunter analytics.
