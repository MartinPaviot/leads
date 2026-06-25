# Data Retention and Classification Policy

| Field | Value |
| --- | --- |
| Version | v1.0 |
| Effective date | 2026-06-10 |
| Owner | Martin Paviot (Founder) |
| Review cycle | Annual (next review due 2027-06-10) |

## 1. Purpose

This policy defines how Elevay (www.elevay.dev) classifies the data it processes and how long each category of data is retained. It exists to ensure customer data is kept no longer than necessary, that contractual and legal retention obligations (including GDPR and SOC 2 evidence requirements) are met, and that deletion is performed by auditable, automated mechanisms rather than ad hoc manual action.

## 2. Scope

All data stored or processed by the Elevay production system: the Supabase Postgres database (EU region), Upstash Redis, Vercel deployment artifacts and logs, Twilio voice recordings, Deepgram transcription outputs, and data held by production subprocessors listed in `_compliance/subprocessors.md`. Development-only tooling (Capsolver, TextVerified, FuseAI, Rippletide) is out of production scope and must never hold customer data.

## 3. Classification Levels

| Level | Definition | Examples | Handling |
| --- | --- | --- | --- |
| Public | Intended for unrestricted disclosure | Marketing site content, public docs, published subprocessor list | No restrictions |
| Internal | Operational data with low impact if disclosed | Architecture notes, non-secret configuration, runbooks, this policy pack | Access limited to workforce; not posted publicly |
| Confidential | Material business or technical secrets | API keys, OAuth client secrets, `ELEVAY_APP_SECRET`, Stripe keys, billing records, source code | Stored in secret managers (Vercel env / password manager); never in git or logs |
| Customer PII | Personal data belonging to customers or their prospects | CRM contacts, enriched prospect data (email, phone, role), mailbox and calendar content, call recordings and transcripts, meeting notes | Highest protection: EU residency enforced, tenant-scoped access, retention limits below, GDPR rights honored |

Where a record contains mixed levels, the highest applicable level governs.

## 4. Retention Schedule

| Data type | Classification | Retention period | Deletion mechanism |
| --- | --- | --- | --- |
| CRM data (contacts, companies, deals, notes, tasks, sequences, chat threads) | Customer PII | Life of contract + 30 days after cancellation | `data-retention-purge` Inngest cron (daily, 03:00 UTC) cascading-deletes all tenant tables for tenants with `plan = canceled` older than 30 days |
| Call recordings (Twilio, double opt-in: `VOICE_RECORDING_ENABLED` deployment switch + `callRecordingEnabled` workspace toggle; audible disclosure mandatory in two-party-consent regions) | Customer PII | 90 days (`recording-retention-purge` Inngest cron, daily 04:00 UTC; tenant override `recordingRetentionDays`, min 7) | Scheduled deletion of Twilio recordings older than 90 days; tenant purge removes call rows |
| Call transcripts (Deepgram output stored in Postgres) | Customer PII | Life of contract | Deleted by `data-retention-purge` with the rest of the tenant data |
| Audit log (activities with `activity_type = system_event` and `metadata.audit = true`, see `lib/audit-log.ts`) | Internal / Confidential | 7 years | Explicitly excluded from the tenant purge (`purgeNonAuditActivities`); deleted only after the 7-year window |
| Database backups | Customer PII | Provider window (Supabase managed daily backups + PITR where enabled) | Aged out automatically by Supabase; no manual backup copies are kept |
| Application and platform logs (Vercel, Sentry EU, PostHog EU) | Internal (may contain limited PII) | 30 days | Provider-side automatic expiry; log payloads must not contain secrets or full PII records |
| Stripe billing records | Confidential | As required by French tax/accounting law (held by Stripe) | Stripe retention; tenant row in Postgres is retained (not purged) for reconciliation |
| Suppression lists (`email_optouts`, `do_not_call_list`) | Customer PII | Life of contract; opt-out intent is honored for as long as the tenant exists | Purged with the tenant; while live, never deleted ahead of the tenant because they encode legal suppression obligations |

## 5. Deletion Mechanisms

- **Tenant soft-delete:** in-product deletions are soft (recoverable, shared `deletedAt`), so accidental loss is reversible during the contract.
- **Hard purge:** the `data-retention-purge` Inngest function runs daily at 03:00 UTC and hard-deletes all data for tenants canceled more than 30 days ago, marking the tenant `plan = purged` with a `purgedAt` timestamp. The tenant row itself is retained for Stripe reconciliation and audit continuity.
- **GDPR endpoints:** `/api/gdpr/export` provides data portability; `/api/gdpr/delete` executes the right to erasure on request, ahead of the automatic schedule.
- **Residency guard:** EU residency of the database and Redis endpoints is asserted at boot (`lib/region-config.ts`, `assertEuHost` / `validateAllEndpoints`), preventing retention in non-EU stores by misconfiguration.

## 6. Exceptions

Any retention beyond this schedule (e.g., legal hold) must be approved by the Owner and recorded in the risk register (`_compliance/risk-register.md`, see Policy 10).

## 7. Related Documents

- `09-vendor-management-policy.md` (subprocessor data handling)
- `10-risk-assessment-policy.md` (risk register, accepted gaps such as the in-progress recording retention job)
- `_compliance/subprocessors.md`
