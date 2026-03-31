# Security & Privacy Best Practices for Multi-Tenant SaaS GTM Engine

**Last updated:** 2026-03-30
**Status:** Complete
**Scope:** Multi-tenant data isolation, credential storage, encryption, PII handling, email/meeting data security, API key management, authentication, SOC 2, data retention

---

## Table of Contents

1. [Multi-Tenant Data Isolation Strategies](#1-multi-tenant-data-isolation-strategies)
2. [Credential Storage for OAuth Tokens](#2-credential-storage-for-oauth-tokens)
3. [Encryption at Rest and in Transit](#3-encryption-at-rest-and-in-transit)
4. [Contact/Lead Data Privacy (PII, GDPR)](#4-contactlead-data-privacy-pii-gdpr)
5. [Email Data Handling](#5-email-data-handling)
6. [Meeting Recording Storage and Access Control](#6-meeting-recording-storage-and-access-control)
7. [API Key Management for Third-Party Integrations](#7-api-key-management-for-third-party-integrations)
8. [Authentication Security](#8-authentication-security)
9. [SOC 2 / Compliance Considerations for Early Stage](#9-soc-2--compliance-considerations-for-early-stage)
10. [Data Retention Policies](#10-data-retention-policies)

---

## 1. Multi-Tenant Data Isolation Strategies

### Three Isolation Models

| Model | Description | Cost | Isolation | Complexity | Best For |
|---|---|---|---|---|---|
| **Shared schema (Pool)** | All tenants share the same tables; rows distinguished by `tenant_id` column | Lowest | Lowest (logical only) | Lowest for ops, highest for discipline | Early-stage SaaS, cost-sensitive, < 1000 tenants |
| **Separate schemas (Bridge)** | Same database instance, each tenant gets its own schema namespace | Medium | Medium | Medium (migration complexity grows per tenant) | Mid-market SaaS with moderate isolation needs |
| **Separate databases (Silo)** | Each tenant gets a dedicated database instance | Highest | Highest (physical) | Highest (provisioning, migrations, connection management) | Enterprise customers with contractual isolation requirements, regulated industries |

### Recommendation: Shared Schema + PostgreSQL Row-Level Security (RLS)

For an early-stage SaaS product, the shared schema model with PostgreSQL RLS is the standard approach in 2025-2026. RLS moves tenant filtering from the application layer to the database engine, which means:

- **Fail-safe by default**: If you forget to apply a filter in application code, RLS still blocks cross-tenant access. Missing a WHERE clause in a dynamic query leaks data; with RLS, forgetting a policy just fails closed.
- **Single migration path**: Schema changes, upgrades, and migrations only need to be performed once across all tenants.
- **Resource efficiency**: Shared connection pools, shared indexes, shared backups.

#### Implementation Pattern

```sql
-- Add tenant_id to every table
ALTER TABLE contacts ADD COLUMN tenant_id UUID NOT NULL;
ALTER TABLE emails ADD COLUMN tenant_id UUID NOT NULL;
ALTER TABLE deals ADD COLUMN tenant_id UUID NOT NULL;

-- Create B-tree index on tenant_id (critical for performance)
CREATE INDEX idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX idx_emails_tenant ON emails(tenant_id);

-- Enable RLS on each table
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY tenant_isolation ON contacts
  USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- Set tenant context at the start of each request
SET app.current_tenant = '<tenant-uuid>';
```

#### Performance Considerations

- RLS policies are evaluated for every single row during query execution. The `tenant_id` column **must** be indexed (B-tree).
- For composite primary keys, `tenant_id` should be the **first** column in the key.
- RLS adds measurable but typically acceptable overhead (single-digit percentage) when properly indexed.
- Test query plans with `EXPLAIN ANALYZE` to confirm index usage.

#### Escape Hatch: Hybrid Model

The most common production pattern is a hybrid that uses the shared schema for most tenants but offers dedicated schemas or databases as an upsell for enterprise customers requiring contractual data isolation. Design the application layer with a `TenantConnectionResolver` abstraction from day one so you can route high-value tenants to dedicated infrastructure without architectural changes.

### Critical Safeguards

| Safeguard | Details |
|---|---|
| **RLS on every tenant-scoped table** | No exceptions. If it has a `tenant_id`, it has RLS. |
| **Middleware sets tenant context** | Every request sets `app.current_tenant` before any query. If the context is missing, queries return zero rows (fail closed). |
| **Superuser queries disabled in app** | The application database role must not be a superuser (superusers bypass RLS). |
| **Integration tests for isolation** | Write tests that create data for Tenant A and verify Tenant B cannot see it. Run on every CI build. |
| **Audit logging** | Log tenant context on every write operation. Detect and alert on any cross-tenant access attempts. |

---

## 2. Credential Storage for OAuth Tokens

### Threat Model

Our product connects to customer Google Workspace and Microsoft 365 accounts to sync emails, calendar, and contacts. This means we store OAuth refresh tokens that grant long-lived access to customer email. A breach of these tokens is equivalent to breaching every connected customer's inbox.

### Storage Architecture

#### Envelope Encryption with Per-Tenant Keys

```
┌─────────────────────────────────────────────┐
│              Application Layer               │
│                                              │
│  1. Generate random DEK (Data Encryption Key)│
│  2. Encrypt token with DEK (AES-256-GCM)    │
│  3. Encrypt DEK with KEK from KMS           │
│  4. Store: encrypted_token + encrypted_DEK   │
│     + IV + auth_tag in database              │
└─────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌──────────────┐    ┌──────────────────┐
│   Database   │    │   KMS (AWS/GCP)  │
│              │    │                  │
│ encrypted_   │    │ KEK (never       │
│ token blob   │    │ leaves KMS)      │
│ encrypted_   │    │                  │
│ DEK blob     │    │ Key rotation     │
│ IV (12 bytes)│    │ managed by KMS   │
│ auth_tag     │    │                  │
└──────────────┘    └──────────────────┘
```

#### Why Envelope Encryption

- The KEK (Key Encryption Key) **never leaves the KMS hardware**. Even if the database is fully compromised, tokens cannot be decrypted without KMS access.
- Per-value random IVs (12-byte, cryptographically random) ensure identical tokens produce different ciphertexts.
- AES-256-GCM provides both confidentiality and integrity (detects tampering).
- Key rotation only requires re-encrypting DEKs (not re-encrypting all tokens), making rotation fast and non-disruptive.

### Best Practices

| Practice | Details |
|---|---|
| **AES-256-GCM encryption at rest** | Every refresh token, access token, and client secret encrypted before database write. Random 12-byte IV per encryption operation. |
| **Managed KMS for KEKs** | AWS KMS, GCP Cloud KMS, or Azure Key Vault. Never store KEKs in application code, environment variables, or the same database. |
| **Automatic key rotation** | Rotate KEKs at least annually (quarterly preferred). KMS handles this transparently. |
| **Short-lived access tokens** | Access tokens: 15-60 minute expiry. Only refresh when needed. Never cache access tokens in persistent storage. |
| **Refresh token rotation** | Use one-time-use refresh tokens where supported (Google supports this). Each use of a refresh token returns a new one; the old one is invalidated. |
| **Token revocation on security events** | Immediately revoke all tokens for an account on: password change, MFA change, account deactivation, suspected compromise. |
| **PKCE for all OAuth flows** | RFC 9700 (January 2025) mandates PKCE for all OAuth clients. Over 90% of major SaaS platforms now require it. |
| **Scope minimization** | Request only the OAuth scopes actually needed. Use incremental authorization (request additional scopes only when the user needs that feature). |
| **No tokens in logs** | Redact all tokens from application logs, error messages, and stack traces. |
| **Database access controls** | The database user for the application should have SELECT/INSERT/UPDATE on token tables but the encryption keys should not be accessible to DBAs or developers. |

### Google and Microsoft Specific Guidance

| Provider | Key Requirement |
|---|---|
| **Google** | Use incremental authorization. Integrate with Cross-Account Protection service for revocation notifications. Refresh tokens can be revoked by the user at any time from Google Account settings -- handle `invalid_grant` errors gracefully. |
| **Microsoft** | Use MSAL (Microsoft Authentication Library). Token cache serialization is built in. Support Conditional Access policies. Handle token lifetime policies set by tenant admins. |

---

## 3. Encryption at Rest and in Transit

### Encryption in Transit

| Requirement | Standard |
|---|---|
| **Minimum TLS version** | TLS 1.2 (NIST minimum). TLS 1.3 preferred for all new implementations. |
| **Disabled protocols** | SSL 3.0, TLS 1.0, TLS 1.1 must be disabled -- all contain known vulnerabilities. |
| **Perfect forward secrecy** | Required. Use ECDHE key exchange. Ensures that compromise of the server's private key does not compromise past session traffic. |
| **HSTS header** | `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` on all responses. |
| **Certificate management** | Automated via Let's Encrypt or AWS ACM. No self-signed certificates in production. |
| **Internal service communication** | mTLS (mutual TLS) between microservices. Do not assume internal networks are trusted. |
| **Database connections** | TLS required for all database connections (`sslmode=verify-full` in PostgreSQL). |
| **API communication** | All API calls to third-party services (LLM providers, data enrichment, email APIs) over HTTPS only. Fail hard on certificate validation errors. |

### Encryption at Rest

| Layer | Standard | Implementation |
|---|---|---|
| **Database storage** | AES-256 | Enable transparent data encryption (TDE) at the database/disk level. AWS RDS, GCP Cloud SQL, and Azure SQL all offer this by default. |
| **Application-level encryption** | AES-256-GCM | For highly sensitive fields (OAuth tokens, API keys, PII), apply application-level encryption before writing to the database. This protects against database-level compromises that bypass TDE. |
| **File/blob storage** | AES-256 | S3 server-side encryption (SSE-S3 or SSE-KMS), GCS default encryption, or Azure Storage encryption. All enabled by default in 2026. |
| **Backups** | AES-256 | Encrypted backups are non-negotiable. Verify backup encryption is enabled -- do not assume cloud defaults are sufficient. |
| **Search indexes** | AES-256 | If using Elasticsearch/OpenSearch, enable encryption at rest. Search indexes can contain copies of sensitive data. |

### Key Management Hierarchy

```
┌─────────────────────────┐
│    Root Key (HSM)       │  Hardware Security Module -- never exported
├─────────────────────────┤
│    KEK (KMS-managed)    │  Key Encryption Key -- encrypts DEKs
├─────────────────────────┤
│    DEK (per-resource)   │  Data Encryption Key -- encrypts actual data
└─────────────────────────┘
```

- **Root keys** live in HSMs (hardware security modules) within the KMS and are never exported.
- **KEKs** are managed by KMS and rotated automatically (annually minimum, quarterly preferred).
- **DEKs** are generated per-resource or per-record, encrypted by KEKs, and stored alongside the ciphertext.
- **Separation of duties**: The team that manages KMS keys should not be the same team that manages the database.

### Data Integrity

- Use AEAD (Authenticated Encryption with Associated Data) modes like AES-GCM to ensure data has not been tampered with.
- Validate HMAC/auth tags on every decryption. Fail hard on integrity check failures.

---

## 4. Contact/Lead Data Privacy (PII, GDPR)

### What Constitutes PII in a CRM/GTM Context

| Data Type | PII Classification | Notes |
|---|---|---|
| Full name | Direct PII | Always PII |
| Email address | Direct PII | Even business email contains the individual's name |
| Phone number | Direct PII | Direct identifier |
| Job title + company | Quasi-identifier | Combined with other fields, can identify an individual |
| LinkedIn URL | Direct PII | Unique identifier |
| IP address | PII under GDPR | Not always PII under US law, but treat as PII |
| Email content | Contains PII | May contain names, addresses, personal details |
| Meeting transcripts | Contains PII | Voice biometrics + content = highly sensitive |
| Deal notes | May contain PII | Depends on what the user writes |
| Behavioral data (email opens, clicks) | PII under GDPR | Linked to an identified individual |

### GDPR Data Subject Rights Implementation

| Right | Implementation Requirement | Deadline |
|---|---|---|
| **Right to access (Art. 15)** | Export all personal data held about the individual in a structured, machine-readable format (JSON/CSV). Must include: data categories, purposes, recipients, retention periods, source of data. | 1 month (extendable to 3 for complex requests) |
| **Right to rectification (Art. 16)** | Allow correction of inaccurate data. Propagate corrections to any third parties data was shared with. | Without undue delay |
| **Right to erasure (Art. 17)** | Delete all personal data. Cascade to all systems (primary DB, search indexes, caches, analytics, logs). Retain only email address on suppression list. | 1 month (extendable to 3) |
| **Right to object (Art. 21)** | Stop all direct marketing processing immediately upon objection. No exceptions, no "processing period." | Immediately |
| **Right to data portability (Art. 20)** | Provide data in structured, commonly used, machine-readable format. Enable direct transfer to another controller where technically feasible. | 1 month |
| **Right to restrict processing (Art. 18)** | Mark data as restricted. Store but do not process. | Without undue delay |

### Erasure Implementation Strategy

#### Primary Systems

1. **Hard delete** from all active database tables (contacts, emails, activities, deals, notes, tasks).
2. **Cascade deletion** through all foreign key relationships. Use database-level CASCADE or application-level orchestration with a deletion manifest.
3. **Clear from search indexes** (Elasticsearch, typesense, etc.). Trigger re-indexing or explicit document deletion.
4. **Clear from application caches** (Redis, in-memory caches).
5. **Clear from CDN caches** if any cached responses contain the data.
6. **Retain suppression entry**: Keep the email address (hashed if preferred) on a suppression list to prevent re-enrollment. This is explicitly permitted under GDPR.

#### Backup Systems

The February 2026 EDPB Coordinated Enforcement Framework report explicitly identified backup systems as a compliance concern. The accepted approach:

- **Immediate deletion from active systems** upon erasure request.
- **Mark for deletion in backup metadata** ("deletion manifest").
- **Apply deletion manifest on backup restoration**: If a backup is restored, the deletion manifest must be applied before the restored data becomes active.
- **Document the approach**: Communicate backup retention timelines to data subjects (e.g., "Data is deleted from active systems within 30 days. Backup copies are overwritten within 90 days as part of our normal rotation schedule.").
- **Cryptographic erasure as an option**: If data within backups is encrypted with per-record or per-tenant keys, destroying the key renders the data permanently inaccessible without modifying the backup. This is the cleanest approach for immutable backup stores.

#### Logging and Analytics

- **Anonymize or pseudonymize** personal data in analytics pipelines. Aggregate data should not be reversible to individuals.
- **Log retention limits**: Set maximum retention for logs containing PII (90 days recommended). After that, purge or anonymize.
- **No PII in error tracking**: Ensure Sentry/Datadog/etc. do not capture PII in error payloads.

### CCPA (California) Considerations

| Requirement | Details |
|---|---|
| **Right to know** | Similar to GDPR right of access. Must disclose categories of data collected, sold, or shared. |
| **Right to delete** | Similar to GDPR right to erasure. Must delete and direct service providers to delete. |
| **Right to opt-out of sale** | If selling or sharing personal information, must provide a "Do Not Sell or Share My Personal Information" link. |
| **Data broker registration** | If the product collects and sells consumer data, must register with the California Privacy Protection Agency by January 31 each year and pay a $6,000 annual fee. As of August 2026, registered data brokers must process consumer deletion requests via the DELETE Request and Opt-Out Platform (DROP) every 45 days. |
| **No consent required for B2B** | CCPA B2B exemption has been extended multiple times; check current status. As of 2026, B2B contact data may still have limited exemptions but the trend is toward full coverage. |

### Implementation Architecture

Build a **Privacy Request Handler** as a first-class service:

```
┌──────────────────────────────────────────────┐
│            Privacy Request Handler            │
│                                               │
│  POST /api/privacy/erasure {email, tenant_id} │
│  POST /api/privacy/export  {email, tenant_id} │
│  POST /api/privacy/rectify {email, fields}    │
│                                               │
│  1. Authenticate request (verify identity)    │
│  2. Locate all data across all systems        │
│  3. Execute operation (delete/export/update)  │
│  4. Verify completion                         │
│  5. Log audit trail                           │
│  6. Send confirmation to requester            │
└──────────────────────────────────────────────┘
```

This service should:
- Maintain a **data map** of every system that stores personal data.
- Execute deletions/exports across all systems in the map.
- Generate a **completion certificate** for audit purposes.
- Be tested regularly with automated deletion drills.

---

## 5. Email Data Handling

### Threat Profile

Stored customer emails are the single most sensitive data asset in this product. They contain:
- Business communications (confidential deals, strategies, pricing)
- Personal information of contacts (PII)
- Attachments (potentially containing financial data, contracts, etc.)
- Metadata (who communicates with whom, frequency, timing)

### Storage Architecture

| Component | Encryption | Access Control |
|---|---|---|
| **Email metadata** (subject, from, to, date, thread_id) | AES-256 at rest (database TDE) + application-level encryption for subject line | Tenant-isolated via RLS |
| **Email body** (HTML/text content) | AES-256-GCM application-level encryption with per-tenant DEK | Tenant-isolated via RLS + application authorization |
| **Attachments** | AES-256 server-side encryption in object storage (S3/GCS) with per-tenant prefix isolation | Signed URLs with short expiry (15 minutes), tenant-scoped IAM policies |
| **Email search index** | Encrypted at rest | Tenant-scoped queries only; no cross-tenant search possible |
| **Email sync state** (sync cursors, message IDs) | Database TDE | Tenant-isolated |

### Access Model

- **Owner access**: The user who connected the email account can see all synced emails.
- **Team access**: Other users in the same tenant can see emails associated with shared contacts/deals only (configurable per workspace).
- **Admin access**: Tenant admins can configure sharing policies but cannot read individual emails unless explicitly granted.
- **Platform access**: Our engineering team has **zero access** to customer email content. Application-level encryption with customer-managed keys (or at minimum, per-tenant keys in KMS) ensures even database administrators cannot read email content.

### Sync Security

| Concern | Mitigation |
|---|---|
| **OAuth token for email access** | Envelope-encrypted at rest (see Section 2). Minimum required scopes only. |
| **Data in transit during sync** | TLS 1.2+ for all IMAP/Graph API connections. Certificate pinning for Google and Microsoft endpoints. |
| **Sync worker isolation** | Each sync job runs with tenant-scoped credentials. A compromised sync worker for Tenant A cannot access Tenant B's email. |
| **Rate limiting** | Respect provider rate limits (Google: 10,000 requests/user/day; Microsoft: varies by plan). Implement exponential backoff. |
| **Partial sync failures** | Use idempotent sync with watermarks/delta tokens. Never re-process already-synced emails. |
| **Webhook verification** | Verify signatures on Google Pub/Sub and Microsoft Graph webhook notifications. Reject unverified payloads. |

### Email Content Processing for AI

When sending email content to LLM providers for summarization, coaching, or analysis:

- **Strip PII before sending** where possible (replace names/emails with placeholders, process with entity recognition).
- **Use a DPA-covered LLM provider** (see Section 7).
- **Never send raw email content in prompts** that could be logged by the provider. Use providers with zero-retention API agreements.
- **Cache AI results** locally to avoid re-sending the same content multiple times.

---

## 6. Meeting Recording Storage and Access Control

### Data Sensitivity

Meeting recordings contain:
- **Audio/video of participants** (biometric data under some regulations)
- **Spoken business information** (strategies, pricing, competitive intelligence)
- **Transcripts** (searchable text that makes recordings even more sensitive)
- **Screen shares** (may contain sensitive documents, dashboards, financial data)

### Storage Security

| Component | Storage | Encryption | Retention |
|---|---|---|---|
| **Raw audio/video files** | Object storage (S3/GCS) in a dedicated, non-public bucket | AES-256 server-side encryption (SSE-KMS) with per-tenant keys | Configurable per tenant, default 12 months |
| **Transcripts** | Database (text) | Application-level AES-256-GCM encryption | Same as recording |
| **AI-generated summaries** | Database (text) | Database TDE + RLS | Same as recording |
| **Speaker identification data** | Database | Application-level encryption | Same as recording |

### Access Control

| Level | Who | Access |
|---|---|---|
| **Recording owner** | Meeting host / the user who connected the integration | Full access: play, download, share, delete |
| **Meeting participants** | Other users in the tenant who were in the meeting | View/play access only (configurable) |
| **Team members** | Users on the same team, not in the meeting | No access by default. Access granted only if recording is explicitly shared or attached to a deal/contact. |
| **Tenant admin** | Workspace administrator | Can set recording policies (retention, sharing defaults). Cannot access individual recordings unless explicitly granted. |
| **Platform engineers** | Our team | **Zero access.** Per-tenant encryption keys prevent platform-level access. |

### Recording Consent

| Jurisdiction | Requirement |
|---|---|
| **US (federal)** | One-party consent for recording (the recorder consents) |
| **US (11 states: CA, CT, FL, IL, MD, MA, MI, MT, NH, PA, WA)** | Two-party / all-party consent required |
| **EU (GDPR)** | Must obtain explicit consent from all participants before recording. Must provide notice of the purpose and retention period. |
| **Canada** | One-party consent federally; some provinces require all-party. |

**Implementation**: Display a clear consent banner when recording starts. Log consent per participant. Allow participants to opt out (they leave the meeting or the recording stops). Store consent records alongside the recording metadata.

### Delivery Security

- **Signed URLs**: All recording playback uses time-limited, signed URLs (15-minute expiry). No permanent public links.
- **No CDN caching of recordings**: Recordings should not be cached on CDN edge nodes. Stream directly from encrypted storage.
- **Download controls**: Configurable per workspace. Disable downloads by default. If enabled, watermark downloads with the requesting user's identity.

---

## 7. API Key Management for Third-Party Integrations

### Inventory of Third-Party Integrations

| Integration Type | Examples | Data Sent | Risk Level |
|---|---|---|---|
| **LLM providers** | OpenAI, Anthropic, Google AI | Email content, meeting transcripts, contact context | Critical -- customer content exposed |
| **Data enrichment** | Clearbit, Apollo, ZoomInfo | Contact emails, company domains | High -- PII shared |
| **Email delivery** | Resend, Postmark, SendGrid | Email content, recipient addresses | High -- full email content |
| **Calendar/Meeting** | Google Calendar, Microsoft Graph | Meeting details, participant lists | High -- schedule data |
| **Payment** | Stripe | Customer billing info | Critical -- financial data |
| **Analytics/monitoring** | Segment, Datadog, Sentry | Usage data, potentially PII in errors | Medium |

### Secrets Management Architecture

#### Use a Dedicated Secrets Manager

**Do not** store API keys in:
- Environment variables (visible in process listings, logged in crash dumps)
- Configuration files (committed to git, readable by any process)
- Database alongside application data (compromised DB = compromised keys)

**Do** use a managed secrets manager:

| Solution | Best For | Key Features |
|---|---|---|
| **AWS Secrets Manager** | AWS-native deployments | Automatic rotation, fine-grained IAM policies, audit logging via CloudTrail |
| **GCP Secret Manager** | GCP-native deployments | IAM integration, automatic replication, versioning |
| **HashiCorp Vault** | Multi-cloud / hybrid | Dynamic secrets, leases with TTL, comprehensive audit logging, supports any infrastructure |
| **Infisical** | Developer-friendly, startup stage | Open-source option, environment syncing, simple SDK |
| **Doppler** | Team-focused | Centralized dashboard, environment management, easy rotation |

#### Key Lifecycle Management

| Practice | Details |
|---|---|
| **Rotation schedule** | Rotate every 60-90 days. More frequently for high-risk keys (LLM providers, payment). |
| **Automatic rotation** | Use secrets managers that support automatic rotation with zero-downtime rollover (dual-key period). |
| **Least privilege** | Each API key should have the minimum permissions required. Create separate keys for read vs. write operations where supported. |
| **Ownership tracking** | Every key has a documented owner, purpose, creation date, rotation schedule, and expiration date. |
| **Revocation on compromise** | Immediate revocation + rotation if any key is suspected compromised. Alert the team. |
| **Audit logging** | Log every access to every secret. Alert on unusual access patterns (new IP, new service, high frequency). |
| **No key sharing** | Separate keys per environment (dev/staging/prod). Never reuse keys across environments. |

### LLM Provider Security (Special Considerations)

The March 2026 LiteLLM supply chain attack demonstrated that a compromised LLM proxy can harvest every API key, cloud credential, and secret on every machine where it runs. Mitigations:

| Risk | Mitigation |
|---|---|
| **Proxy compromise** | Do not use third-party LLM proxy libraries in production. Call provider APIs directly or through a self-hosted gateway. |
| **Broad key permissions** | Use provider-specific key restrictions where available (e.g., OpenAI organization-scoped keys, Anthropic workspace keys). |
| **Data exposure to providers** | Execute Data Processing Agreements (DPAs) with all LLM providers. Verify zero-retention API policies (OpenAI API, Anthropic API both offer zero-retention by default for API usage as of 2026). |
| **Prompt injection** | Validate and sanitize all user-originated content before including in LLM prompts. |
| **Customer data in prompts** | Minimize PII in prompts. Use pseudonymization where possible. Never include OAuth tokens, API keys, or passwords in LLM context. |
| **Provider key rotation** | Rotate LLM API keys monthly. Most providers support multiple active keys for zero-downtime rotation. |

---

## 8. Authentication Security

### Authentication Architecture

#### Recommended Stack for 2026

| Component | Recommendation | Rationale |
|---|---|---|
| **Auth provider** | Clerk, Auth0, or WorkOS | Managed auth reduces implementation risk. WorkOS specifically targets B2B SaaS with SSO/SCIM. |
| **Primary auth method** | Email magic link + passkey enrollment | Passwordless eliminates credential stuffing. Passkeys (WebAuthn) are phishing-resistant. |
| **MFA** | TOTP (authenticator app) + WebAuthn hardware keys | Push notifications are vulnerable to MFA fatigue attacks. TOTP and hardware keys are more secure. |
| **SSO** | SAML 2.0 + OIDC support | Required for enterprise customers. WorkOS/Auth0 handle the complexity. |
| **Admin accounts** | MFA mandatory, no exceptions | Admin accounts are the highest-value targets. |

#### Passkey / WebAuthn Adoption

Passwordless authentication via passkeys is the industry direction for 2025-2026. Benefits:
- Phishing-resistant (bound to origin domain).
- No shared secrets to steal.
- Better UX than passwords + TOTP.
- Supported by all major browsers and platforms.

**Implementation**: Offer passkeys as the primary auth method. Support magic links as fallback. Keep email/password as a last resort with mandatory MFA.

### Session Management

| Parameter | Recommended Value | Rationale |
|---|---|---|
| **Access token lifetime** | 15 minutes | Short enough to limit damage from token theft. Long enough to avoid excessive refresh traffic. |
| **Refresh token lifetime** | 7 days (with rotation) | Balances security with UX. Each refresh returns a new token and invalidates the old one. |
| **Session idle timeout** | 30 minutes | Protects unattended sessions. Configurable per tenant for enterprise. |
| **Absolute session timeout** | 24 hours | Forces re-authentication daily regardless of activity. |
| **Concurrent session limit** | Configurable (default: 5) | Prevents unlimited session proliferation. Alert on unusual session count. |

#### Cookie Security

| Attribute | Value | Purpose |
|---|---|---|
| **HttpOnly** | `true` | Prevents JavaScript access (XSS mitigation) |
| **Secure** | `true` | Cookies only sent over HTTPS |
| **SameSite** | `Strict` (or `Lax` if cross-origin needed) | CSRF mitigation |
| **Path** | `/` (or scoped as needed) | Limits cookie scope |
| **Domain** | Explicit (no wildcard) | Prevents subdomain attacks |

#### CSRF Protection

- Set `SameSite=Strict` on all session cookies.
- Implement anti-CSRF tokens for all state-changing operations (POST, PUT, DELETE).
- Validate `Origin` and `Referer` headers on all mutating requests.

### Additional Security Measures

| Measure | Implementation |
|---|---|
| **Rate limiting on auth endpoints** | 5 attempts per minute per IP for login. 3 attempts per minute for MFA. Exponential backoff after failures. |
| **Account lockout** | Temporary lockout after 10 failed attempts (30 minutes). Notify user via email. |
| **Brute force detection** | Monitor for distributed attacks (many IPs, same account). Alert security team. |
| **Session invalidation** | Invalidate all sessions on: password change, MFA change, permission change, security event. |
| **Device fingerprinting** | Optional. Detect new device logins and require additional verification. |
| **Audit log** | Log every authentication event: login, logout, MFA success/failure, session creation/destruction, permission changes. |
| **Adaptive MFA** | Prompt for additional verification on: new device, new location, unusual time, sensitive operation. |

---

## 9. SOC 2 / Compliance Considerations for Early Stage

### Why SOC 2 Matters (Even at Early Stage)

| Statistic | Source |
|---|---|
| **83% of enterprise buyers** require SOC 2 certification from SaaS vendors | Industry surveys 2025 |
| **67% of startups** that achieved certification report it directly enabled deal closures | Startup compliance reports |
| **70% of VCs** prefer investing in SOC 2-compliant startups | Investor surveys |

### SOC 2 Trust Services Criteria

| Criteria | Required? | Relevance to Our Product |
|---|---|---|
| **Security** (Common Criteria) | **Yes -- mandatory for all SOC 2** | Core requirement. Covers access controls, encryption, monitoring, incident response. |
| **Availability** | Recommended | SaaS uptime commitments. Disaster recovery, backups, business continuity. |
| **Confidentiality** | **Highly recommended** | We store customer email, CRM data, recordings. Confidentiality controls are essential. |
| **Processing Integrity** | Optional | Relevant if we make claims about data accuracy (e.g., AI-generated summaries). |
| **Privacy** | **Highly recommended** | We process PII (contacts, emails, recordings). Privacy controls demonstrate GDPR alignment. |

**Recommendation**: Start with Security + Confidentiality + Privacy. Add Availability after establishing SLAs. Processing Integrity can wait.

### SOC 2 Type I vs Type II

| Type | What It Proves | Timeline | Cost | Enterprise Acceptance |
|---|---|---|---|---|
| **Type I** | Controls are properly designed at a point in time | 1-3 months prep + audit | $10,000-$25,000 | Stepping stone only. Most enterprises want Type II. |
| **Type II** | Controls are operating effectively over a period (3-12 months) | 3-6 months prep + 3-12 month observation + audit | $25,000-$50,000 | Required for most enterprise deals. |

**Strategy**: Start building SOC 2 controls from day one. Get Type I within 6 months of launch. Begin Type II observation period immediately after. Have Type II within 12-18 months.

### Early-Stage SOC 2 Roadmap

#### Phase 1: Foundation (Months 1-3)

| Action | Details |
|---|---|
| **Risk assessment** | Document all risks to customer data. Prioritize by likelihood and impact. |
| **Security policies** | Write: Information Security Policy, Access Control Policy, Encryption Policy, Incident Response Plan, Data Retention Policy, Acceptable Use Policy. Keep them concise and practical -- auditors want evidence of real policies, not 100-page documents nobody reads. |
| **Access controls** | Implement RBAC. Enforce MFA for all team members. Use SSO where possible. Principle of least privilege. |
| **Encryption** | TLS 1.2+ in transit, AES-256 at rest (database + object storage + backups). Document it. |
| **Logging and monitoring** | Centralized logging. Alert on security events. Retain logs for 12 months minimum. |
| **Vendor management** | Document all third-party vendors (LLM providers, cloud infrastructure, SaaS tools). Verify their SOC 2 status. Maintain a vendor risk register. |

#### Phase 2: Operational Controls (Months 3-6)

| Action | Details |
|---|---|
| **Change management** | Code reviews required for all changes. CI/CD pipeline with automated tests. No direct production access. |
| **Incident response** | Documented plan. Assign roles (incident commander, communications, engineering). Run a tabletop exercise. |
| **Business continuity** | Documented plan for infrastructure failure. Test backup restoration. Document RTO/RPO targets. |
| **Employee onboarding/offboarding** | Security training on hire. Access provisioning checklist. Immediate access revocation on departure. |
| **Vulnerability management** | Automated dependency scanning (Dependabot, Snyk). Regular penetration testing (annual minimum). |

#### Phase 3: Audit Preparation (Months 6-9)

| Action | Details |
|---|---|
| **Compliance automation tool** | Use Vanta, Drata, Secureframe, or Sprinto. These tools continuously monitor controls, collect evidence, and streamline audit prep. Cost: $10,000-$30,000/year. Worth it at this stage. |
| **Gap assessment** | Run internal assessment against SOC 2 criteria. Fix gaps before engaging auditor. |
| **Auditor selection** | Choose a CPA firm experienced with SaaS startups. Get quotes from 3+ firms. |
| **Type I audit** | Engage auditor. Provide evidence. Receive report. |

### Other Compliance Frameworks to Consider

| Framework | When to Pursue | Relevance |
|---|---|---|
| **GDPR compliance** | From day one (if serving EU customers) | Legal requirement. See Section 4. |
| **CCPA compliance** | From day one (if serving California customers) | Legal requirement. See Section 4. |
| **ISO 27001** | After SOC 2 Type II | International standard. Some EU enterprise customers prefer this. |
| **HIPAA** | Only if targeting healthcare | Significant additional requirements. Avoid unless necessary. |
| **SOC 2 + HITRUST** | Only if targeting healthcare + enterprise | Gold standard for health tech. |

---

## 10. Data Retention Policies

### Retention Schedule

| Data Category | Active Retention | Post-Cancellation | Legal Basis |
|---|---|---|---|
| **Account data** (name, email, company, billing) | Duration of subscription | 90 days post-cancellation, then delete (except billing records) | Contract performance |
| **CRM contacts/leads** | Duration of subscription | 90 days post-cancellation, then delete | Legitimate interest (customer's) |
| **Email content** (synced emails) | Duration of subscription | 30 days post-cancellation, then delete | Contract performance |
| **Meeting recordings** | Configurable (default: 12 months from recording date) | 30 days post-cancellation, then delete | Contract performance |
| **Meeting transcripts** | Same as recordings | Same as recordings | Contract performance |
| **AI-generated summaries/coaching** | Same as source data | Same as source data | Contract performance |
| **Pipeline/deal data** | Duration of subscription | 90 days post-cancellation, then delete | Legitimate interest (customer's) |
| **Audit logs** | 12 months minimum | 12 months from last event, even after cancellation | Legal obligation + legitimate interest (security) |
| **Billing records** | Duration of subscription | 7 years post-cancellation (tax/accounting obligation) | Legal obligation |
| **Suppression lists** (opt-out records) | Indefinite | Indefinite (must survive account deletion) | Legal obligation (CAN-SPAM, GDPR) |
| **Application logs** (containing PII) | 90 days | Deleted with account | Legitimate interest (debugging) |
| **Anonymous/aggregated analytics** | Indefinite | Indefinite (not personal data) | Legitimate interest (product improvement) |

### Implementation Requirements

| Requirement | Details |
|---|---|
| **Automated deletion** | Implement scheduled jobs that enforce retention limits. Do not rely on manual processes. |
| **Deletion verification** | After automated deletion runs, verify data is actually gone. Spot-check against the data map. |
| **Tenant data export** | Before cancellation deletion, offer data export (GDPR portability). Provide a 30-day window to download. |
| **Cascading deletion** | Deleting a tenant must cascade through all related data: contacts, emails, recordings, deals, activities, notes, tasks, attachments, search indexes, caches. Maintain a deletion manifest. |
| **Backup reconciliation** | Deletion manifests must be applied to any backup restoration. Document backup rotation schedule (e.g., daily backups retained 30 days, weekly retained 90 days). |
| **Contractual clarity** | State the retention schedule in the Terms of Service and Data Processing Agreement. Example: "Upon account cancellation, all customer data is permanently deleted within 90 days, including from backup systems within 120 days." |
| **Data classification tiers** | Tier 1 (customer-owned data: emails, contacts, recordings) -- strict deletion on cancellation. Tier 2 (usage telemetry, anonymized analytics) -- retain indefinitely for product improvement after stripping all PII. |
| **Regular review** | Review retention policies quarterly. Adapt to regulatory changes and new data categories. |

### GDPR-Specific Retention Rules

| Scenario | Retention Rule |
|---|---|
| **Active prospect (never became customer)** | Delete after 3 years of no contact (GDPR accepted maximum) |
| **Customer** | Duration of contract + applicable legal retention periods |
| **After erasure request** | Delete from active systems within 1 month. Suppression list entry retained indefinitely. Backup copies overwritten within backup rotation cycle (document timeline). |
| **Inactive user within active tenant** | Data retained as long as the tenant is active. The tenant (data controller) manages their own users. |

### Data Deletion Checklist (On Account Cancellation)

```
[ ] 1. Send data export notification (30-day window)
[ ] 2. Revoke all OAuth tokens (Google, Microsoft integrations)
[ ] 3. Delete all email content and metadata
[ ] 4. Delete all meeting recordings from object storage
[ ] 5. Delete all meeting transcripts and summaries
[ ] 6. Delete all CRM contacts, deals, activities, notes
[ ] 7. Delete all pipeline data
[ ] 8. Remove from search indexes
[ ] 9. Clear from application caches
[ ] 10. Delete user accounts and auth records
[ ] 11. Retain billing records (7-year legal hold)
[ ] 12. Retain suppression list entries (indefinite legal hold)
[ ] 13. Retain audit logs (12-month minimum)
[ ] 14. Add to backup deletion manifest
[ ] 15. Log deletion completion with timestamp
[ ] 16. Send deletion confirmation to former customer
```

---

## Architecture Summary: Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NETWORK LAYER                                │
│  TLS 1.3 everywhere ─ HSTS ─ mTLS between services ─ WAF          │
├─────────────────────────────────────────────────────────────────────┤
│                      APPLICATION LAYER                              │
│  Auth (Clerk/Auth0) ─ MFA ─ RBAC ─ Session mgmt ─ Rate limiting   │
├─────────────────────────────────────────────────────────────────────┤
│                        DATA LAYER                                   │
│  PostgreSQL RLS ─ App-level AES-256-GCM ─ Envelope encryption      │
│  Per-tenant keys ─ KMS-managed KEKs ─ Encrypted backups            │
├─────────────────────────────────────────────────────────────────────┤
│                      SECRETS LAYER                                  │
│  AWS Secrets Manager / Vault ─ Automatic rotation ─ Audit logging  │
├─────────────────────────────────────────────────────────────────────┤
│                      PRIVACY LAYER                                  │
│  GDPR/CCPA compliance ─ Data mapping ─ Automated erasure           │
│  Consent management ─ Retention automation ─ DPAs with vendors     │
├─────────────────────────────────────────────────────────────────────┤
│                      COMPLIANCE LAYER                               │
│  SOC 2 controls ─ Audit logging ─ Vendor management                │
│  Incident response ─ Vulnerability scanning ─ Pen testing          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Priority for Early Stage

### Phase 1: Ship Secure (Before Launch)

These are non-negotiable before any customer data touches the system:

1. PostgreSQL RLS on all tenant-scoped tables + integration tests
2. TLS 1.3 in transit, AES-256 at rest (database + object storage)
3. Envelope encryption for OAuth tokens and API keys
4. Managed auth provider with MFA support (Clerk or Auth0)
5. HttpOnly + Secure + SameSite cookies for sessions
6. Secrets manager for all API keys (no env vars in production)
7. GDPR erasure endpoint (functional, tested)
8. Global suppression list (survives all deletions)
9. Audit logging for all auth events and data access
10. DPAs signed with all third-party data processors

### Phase 2: Enterprise Ready (Months 3-6)

11. SOC 2 Type I preparation (policies, controls, compliance tool)
12. SSO support (SAML + OIDC)
13. Per-tenant encryption keys (upgrade from shared keys)
14. Data export API (GDPR portability)
15. Automated retention enforcement
16. Incident response plan (documented + tested)
17. Vulnerability scanning in CI/CD

### Phase 3: Scale Secure (Months 6-12)

18. SOC 2 Type II audit
19. Customer-managed encryption keys (BYOK) for enterprise
20. Advanced threat detection (anomalous access patterns)
21. Dedicated database option for enterprise tenants
22. Annual penetration testing
23. ISO 27001 preparation (if targeting EU enterprise)

---

## Sources

- [Data Isolation in Multi-Tenant SaaS (Redis)](https://redis.io/blog/data-isolation-multi-tenant-saas/)
- [SaaS Tenant Isolation Strategies (Medium)](https://kodekx-solutions.medium.com/saas-tenant-isolation-database-schema-and-row-level-security-strategies-7337d2159066)
- [Multi-Tenant Data Isolation with PostgreSQL RLS (AWS)](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Multi-Tenant SaaS Data Isolation Practical Guide (Sachith)](https://www.sachith.co.uk/multi%E2%80%91tenant-saas-data-isolation-scaling-strategies-practical-guide-mar-23-2026/)
- [Multitenant SaaS Patterns (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns?view=azuresql)
- [Row-Level Security for Multi-Tenant (Simplyblock)](https://www.simplyblock.io/blog/underated-postgres-multi-tenancy-with-row-level-security/)
- [RLS for Tenants in Postgres (Crunchy Data)](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres)
- [Postgres RLS Implementation Guide (Permit.io)](https://www.permit.io/blog/postgres-rls-implementation-guide)
- [PostgreSQL RLS Limitations and Alternatives (Bytebase)](https://www.bytebase.com/blog/postgres-row-level-security-limitations-and-alternatives/)
- [Refresh Token Security Best Practices (Obsidian Security)](https://www.obsidiansecurity.com/blog/refresh-token-security-best-practices)
- [OAuth Token Management for B2B SaaS (Truto)](https://truto.one/blog/how-to-architect-a-scalable-oauth-token-management-system-for-saas-integrations/)
- [RFC 9700 - OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/rfc9700/)
- [Google OAuth Best Practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Token Storage (Auth0)](https://auth0.com/docs/secure/security-guidance/data-security/token-storage)
- [Beyond AES-256 Encryption (Kiteworks)](https://www.kiteworks.com/secure-file-sharing/beyond-aes-256-encryption-multi-layer-protection/)
- [Enterprise Email Encryption Compliance Guide (Mailbird)](https://www.getmailbird.com/enterprise-email-encryption-compliance-guide/)
- [Email Privacy Laws & Regulations 2026 (Mailbird)](https://www.getmailbird.com/email-privacy-laws-regulations-compliance/)
- [PII Compliance Checklist 2026 (Improvado)](https://improvado.io/blog/what-is-personally-identifiable-information-pii)
- [GDPR Compliance for SaaS 2026 (Feroot)](https://www.feroot.com/blog/gdpr-saas-compliance-2025/)
- [SaaS DPA Guide (SecurePrivacy)](https://secureprivacy.ai/blog/data-processing-agreements-dpas-for-saas)
- [GDPR Right to Erasure and Backups (Hall Booth Smith)](https://hallboothsmith.com/we-all-know-about-gdprs-right-to-erasure-does-this-mean-you-have-to-delete-data-from-backups-as-well/)
- [GDPR Deletion Requests & Backups (ProBackup)](https://www.probackup.io/blog/gdpr-and-backups-how-to-handle-deletion-requests)
- [Deleting Personal Data (GDPR for SaaS)](https://gdpr4saas.eu/deleting-personal-data)
- [GDPR Secure Video Conferencing (Zeeg)](https://zeeg.me/en/blog/post/gdpr-secure-video-conferencing)
- [API Keys & Secrets Management Best Practices (AccessHub)](https://accesshub.ai/api-keys-secrets-management-best-practices-to-secure-your-enterprise-integrations/)
- [API Key Management Best Practices (OneUptime)](https://oneuptime.com/blog/post/2026-02-20-api-key-management-best-practices/view)
- [Top 5 Secrets Management Tools 2026 (Gupta)](https://guptadeepak.com/top-5-secrets-management-tools-hashicorp-vault-aws-doppler-infisical-and-azure-key-vault-compared/)
- [LLM Data Privacy (Lasso Security)](https://www.lasso.security/blog/llm-data-privacy)
- [LiteLLM Supply Chain Attack (DreamFactory)](https://blog.dreamfactory.com/why-the-litellm-supply-chain-attack-is-a-wake-up-call-for-ai-api-credential-management)
- [LLM API Security Tips (DataSunrise)](https://www.datasunrise.com/knowledge-center/ai-security/llm-api-security-tips/)
- [MFA for SaaS (LoginRadius)](https://www.loginradius.com/blog/identity/mfa-strategies-saas-platforms)
- [SaaS Authentication Best Practices 2026 (Supastarter)](https://supastarter.dev/blog/saas-authentication-best-practices)
- [SaaS Security Best Practices 2026 (Reco)](https://www.reco.ai/learn/saas-security-best-practices)
- [MFA Best Practices (CSA)](https://cloudsecurityalliance.org/blog/2025/07/02/mfa-made-easy-8-best-practices-for-seamless-authentication-journeys)
- [SOC 2 Checklist for SaaS Startups (Comp AI)](https://trycomp.ai/soc-2-checklist-for-saas-startups)
- [SOC 2 for Startups 2026 (CyberCrest)](https://www.cybercrestcompliance.com/blog/how-to-get-soc-2-for-startups)
- [SOC 2 for SaaS Companies (Sprinto)](https://sprinto.com/blog/why-soc-2-for-saas-companies/)
- [SOC 2 Trust Services Criteria (Secureframe)](https://secureframe.com/hub/soc-2/trust-services-criteria)
- [5 SOC 2 Trust Services Criteria (CSA)](https://cloudsecurityalliance.org/blog/2023/10/05/the-5-soc-2-trust-services-criteria-explained)
- [Data Retention Policy Best Practices (CloudAlly)](https://www.cloudally.com/blog/7-retention-policy-best-practices-for-saas-data/)
- [Data Retention Policy Examples 2026 (Trackingplan)](https://www.trackingplan.com/blog/data-retention-policy-examples)
- [Data Retention Policy (Drata)](https://drata.com/blog/data-retention-policy)
- [California Data Broker Registration (CPPA)](https://cppa.ca.gov/data_brokers/)
- [CCPA Overview (CA Attorney General)](https://oag.ca.gov/privacy/ccpa)
- [JWT Authentication with HttpOnly Cookies (Wisp)](https://www.wisp.blog/blog/ultimate-guide-to-securing-jwt-authentication-with-httponly-cookies)
- [Session Cookies vs JWT Tokens (MojoAuth)](https://mojoauth.com/ciam-qna/session-cookies-vs-jwt-tokens-security)
