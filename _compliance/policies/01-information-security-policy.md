# Information Security Policy

| Field | Value |
|---|---|
| Version | v1.0 |
| Date | 2026-06-10 |
| Owner | Martin Paviot |
| Classification | Internal |

## Purpose

This policy is the umbrella document of Elevay's information security management system (ISMS). It defines how Elevay protects the confidentiality, integrity, and availability of customer data processed by the Elevay product (www.elevay.dev), an autonomous GTM/CRM SaaS, and of the systems and vendor accounts used to build and operate it.

It exists so that security decisions are made the same way every time, are auditable, and survive the transition from a one-person company to a team.

## Scope

- **Legal entity / people**: Elevay, operated by founder Martin Paviot (France). At the current stage there is exactly one workforce member (the founder). Every control in this policy pack is written to be operable by one person; sections marked "When the first employee joins" describe the additional steps required at that point.
- **Systems**: the production application (Next.js 15 on Vercel Fluid Compute), Postgres on Supabase (EU region), Redis on Upstash, background jobs on Inngest, the GitHub repository (MartinPaviot/leads), and all vendor consoles holding production access or customer data (Vercel, Supabase, GitHub, Upstash, Inngest, Twilio, Stripe, Sentry, PostHog, DNS registrar, Google/Microsoft OAuth app registrations).
- **Data**: all customer (tenant) data, credentials and tokens stored on customers' behalf, audit records, and Elevay's own secrets.

Out of scope: customers' own security practices inside their tenant.

## Policy

### 1. Security objectives

1. Customer data is isolated per tenant through application-level scoping: every query carries an explicit `tenant_id` predicate enforced at the `getAuthContext`/`withAuthRLS` chokepoints. Note (verified in production 2026-06-10): Postgres row-level security is NOT currently active on the production database (no policies present; the application role bypasses RLS) — see risk R-08b. RLS defense-in-depth requires a dedicated non-bypassing database role before it can be claimed.
2. Data stays in the EU. Region configuration is validated at application boot (Supabase DB, Anthropic EU endpoint, Sentry DE, PostHog EU, Twilio ie1); the application refuses to start against a non-conforming region.
3. Secrets and stored credentials are encrypted at rest and in transit (see [Encryption Policy](03-encryption-policy.md)).
4. Every security-relevant action is recorded in a tamper-evident audit trail (see [Logging and Monitoring Policy](06-logging-monitoring-policy.md)).
5. Changes reach production only through the controlled path defined in the [Secure SDLC Policy](05-secure-sdlc-policy.md).
6. Incidents, including personal-data breaches under GDPR, are handled per the [Incident Response Plan](04-incident-response-plan.md).

### 2. Policy pack

This document governs and is implemented by:

1. [Access Control Policy](02-access-control-policy.md)
2. [Encryption Policy](03-encryption-policy.md)
3. [Incident Response Plan](04-incident-response-plan.md)
4. [Secure SDLC Policy](05-secure-sdlc-policy.md)
5. [Logging and Monitoring Policy](06-logging-monitoring-policy.md)

If a subordinate policy conflicts with this document, this document prevails until the conflict is resolved at the next review.

### 3. Risk management

- A risk register is maintained alongside this policy pack. Risks are reviewed at least annually and whenever the architecture changes materially (new vendor, new data category, new region).
- Accepted risks must be written down with the rationale and the owner's sign-off. Current explicitly accepted risks: deferred rotation procedure for `ELEVAY_APP_SECRET` (see [Encryption Policy, section 4](03-encryption-policy.md)).
- Risk treatment favors removing the exposure (e.g., not storing data, EU-only vendors) over compensating controls.

### 4. Acceptable use and workstation security

- Production access happens only from the founder's managed workstation with full-disk encryption enabled and OS auto-updates on.
- Production credentials live in a password manager and Vercel environment configuration, never in plaintext files, chat logs, or the git repository (enforced by gitleaks in CI).
- No customer data is copied to local machines except transiently for debugging, and it is deleted when the task ends.

### 5. Vendor and subprocessor management

- Before adopting a vendor that touches customer data: confirm EU data residency option, review the vendor's security page / SOC 2 or ISO 27001 status, and record the decision.
- The subprocessor list (Vercel, Supabase, Upstash, Inngest, Anthropic, Sentry, PostHog, Twilio, Stripe) is reviewed at each annual policy review and on every vendor change.

### 6. Data protection (GDPR)

- Elevay provides export and deletion endpoints for tenant data. Cancelled tenants are purged by a cron job 30 days after cancellation; signed audit rows are exempt and retained 7 years.
- Breach notification obligations (CNIL within 72 hours, affected customers) are operationalized in the [Incident Response Plan](04-incident-response-plan.md).

### 7. Solo-founder operating note

Where a control normally requires separation of duties (e.g., independent code review, independent access review), the compensating controls at the current stage are: mandatory CI gates that cannot be self-waived without a recorded exception, the signed audit trail, and documented self-review with evidence (PR descriptions, quarterly access-review records).

**When the first employee joins**: onboarding must include reading this policy pack and signing acknowledgment; access is provisioned per the [Access Control Policy](02-access-control-policy.md); code review by a second person becomes mandatory for production changes; the access reviewer and the access holder must be different people where possible.

## Roles & Responsibilities

| Role | Holder | Responsibilities |
|---|---|---|
| Security Owner | Martin Paviot | Owns the ISMS, approves exceptions, runs reviews, is the incident commander and GDPR contact (martin@elevay.dev). |
| All workforce members | Martin Paviot (currently) | Comply with this pack, report suspected incidents immediately. |

## Exceptions

Any deviation from this policy pack must be requested in writing (a dated note in the compliance repository), state the risk, the compensating control, and an expiry date no longer than 12 months. Only the Security Owner may approve exceptions. Open exceptions are reviewed at the annual review.

## Review cadence

This policy is reviewed and re-approved at least annually by the Security Owner, and after any material change (first hire, new subprocessor, new data category, major architecture change). Next scheduled review: 2027-06-10.
