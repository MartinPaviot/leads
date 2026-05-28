# Data classification policy

**Last updated:** 2026-05-19
**Owner:** DPO
**Review cadence:** annually + on each new field added to the data model

This document maps every category of data Elevay processes to a
classification level, which determines the controls applied to it.

---

## Classification levels

| Level | Definition | Examples |
|---|---|---|
| **L4 — Restricted** | Data whose unauthorised disclosure would cause significant harm to the data subject, the customer, or Elevay. | OAuth refresh tokens, API keys, password hashes, full mailbox content of users, financial billing data, audit log of privileged actions |
| **L3 — Confidential** | Personal data and commercial data not for public disclosure. | CRM contact data (names, emails, jobs), deal information, meeting transcripts, prospect lists |
| **L2 — Internal** | Data used internally that is not personal but is not for public release. | Aggregated usage metrics, internal cost data, anonymised analytics |
| **L1 — Public** | Data intended for or already in the public domain. | Marketing copy, public privacy policy, sub-processors list, security page |

---

## Controls per level

| Control | L1 | L2 | L3 | L4 |
|---|---|---|---|---|
| Encryption in transit | required | required | required | required |
| Encryption at rest | not required | recommended | required | required |
| Field-level encryption | n/a | n/a | recommended for selected fields | required |
| Access requires authentication | no | yes | yes | yes |
| Access logging | no | optional | yes | yes (every read) |
| Tenant scoping | n/a | n/a | required | required |
| RBAC | n/a | optional | required | required + need-to-know |
| Backup | optional | required | required | required + encryption |
| Retention policy | indefinite | 24 months | per RoPA | per RoPA + DSR |
| Right to erasure applies | no | partially (anonymised) | yes | yes |

---

## Field-level classification map

### User and account

| Field | Level | Notes |
|---|---|---|
| `users.email` | L3 | Personal data |
| `users.passwordHash` | L4 | Never logged, never returned by API |
| `authAccounts.access_token` | L4 | OAuth — encrypt at rest (roadmap H2) |
| `authAccounts.refresh_token` | L4 | OAuth — encrypt at rest (roadmap) |
| `users.role` | L3 | RBAC scope |
| `tenants.name` | L3 | |
| `auditLog.*` | L4 | Tamper-evident, append-only |

### CRM

| Field | Level | Notes |
|---|---|---|
| `contacts.email` | L3 | Personal data of third parties |
| `contacts.phone` | L3 | |
| `contacts.linkedinUrl` | L3 | Public profile but PII |
| `accounts.domain` | L2 | Public |
| `accounts.name` | L2 | Public |
| `deals.*` | L3 | Commercial confidentiality |
| `activities.body` | L3 | Email/meeting content — may contain special categories |
| `meetingTranscripts.*` | L3 | High sensitivity |
| `notes.*` | L3 | |

### Sending

| Field | Level | Notes |
|---|---|---|
| `sequenceEnrollments.*` | L3 | Prospect-level |
| `emails.body` | L3 | |
| `suppressionList.email` | L3 | Indefinite retention by design (opt-out) |

### Settings / integrations

| Field | Level | Notes |
|---|---|---|
| `integrations.apiKey` (encrypted) | L4 | `ELEVAY_APP_SECRET` AES-256-GCM |
| `recallBotId` | L3 | |

### Analytics and observability

| Field | Level | Notes |
|---|---|---|
| PostHog events | L2 | Anonymised by default |
| Sentry error events | L2 after scrubbing | PII redacted by `sentry-scrub.ts` |

---

## Special categories (GDPR Art. 9)

Elevay does not intentionally collect special categories of data (health,
religion, ethnicity, political opinions, biometrics, sexual orientation).
However, free-form fields (email bodies, meeting transcripts, notes) may
incidentally contain such data when users include it.

**Mitigations:**
- User education in onboarding
- No keyword-based extraction of these categories
- LLM prompts do not classify users on special-category attributes
- Right to erasure available

---

## Geographic classification

| Tag | Meaning |
|---|---|
| `eu-resident` | Data subject is in the EEA/CH/UK — full GDPR/nFADP rights apply |
| `non-eu-resident` | Data subject outside EEA/CH/UK |
| `eu-stored` | Data physically stored in EU/CH host (data residency true) |
| `eu-sovereign` | Data stored AND operator is EU/CH (no CLOUD Act exposure) |

Today: most data is `eu-stored` (Supabase Frankfurt) but not yet
`eu-sovereign` (Supabase operator is US). The EU-sovereign profile flips
both flags by migrating to Scaleway/Infomaniak.
