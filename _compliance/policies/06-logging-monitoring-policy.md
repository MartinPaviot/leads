# Logging and Monitoring Policy

| Field | Value |
|---|---|
| Version | v1.0 |
| Date | 2026-06-10 |
| Owner | Martin Paviot |
| Classification | Internal |

Parent policy: [Information Security Policy](01-information-security-policy.md)

## Purpose

Define what Elevay logs, how long logs are kept, how they are protected from tampering and from leaking personal data, how alerts reach a human, and how often logs are reviewed, so that security events are detectable and incidents are reconstructible.

## Scope

The application audit trail (signed rows in the `activities` table in Supabase Postgres), application error and performance telemetry (Sentry, EU region), availability monitoring (`/api/health` plus the GitHub Actions uptime probe), product analytics (PostHog, EU region), and vendor-side logs (Vercel runtime logs, Supabase logs, GitHub audit log). Applies to the founder and any future workforce member.

## Policy

### 1. What is logged

**Signed audit trail (`activities` table)** — the authoritative security record. Each entry is signed with HMAC-SHA256 so after-the-fact modification is detectable. It must cover at minimum:

- Authentication events: logins (success via the auth flow, lockout triggers).
- Authorization changes: role changes, member deactivation (`users.deactivated_at`).
- Entity lifecycle: create/update/delete (CRUD) of CRM entities, including soft-delete and restore.
- Each row carries: actor, tenant, action, target entity, timestamp.

A failure to write or sign an audit entry is itself an alertable event: signing/write failures raise a Sentry alert and are triaged as at least SEV2 if persistent (see [Incident Response Plan](04-incident-response-plan.md)).

**Error telemetry (Sentry EU)**: unhandled exceptions, API errors, and explicit security alerts (audit failures). 

**Availability**: `/api/health` is probed by a GitHub Actions uptime workflow; Vercel deployment and runtime errors are visible in the Vercel dashboard.

**Analytics (PostHog EU)**: product usage events only; never credentials or message content.

### 2. What is never logged

- Plaintext passwords, OAuth tokens, IMAP/CalDAV credentials, API keys, or `ELEVAY_APP_SECRET` (see [Encryption Policy](03-encryption-policy.md)).
- **Sentry events are PII-scrubbed** before leaving the application: emails, tokens, and request bodies containing personal data are stripped or masked. Disabling the scrubber requires an approved exception (none anticipated).
- Customer mailbox content in any operational log.

### 3. Retention

| Log | Retention | Rationale |
|---|---|---|
| Signed audit trail (`activities`) | **7 years** | Legal/forensic record; explicitly **exempt from the 30-day post-cancellation purge cron and from GDPR delete endpoints** (deletion requests remove CRM data; signed audit rows are retained under the legal-obligation/legitimate-interest basis) |
| Sentry events | Vendor default (90 days) | Operational debugging |
| Vercel / Supabase / GitHub logs | Vendor defaults | Operational; long-lived evidence is copied into incident notes when needed |
| PostHog analytics | Vendor default | Product analytics, not a security record |

When an incident occurs, relevant log excerpts are copied into the incident note in the compliance repository before vendor retention expires.

### 4. Tenant isolation and access to logs

Audit rows are tenant-scoped like all customer data (app-level scoping + Postgres RLS, migration 0038); a tenant can only ever see its own audit history. Read access to raw production logs (Supabase, Vercel, Sentry) is restricted per the [Access Control Policy](02-access-control-policy.md) and included in the quarterly access review.

### 5. Alerting paths

| Signal | Path | Expected reaction |
|---|---|---|
| Audit write/sign failure | Sentry alert -> email to founder | Triage same day; persistent failure = SEV2 |
| Unhandled production errors / error-rate spike | Sentry alert -> email | Triage per [Incident Response Plan](04-incident-response-plan.md) severity table |
| `/api/health` probe failure | GitHub Actions failure notification -> email | Treat as potential outage (SEV2/SEV3) |
| Deploy failure | Vercel notification | Fix or roll back before further merges |

Alert destinations must reach the founder's monitored inbox (martin@elevay.dev or the linked account); silent/dashboard-only alerting is not acceptable for the first two rows.

### 6. Log review cadence

- **Continuous (alert-driven)**: Sentry and uptime alerts are triaged as they arrive; this is the primary detection mechanism at solo stage.
- **Weekly**: skim the Sentry issue list for new error classes and confirm the uptime workflow is green (not silently disabled).
- **Quarterly** (aligned with the access review): sample the audit trail — verify recent role changes/deactivations are all present and signed, verify the GitHub audit log shows no unexpected repo access, verify Sentry scrubbing is still active on a sampled event.
- Review completion is noted (date + findings, even "none") in the compliance repository.

### 7. Solo-founder note / first employee

Alert fatigue is the main risk for a single operator: alert rules must stay high-signal (no per-event noise), and the weekly skim is mandatory precisely because there is no second pair of eyes. **When the first employee joins**: their actions appear in the GitHub and vendor audit logs; the quarterly sample must include at least one action by each workforce member, reviewed by someone other than the actor where possible.

## Roles & Responsibilities

| Role | Holder | Responsibilities |
|---|---|---|
| Security Owner | Martin Paviot | Owns alert routing, performs weekly and quarterly reviews, preserves evidence during incidents, keeps the scrubbing configuration intact. |
| Developers (future) | n/a currently | Ensure new security-relevant actions write signed audit entries; never add logging of secrets or unscrubbed PII. |

## Exceptions

Per the [Information Security Policy](01-information-security-policy.md) exception process. No exception may shorten the 7-year audit retention or disable audit signing.

## Review cadence

Reviewed and re-approved at least annually by the Security Owner. Next scheduled review: 2027-06-10.
