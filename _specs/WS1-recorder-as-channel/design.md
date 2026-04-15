# WS-1 — Design

## System fit

S'appuie sur 4 composants existants sans les remplacer :

1. **Recall.ai integration** (`lib/recall.ts`, `inngest/recall-functions.ts`, `api/webhooks/recall/route.ts`) — point d'injection du branding au createBot
2. **Calendar sync** (`lib/calendar.ts`, `lib/calendar-microsoft.ts`, `api/calendar/sync/*`) — fournit les attendees pour decideBrandingMode
3. **Activity metadata** (`activities.metadata.attendees`, `activities.metadata.recallBotId`) — source de vérité pour les participants externes
4. **Auth / tenant creation** (Clerk-based via `users.clerkId`) — point d'injection pour attribution au signup

Nouveaux modules créés :

- `lib/util/email.ts` — normalisation (shared util)
- `lib/recording/branding.ts` — decision logic
- `lib/recording/channel.ts` — exposure recording + attribution
- `app/api/r/exposure/[id]/route.ts` — tracked CTA redirect
- `app/(admin)/admin/flywheel/recorder/page.tsx` — admin dashboard

## Data model

### Migration 0016_notetaker_channel.sql

```sql
-- Track each external participant exposed to the branded bot
CREATE TABLE notetaker_exposures (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  referring_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  participant_email TEXT NOT NULL,
  participant_email_normalized TEXT NOT NULL,
  exposure_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  branding_mode TEXT NOT NULL CHECK (branding_mode IN ('full', 'silent')),
  bot_display_name TEXT NOT NULL,
  cta_clicked_at TIMESTAMPTZ NULL,
  signup_attributed_tenant_id TEXT NULL REFERENCES tenants(id) ON DELETE SET NULL,
  signup_attributed_at TIMESTAMPTZ NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_exposures_email_normalized_at
  ON notetaker_exposures(participant_email_normalized, exposure_at DESC);
CREATE INDEX idx_exposures_referring_tenant
  ON notetaker_exposures(referring_tenant_id, exposure_at DESC);
CREATE INDEX idx_exposures_activity
  ON notetaker_exposures(activity_id);

-- Accumulate referral credits per tenant
CREATE TABLE tenant_referral_credits (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  credits_earned_count INT NOT NULL DEFAULT 0,
  credits_consumed_count INT NOT NULL DEFAULT 0,
  last_credit_earned_at TIMESTAMPTZ NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Ledger of individual credit events (for audit / idempotency)
CREATE TABLE referral_credit_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('attribution_earned', 'credit_granted', 'credit_consumed')),
  triggered_by_attribution_tenant_id TEXT NULL REFERENCES tenants(id) ON DELETE SET NULL,
  triggered_by_exposure_id TEXT NULL REFERENCES notetaker_exposures(id) ON DELETE SET NULL,
  amount_cents INT NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_events_tenant_created
  ON referral_credit_events(tenant_id, created_at DESC);
```

Attribution ne nécessite **pas** de colonnes supplémentaires sur `tenants` — on
stocke dans `tenants.settings.acquisitionSource`, `settings.referringTenantId`,
`settings.exposureCount`, `settings.firstExposureAt` (JSONB existant). Évite une
migration ALTER TABLE sur table critique.

## Branding decision logic

```typescript
// lib/recording/branding.ts

export type BrandingMode = 'full' | 'silent' | 'opted_out';

export type BrandingDecisionInput = {
  attendees: Array<{ email: string; self?: boolean }>;
  tenant: {
    id: string;
    settings: {
      recordingEnabled?: boolean;
      recordingBotName?: string;
      recordingPolicy?: 'branded' | 'always_silent' | 'per_meeting_choice';
      primaryDomain?: string;
      domainAliases?: string[];
    };
    ownerEmail: string; // fallback for primary domain
  };
  meetingOverride?: 'branded' | 'silent'; // per-meeting override from user
};

export type BrandingDecision = {
  mode: BrandingMode;
  botDisplayName: string; // what to pass to Recall.ai
  externalAttendees: string[]; // emails normalized, for exposure recording
  reason: string; // observability: which rule fired
};

export function decideBrandingMode(input: BrandingDecisionInput): BrandingDecision;
```

### Rules (in order, first match wins)

1. `recordingEnabled === false` → `opted_out`, botDisplayName='', externals=[], reason='recording_disabled'
2. `recordingPolicy === 'always_silent'` → `silent`, botDisplayName='Notes', externals=[], reason='tenant_always_silent'
3. `meetingOverride === 'silent'` → `silent`, botDisplayName='Notes', externals=[], reason='meeting_override_silent'
4. `externalAttendees.length === 0` → `silent`, botDisplayName='Notes', externals=[], reason='all_internal'
5. Default → `full`, botDisplayName=`${recordingBotName} (via Elevay)`, externals=[...], reason='branded_default'

### Domain matching

```typescript
function getPrimaryDomain(tenant): string {
  return tenant.settings.primaryDomain ?? tenant.ownerEmail.split('@')[1]?.toLowerCase();
}

function isSameOrg(email: string, primaryDomain: string, aliases: string[]): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  if (domain === primaryDomain) return true;
  if (aliases.includes(domain)) return true;
  // Fuzzy match: Levenshtein distance ≤2 on domain root + same TLD
  return fuzzyDomainMatch(domain, primaryDomain);
}
```

## Email normalization

```typescript
// lib/util/email.ts

export function normalizeEmail(email: string): string {
  const [local, domain] = email.toLowerCase().trim().split('@');
  if (!local || !domain) throw new Error(`Invalid email: ${email}`);

  // Strip +tags (most providers)
  let normalizedLocal = local.split('+')[0];

  // Gmail-specific: remove dots
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    normalizedLocal = normalizedLocal.replace(/\./g, '');
  }

  return `${normalizedLocal}@${domain}`;
}
```

20+ unit tests couvrant : caps, +tags, gmail dots, unicode, plus sign in local
part, edge whitespace, trailing/leading dots, multiple @, empty strings.

## Exposure recording flow

Point d'injection : `lib/recall.ts` au moment du `createBot`.

```
[calendar sync or manual schedule] 
   → createMeetingActivity(attendees, meeting)
   → lib/recall.ts createBotForActivity(activityId)
     → load tenant settings
     → decideBrandingMode({ attendees, tenant })
     → IF mode === 'opted_out' → skip bot creation (no exposure)
     → Recall.ai POST /api/v1/bot { bot_name: decision.botDisplayName, ... }
     → IF mode === 'full' AND decision.externalAttendees.length > 0:
         INSERT INTO notetaker_exposures 
           (activity_id, referring_tenant_id, participant_email, participant_email_normalized, 
            branding_mode, bot_display_name)
         VALUES ... (one row per external attendee)
     → update activities.metadata.brandingDecision = { mode, reason, externalCount }
```

Idempotence : `UNIQUE (activity_id, participant_email_normalized)` index prevent duplicates on retry.

## Signup attribution flow

Point d'injection : à identifier précisément (Clerk webhook `user.created` ou
fonction d'onboarding). Candidate : `api/auth/invite/accept/route.ts` ou équivalent
pour new tenants via signup normal (à lire en task #2).

```
[new tenant created with owner email X]
   → lookupExposureAttribution(normalizedEmail, windowDays=90)
     → SELECT * FROM notetaker_exposures
        WHERE participant_email_normalized = $1
          AND exposure_at > NOW() - INTERVAL '90 days'
          AND branding_mode = 'full'
          AND signup_attributed_tenant_id IS NULL
        ORDER BY exposure_at DESC
     → IF match:
         UPDATE notetaker_exposures SET signup_attributed_tenant_id = new_tenant_id,
                                          signup_attributed_at = NOW()
           WHERE id = oldest_match.id
         UPDATE tenants SET settings = settings || {
           acquisitionSource: 'notetaker_exposure',
           referringTenantId: oldest_match.referring_tenant_id,
           exposureCount: matches.length,
           firstExposureAt: oldest_match.exposure_at
         } WHERE id = new_tenant_id
         INSERT INTO referral_credit_events (tenant_id, event_type, triggered_by_attribution_tenant_id, triggered_by_exposure_id)
         VALUES (oldest_match.referring_tenant_id, 'attribution_earned', new_tenant_id, oldest_match.id)
         -- Trigger credit logic
         IF earned_count since last_credit_granted >= 3:
           INSERT referral_credit_events (event_type='credit_granted', amount_cents=<1_month>)
           UPDATE tenant_referral_credits credits_earned_count += 1, last_credit_earned_at = NOW()
```

Idempotence : `signup_attributed_tenant_id IS NULL` guarantees un exposure ne
peut être attribué qu'une fois.

## CTA tracked link

```
GET /r/exposure/:id
  → SELECT participant_email, branding_mode FROM notetaker_exposures WHERE id = :id
  → IF not found → 404
  → IF cta_clicked_at IS NULL:
      UPDATE cta_clicked_at = NOW()
  → IF is_eu_prospect(participant_email, req.ip):
      render opt-in banner page (not a 302; user must click "Continue")
      on consent → set cookie + 302 to /marketing/notetaker-landing?ref=:id
      on decline → 302 to /marketing/notetaker-landing (no tracking cookie)
  → ELSE:
      302 to /marketing/notetaker-landing?ref=:id
```

## Admin dashboard query patterns

```sql
-- Exposures totals
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE exposure_at > NOW() - INTERVAL '30 days') AS last_30d
FROM notetaker_exposures;

-- Attribution & conversion
SELECT COUNT(*) FILTER (WHERE signup_attributed_tenant_id IS NOT NULL) AS signups,
       (COUNT(*) FILTER (WHERE signup_attributed_tenant_id IS NOT NULL)::float 
        / NULLIF(COUNT(*), 0)) AS conversion_rate
FROM notetaker_exposures
WHERE exposure_at < NOW() - INTERVAL '90 days'; -- only "settled" exposures

-- K-factor weekly (signups_attributed_in_week / active_tenants_exposing_in_same_week)
-- Compute via window over 12 weeks; top 10 referring tenants trivial GROUP BY.
```

## Failure handling

| Failure | Behavior |
|---------|----------|
| Recall.ai createBot fails after exposure rows inserted | Rollback exposure rows in same transaction — createBot must happen **before** insert commit |
| Webhook lifecycle race : bot never joins | Exposure row still inserted at bot creation; if `status = failed` within 5min, DELETE exposure row (async Inngest cleanup) |
| Attribution lookup on new tenant fails (DB down) | Log, proceed without attribution (don't block signup). Retry via async job 5min later. |
| CTA link hits a deleted exposure | 404 rendered, no error surfaced |
| Duplicate signup attempt same email | Attribution idempotent (guard on signup_attributed_tenant_id IS NULL) |
| Clock skew between tenants region DB | Use `NOW()` server-side always, never client time |

## Security & privacy

- `participant_email` is PII → redact in all logs (print `u***@acme.com`)
- `participant_email_normalized` indexed but never exposed in API responses
- GDPR: exposure rows for EU prospects → default CTA does not track; explicit opt-in required
- Right to erasure: when tenant deletes a meeting activity, cascade deletes exposures (ON DELETE CASCADE)
- Cross-tenant attribution data: both tenants (referring + attributed) can see audit log, but the **participant** (prospect) cannot see they were attributed — by design, standard marketing attribution
- Audit log immuable via `referral_credit_events` append-only table

## Feature flag

`tenant.settings.features.recorderChannelV1 = true` (rollout staged). Off par
défaut pendant QA, on pour tous les nouveaux signups post-merge, backfill
progressif pour tenants existants.

## Out of scope V1

- Multi-touch attribution
- A/B test CTA copy
- Competitor bot detection strategy
- Bounties monétaires
- Attribution cross-device (device fingerprint)
- Self-service referral program UI pour tenants (juste credits automatiques en V1)
