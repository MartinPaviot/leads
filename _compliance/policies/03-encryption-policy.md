# Encryption Policy

| Field | Value |
|---|---|
| Version | v1.0 |
| Date | 2026-06-10 |
| Owner | Martin Paviot |
| Classification | Internal |

Parent policy: [Information Security Policy](01-information-security-policy.md)

## Purpose

Define what data Elevay must encrypt, with which mechanisms, and who holds the keys, so that stored credentials and customer data remain protected even if a single layer (disk, backup, network path) is compromised.

## Scope

All Elevay production data: the Supabase Postgres database (EU region), Upstash Redis, data in transit between users, the application, and vendors, and all secrets used by the application. Applies to the founder and any future workforce member handling keys or encrypted data.

## Policy

### 1. What must be encrypted, and with what

| Data | Mechanism | Where |
|---|---|---|
| OAuth tokens stored for users (Google, Microsoft Entra mailbox/calendar access) | AES-256-GCM application-layer encryption keyed by `ELEVAY_APP_SECRET` | Postgres (Supabase) |
| IMAP and CalDAV credentials for connected mailboxes | AES-256-GCM (`ELEVAY_APP_SECRET`) | Postgres (Supabase) |
| Tenant API keys | AES-256-GCM (`ELEVAY_APP_SECRET`) | Postgres (Supabase) |
| All database contents (defense in depth under the above) | Provider-managed encryption at rest | Supabase |
| All traffic: browser to app, app to Supabase/Upstash/Inngest/third-party APIs | TLS 1.2+ | Everywhere; no plaintext listeners |
| User passwords | bcrypt cost 12 (one-way hash, not encryption) | Postgres (Supabase); see [Access Control Policy](02-access-control-policy.md) |
| Workstation disks used for development/operations | Full-disk encryption | Founder workstation |

Rules:

1. Any **new** stored credential type (tokens, secrets, keys held on a customer's behalf) must use the same AES-256-GCM application-layer pattern before shipping. Storing a third-party credential in plaintext columns is prohibited.
2. AES-GCM nonces must be unique per encryption operation (random 96-bit nonce stored with the ciphertext); ciphertexts are never re-encrypted in place with a reused nonce.
3. HTTPS is enforced with HSTS (max-age 2 years, preload). Downgrading or removing HSTS requires an approved exception.
4. No custom or homegrown cryptographic primitives. Only the platform AES-256-GCM implementation and TLS as provided by the runtime.

### 2. Key custody

- `ELEVAY_APP_SECRET` is the single application-layer data-encryption key. It lives **only** in Vercel environment configuration (production scope) and in the founder's password manager as escrow. It is never committed to git (gitleaks scans every push, see [Secure SDLC Policy](05-secure-sdlc-policy.md)), never written to logs, never placed in `.env` files that leave the developer machine.
- Provider-managed keys (Supabase at-rest encryption, TLS certificates on Vercel) are owned by the respective vendor; Elevay relies on vendor SOC 2 controls for their custody.
- Access to read `ELEVAY_APP_SECRET` equals access to all stored customer credentials; therefore Vercel production env access is restricted per the [Access Control Policy](02-access-control-policy.md) and reviewed quarterly.
- If `ELEVAY_APP_SECRET` is suspected exposed, that is at minimum a SEV2 incident (SEV1 if confirmed) under the [Incident Response Plan](04-incident-response-plan.md): the key is replaced, all ciphertexts re-encrypted, and all stored OAuth grants revoked/reauthorized as needed.

### 3. Prohibited practices

- Secrets in source code, git history, CI logs, Sentry events, or analytics.
- Transmitting customer credentials over channels other than the encrypted application path (no email, no chat).
- Exporting decrypted credential material outside the production runtime.

### 4. Accepted risk: key rotation deferred

A scheduled rotation procedure for `ELEVAY_APP_SECRET` (versioned keys, dual-read re-encryption) is **intentionally deferred** at the current stage. This is a documented accepted risk, approved by the Security Owner on 2026-06-10, on the grounds that: the key is held in exactly two places, access is single-person with MFA, and an emergency replacement path exists (section 2). This acceptance must be revisited at the next annual review or immediately upon the first employee joining, whichever comes first, with the expectation that a v1.1 of this policy introduces versioned key rotation.

### 5. Solo-founder note / first employee

**When the first employee joins**: the employee does not receive `ELEVAY_APP_SECRET` or Vercel production env read access by default; if their role requires it, the accepted risk in section 4 lapses and rotation tooling must be built before or alongside the grant.

## Roles & Responsibilities

| Role | Holder | Responsibilities |
|---|---|---|
| Security Owner | Martin Paviot | Key custody, approving any new cryptographic usage, owning the section 4 accepted risk, executing emergency key replacement. |
| Developers (future) | n/a currently | Use the established AES-256-GCM helper for any new stored credential; never introduce plaintext secret storage. |

## Exceptions

Per the [Information Security Policy](01-information-security-policy.md) exception process. No exception may permit plaintext storage of customer credentials or disabling TLS.

## Review cadence

Reviewed and re-approved at least annually by the Security Owner; the section 4 accepted risk is explicitly on the agenda of every review. Next scheduled review: 2027-06-10.
