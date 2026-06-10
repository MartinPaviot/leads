# Incident Response Plan

| Field | Value |
|---|---|
| Version | v1.0 |
| Date | 2026-06-10 |
| Owner | Martin Paviot |
| Classification | Internal |

Parent policy: [Information Security Policy](01-information-security-policy.md)
Security contact: **martin@elevay.dev**

## Purpose

Define how Elevay detects, classifies, contains, and resolves security and availability incidents affecting the Elevay product, and how it meets GDPR breach-notification obligations (CNIL within 72 hours, affected customers without undue delay).

## Scope

All incidents touching production: the application on Vercel, Supabase Postgres, Upstash Redis, Inngest jobs, vendor consoles, stored customer credentials, and customer personal data. Applies to the founder and any future workforce member or contractor.

## Policy

### 1. Severity levels (with Elevay-specific examples)

| Level | Definition | Concrete examples | Response target |
|---|---|---|---|
| **SEV1** | Confirmed or strongly suspected compromise of customer data or credentials; or total prod outage with data risk | A connected-mailbox OAuth token or IMAP credential leaks (e.g., `ELEVAY_APP_SECRET` exposed, decrypted token in a log); tenant data cross-leak (tenant A sees tenant B's contacts/deals, i.e., RLS or app-scoping failure); attacker access to a vendor console | Start within 1 hour of detection; work continuously until contained |
| **SEV2** | Material degradation or contained security weakness, no confirmed data exposure | Full prod outage of www.elevay.dev with no data risk (bad deploy, Vercel/Supabase incident); audit-log signing failures persisting; lockout/auth bypass found before exploitation; suspected but unconfirmed key exposure | Start within 4 hours |
| **SEV3** | Limited impact, no data exposure | Single-feature breakage (e.g., Inngest job backlog, mail sync down for one tenant); dependency CVE in a non-exposed path; failed login storm absorbed by lockout | Start within 1 business day |

If in doubt between two levels, pick the higher one. A SEV3 that reveals data exposure is re-classified immediately.

### 2. Detection sources

Sentry alerts (EU, including audit-log signing failures), the GitHub Actions uptime probe against `/api/health`, Vercel deploy/runtime alerts, vendor security notices, customer reports to martin@elevay.dev, and anomalies in the signed audit trail (see [Logging and Monitoring Policy](06-logging-monitoring-policy.md)).

### 3. Response steps

1. **Declare and log.** Open an incident note (timestamped file in the compliance repository): detection time, severity, what is known. Keep a running timeline; this file is the evidence record.
2. **Contain.**
   - Token/credential leak: rotate the affected secret in Vercel env; revoke OAuth grants at Google/Microsoft; force re-encryption or invalidation of affected stored credentials; deactivate compromised users (`users.deactivated_at`, effective within 60 seconds via the revocation guard).
   - Tenant cross-leak: take the affected surface offline (feature flag or revert deploy via Vercel), capture evidence of which rows were exposed to whom from the audit trail and DB logs before fixing.
   - Prod outage: roll back to the last good Vercel deployment; if vendor-side, track the vendor status page and mitigate (maintenance page, queue pause in Inngest).
3. **Assess data impact.** Determine: which tenants, which data categories (contact PII, mailbox content, credentials), time window, and whether exposure is confirmed, likely, or ruled out. Write the conclusion and reasoning in the incident note.
4. **Notify (GDPR).** If personal data was breached and risk to individuals is not unlikely:
   - **CNIL within 72 hours of awareness** via https://notifications.cnil.fr (the controller is the Elevay legal entity, contact martin@elevay.dev). Partial notification is acceptable at 72 hours if investigation is ongoing; supplement later.
   - **Affected customers without undue delay** when risk is high, by email from martin@elevay.dev, using the template in section 5.
   - Record the notify/no-notify decision and rationale in the incident note even when the decision is not to notify.
5. **Eradicate and recover.** Fix the root cause through the normal PR/CI path ([Secure SDLC Policy](05-secure-sdlc-policy.md)); emergency hotfixes may merge with CI green but documentation completed within 24 hours. Verify recovery against `/api/health`, Sentry error rates, and a manual tenant-isolation spot check when isolation was involved.
6. **Close.** An incident closes only when containment, root-cause fix, notifications, and the post-mortem are done.

### 4. Post-mortem (required)

Within 5 business days of closing a SEV1 or SEV2 (optional for SEV3), write a post-mortem in the compliance repository: timeline, root cause, blast radius, what worked / what did not, and corrective actions each with an owner and due date. SEV1 corrective actions that are regression-preventable must include a test (consistent with the regression-test rule in the SDLC policy).

### 5. Communication templates

**Customer breach notification (email from martin@elevay.dev):**

> Subject: Security notice from Elevay regarding your account
>
> On [date/time UTC] we identified [plain-language description of the incident]. Our investigation shows that the following data related to your workspace was affected: [data categories], during [time window]. We have [containment actions taken]. We recommend you [concrete actions: e.g., reconnect your mailbox, rotate the affected API key]. We reported this incident to the CNIL on [date]. For questions, reply to this email or contact martin@elevay.dev. We will send a follow-up when the investigation concludes.

**Status/outage notice (SEV2 outage, no data impact):**

> Subject: Elevay service disruption on [date]
>
> Between [start] and [end] (UTC), www.elevay.dev was [unavailable / degraded: scope]. No customer data was exposed or lost. Cause: [one sentence]. Corrective action: [one sentence].

### 6. Solo-founder note / first employee

The founder is the sole responder; therefore the 72-hour CNIL clock is the binding constraint and step 4 takes priority over root-cause work once containment is done. **When the first employee joins**: define an on-call backup, share the incident-note location, and run one tabletop exercise (SEV1 token-leak scenario) within the first quarter.

## Roles & Responsibilities

| Role | Holder | Responsibilities |
|---|---|---|
| Incident Commander | Martin Paviot | Declares, classifies, contains, decides on notification, writes the post-mortem. |
| GDPR contact / controller representative | Martin Paviot (martin@elevay.dev) | CNIL and customer notifications. |

## Exceptions

None permitted for notification obligations (statutory). Operational deviations (e.g., delayed post-mortem) follow the [Information Security Policy](01-information-security-policy.md) exception process.

## Review cadence

Reviewed and re-approved at least annually by the Security Owner, and updated after every SEV1/SEV2 post-mortem if gaps were found. Next scheduled review: 2027-06-10.
