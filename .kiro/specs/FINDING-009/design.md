# FINDING-009: Design — Meeting Bot Consent

## Architecture
Insert a consent-check step between meeting detection and bot deployment. The flow becomes: detect meeting -> send consent notification -> wait -> deploy bot (or cancel).

## New Table: `recording_consents`
```sql
CREATE TABLE recording_consents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id TEXT NOT NULL REFERENCES activities(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  participant_email TEXT NOT NULL,
  notification_sent_at TIMESTAMPTZ,
  response TEXT DEFAULT 'pending', -- pending | accepted | opted_out
  responded_at TIMESTAMPTZ,
  host_override BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Flow Change in `bot-deployment.ts`
1. Before `createBot()`, check if consent has been collected
2. If not, create consent records + dispatch consent notification event
3. Return `{ status: "awaiting_consent" }` instead of deploying
4. Separate Inngest function checks consent status before the meeting start time minus 5 minutes and either deploys or cancels

## Consent Email
- Sent via existing email infrastructure
- Contains: meeting title, time, recording notice, opt-out link
- Opt-out link hits `api/recording/consent/[id]/opt-out` endpoint

## API Endpoints
- `POST api/recording/consent/[id]/opt-out` — marks consent as opted_out
- `POST api/recording/consent/[id]/override` — host override (authenticated)

## Inngest Functions
- `recording/consent-check`: fired N-5min before meeting, checks all consents, deploys or cancels
