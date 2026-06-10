# Access Control Policy

| Field | Value |
|---|---|
| Version | v1.0 |
| Date | 2026-06-10 |
| Owner | Martin Paviot |
| Classification | Internal |

Parent policy: [Information Security Policy](01-information-security-policy.md)

## Purpose

Define how access to Elevay production systems, vendor consoles, and customer data is granted, used, reviewed, and removed, so that only authorized identities hold access and every access is attributable to a named person.

## Scope

- **Workforce access**: founder (and future employees/contractors) access to Vercel, Supabase, GitHub (MartinPaviot/leads), Upstash, Inngest, Twilio, Stripe, Sentry, PostHog, the DNS registrar, Google Cloud / Microsoft Entra OAuth app registrations, and the production database.
- **Product access**: authentication and authorization of Elevay end users inside the application (NextAuth v5), including tenant member lifecycle.

## Policy

### 1. Identity rules

1. **Named accounts only.** Every vendor console account belongs to one named person. Shared or role-based logins (e.g., "admin@") are prohibited. If a vendor only supports one seat, the account is owned by the Security Owner and the credential is stored solely in the password manager.
2. **MFA required.** MFA must be enabled on every vendor console that supports it (GitHub, Vercel, Supabase, Twilio, Stripe, Sentry, PostHog, DNS registrar, Google, Microsoft). Inside the Elevay product, MFA (TOTP) is required for all admin-role users as soon as the TOTP feature ships; until then this is tracked as a gap closed by the in-flight implementation, and admin access is limited to the founder.
3. **Least privilege.** Grant the minimum role that does the job. Default to read-only roles for any future non-engineering access. API keys and tokens are scoped to the minimum capability (e.g., send-only mail keys) and stored per the [Encryption Policy](03-encryption-policy.md).

### 2. Provisioning

- Access is granted only by the Security Owner, recorded as a dated entry in the access register (a file in the compliance repository listing: person, system, role, date granted, justification).
- New workforce members receive access only after acknowledging the policy pack. Production database access and Vercel production env access are granted only when the role strictly requires them.

### 3. Deprovisioning and offboarding

- **Workforce offboarding**: all vendor console access, GitHub membership, and any shared secrets the person could have seen are removed or rotated within 24 hours of role end. The access register is updated the same day.
- **Product user offboarding**: tenant admins (and Elevay on request) deactivate members via the member-deactivation flow, which sets `users.deactivated_at`. Deactivation must take effect within 24 hours of the request; in practice it is immediate. The server-side session revocation guard (60-second re-check) ensures a deactivated user's JWT session stops working within at most 60 seconds, well inside the 8-hour token lifetime. Member deactivation events are written to the signed audit log.

### 4. Product authentication controls (operational baseline)

These controls are implemented in the product and must not be weakened without an approved exception:

- NextAuth v5 with credentials, Google, and Microsoft Entra OAuth sign-in.
- Passwords hashed with bcrypt at cost factor 12; candidate passwords screened against the HIBP breached-password corpus at set/change time.
- Account-level and IP-level lockout on repeated failed logins.
- JWT sessions limited to 8 hours, with the 60-second server-side revocation guard described above.
- Admin-role users must enroll TOTP MFA once the feature is released; admin actions without MFA enrollment will be blocked after a 14-day grace period from release.

### 5. Access reviews

- **Quarterly**: the Security Owner reviews every account, role, API key, OAuth grant, and deploy token on Vercel, Supabase, GitHub, Twilio, Stripe, and the DNS registrar (and the remaining consoles in scope at least annually). The review checks: is each identity still needed, is the role still minimal, is MFA still on, are there unknown keys or sessions. Findings and the completion date are recorded in the access register; stale access is removed during the review, not after.
- Unused API keys or tokens discovered at review are revoked immediately.

### 6. Solo-founder note / first employee

Currently the grantor, holder, and reviewer of access are the same person. Compensating controls: the quarterly review is evidenced in writing, MFA is universal, and the signed audit log records product-side role changes. **When the first employee joins**: the employee never receives registrar, Stripe, or production-database access by default; quarterly reviews must cover the employee's access explicitly; offboarding checklists are prepared on day one, not at departure.

## Roles & Responsibilities

| Role | Holder | Responsibilities |
|---|---|---|
| Security Owner | Martin Paviot | Grants/revokes access, runs quarterly reviews, maintains the access register, enforces MFA. |
| Tenant admins (customers) | per tenant | Manage their own members; deactivations honored within 24 hours. |

## Exceptions

Per the exception process in the [Information Security Policy](01-information-security-policy.md). Exceptions to the MFA or named-account rules require a compensating control (e.g., IP allowlisting) and expire in at most 90 days.

## Review cadence

Reviewed and re-approved at least annually by the Security Owner. Quarterly access reviews are an operating control under this policy, not a policy review. Next scheduled policy review: 2027-06-10.
