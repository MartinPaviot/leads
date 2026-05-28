# Registre des activités de traitement (Record of Processing Activities)

**Last updated:** 2026-05-19
**Owner:** Data Protection Officer (privacy@elevay.dev)
**Legal basis:** GDPR Art. 30, nFADP Art. 12, French Loi Informatique et Libertés Art. 31
**Review cadence:** at each new sub-processor + annually

This document is the canonical record of every personal-data processing
activity Elevay performs as a data controller. For activities where Elevay
acts as a processor on behalf of a customer, see the per-customer DPA.

Each activity is described with its purpose, legal basis, data categories,
recipients, retention, transfer mechanism, and security measures.

---

## RA-1 — User account and authentication

| Field | Value |
|---|---|
| **Activity** | Provision and operate a user account |
| **Controller** | Elevay (France) |
| **Purpose** | Authenticate users, scope access, deliver the Service |
| **Legal basis** | Performance of contract (Art. 6(1)(b)) |
| **Data subjects** | Users (founders, sales staff using Elevay) |
| **Data categories** | Name, email, password hash, OAuth tokens, IP, user-agent, login timestamps |
| **Special categories** | None |
| **Recipients (internal)** | Engineering team (production access only, audit-logged) |
| **Sub-processors** | Supabase (DB), Vercel (hosting), Resend (transactional), Google / Microsoft (OAuth) |
| **International transfer** | Yes (US sub-processors) — SCCs + supplementary measures |
| **Retention** | Active account + 30 days post-deletion |
| **Security measures** | bcrypt hashes (cost 12), TLS 1.2+, RBAC, audit log on sensitive actions |

---

## RA-2 — Mailbox synchronisation (Gmail / Outlook)

| Field | Value |
|---|---|
| **Activity** | Read user mailbox to reconcile emails with CRM contacts and deals |
| **Controller** | Elevay (France) — processor for emails on behalf of the user |
| **Purpose** | Auto-capture every customer interaction, deal coaching, summarisation |
| **Legal basis** | Performance of contract (Art. 6(1)(b)) for the user; legitimate interest (Art. 6(1)(f)) for third-party correspondents — documented LIA |
| **Data subjects** | User + every person who corresponds with them by email |
| **Data categories** | Email subject, body, headers, attachments metadata, send/receive timestamps |
| **Special categories** | Potentially — if user voluntarily writes about health, religion etc. in business correspondence. Mitigated by user education and ability to mark threads as private. |
| **Recipients (internal)** | None beyond automated processing |
| **Sub-processors** | EmailEngine (self-host on EU/CH infra), Supabase, LLM (Anthropic EU / Mistral) |
| **International transfer** | LLM endpoint EU; Supabase operator US (Cloud Act flag) |
| **Retention** | Duration of account; deleted within 30 days of disconnect/closure |
| **Security measures** | OAuth tokens encrypted at rest, scope minimisation (read-only mail), per-tenant DB isolation, no training data flag with LLM provider |

---

## RA-3 — Meeting recording and transcription

| Field | Value |
|---|---|
| **Activity** | Auto-join scheduled meetings (Zoom/Meet/Teams), record audio, transcribe, summarise |
| **Controller** | Elevay (France) — processor on behalf of the user; user is co-controller for participant data |
| **Purpose** | Capture meeting context, populate CRM, coach the user |
| **Legal basis** | Explicit consent of all participants (Art. 6(1)(a)) — collected via in-meeting consent banner + email to participants |
| **Data subjects** | User + every meeting participant |
| **Data categories** | Audio recording, transcript, speaker diarisation, calendar metadata |
| **Special categories** | Possible (depends on meeting content); mitigated by per-meeting consent |
| **Sub-processors** | Recall.ai (US — Cloud Act flag, documented gap), LLM for summarisation |
| **International transfer** | Yes — SCCs + supplementary measures |
| **Retention** | Recording: 90 days then auto-purged. Transcript + summary: duration of account. |
| **Security measures** | Encryption at rest, opt-out per participant, ability to delete on demand |

---

## RA-4 — Contact and company enrichment

| Field | Value |
|---|---|
| **Activity** | Query third-party data providers to enrich contacts/companies with public business information |
| **Controller** | Elevay (France) |
| **Purpose** | Provide enrichment feature requested by the user |
| **Legal basis** | Legitimate interest (Art. 6(1)(f)) for B2B prospecting; documented LIA |
| **Data subjects** | Business contacts (professional capacity) |
| **Data categories** | Name, professional email, job title, company, public web profile data |
| **Sub-processors** | Apollo (US), Datagma (FR), Pappers (FR), Hunter (FR), Firmable (AU) |
| **International transfer** | Yes (Apollo, Firmable) — SCCs |
| **Retention** | 3 years from last contact for inactive prospects |
| **Security measures** | Minimisation (only domain + email sent to enrichers), per-tenant isolation |

---

## RA-5 — LLM inference

| Field | Value |
|---|---|
| **Activity** | Send prompts containing CRM context to an LLM provider, receive completions |
| **Controller** | Elevay (France) |
| **Purpose** | Email generation, scoring, chat assistant, summarisation |
| **Legal basis** | Performance of contract (Art. 6(1)(b)) |
| **Data subjects** | Users + their contacts (whose data appears in CRM context) |
| **Data categories** | Whatever the user has stored in the CRM and selects for the task |
| **Sub-processors** | Anthropic EU (eu.anthropic.com) by default; Mistral AI (FR) on opt-in; OpenAI for embeddings only |
| **International transfer** | Operator US (Cloud Act flag for Anthropic, OpenAI). Mistral = EU-sovereign |
| **Retention** | Provider zero-data-retention agreement requested; max 30 days at provider per contract |
| **Security measures** | Data minimisation, no training on customer data (contractual), prompt injection guards |

See `dpia-llm.md` for the detailed risk assessment of this activity.

---

## RA-6 — Outbound email sequences

| Field | Value |
|---|---|
| **Activity** | Send cold/warm outbound email sequences from connected mailboxes |
| **Controller** | User (joint controller) — Elevay processor |
| **Purpose** | B2B sales outreach |
| **Legal basis** | Legitimate interest (Art. 6(1)(f)) with country-specific overrides (Germany requires opt-in, see `_research/compliance.md`) |
| **Data subjects** | Prospects |
| **Data categories** | Email + professional context |
| **Sub-processors** | EmailEngine (self-host), recipient mailbox provider |
| **Retention** | Suppression list indefinite; campaign data 3 years |
| **Security measures** | RFC 8058 one-click unsubscribe, global suppression list, geo-jurisdiction gate, audit log of every send |

---

## RA-7 — Billing and payment

| Field | Value |
|---|---|
| **Activity** | Process subscription payments |
| **Controller** | Elevay (France) — Stripe is independent controller for fraud prevention |
| **Purpose** | Charge subscription, manage invoicing |
| **Legal basis** | Performance of contract (Art. 6(1)(b)); legal obligation (Art. 6(1)(c)) for accounting |
| **Data categories** | Name, billing address, last 4 of card, transaction history |
| **Sub-processors** | Stripe (US/IE) |
| **International transfer** | Yes — SCCs + Stripe Payments Europe Ltd (Dublin) |
| **Retention** | 10 years (Code de commerce Art. L123-22) |
| **Security measures** | PCI-DSS via Stripe, no full PAN stored locally |

---

## RA-8 — Product analytics and error reporting

| Field | Value |
|---|---|
| **Activity** | Collect anonymised usage events and error stack traces |
| **Controller** | Elevay (France) |
| **Purpose** | Service improvement, debugging |
| **Legal basis** | Consent (Art. 6(1)(a)) for analytics; legitimate interest for error logs (Art. 6(1)(f)) |
| **Data categories** | Page views, feature usage, error stack traces (PII scrubbed) |
| **Sub-processors** | PostHog EU Cloud, Sentry EU (de.sentry.io) |
| **International transfer** | Operator US for both (Cloud Act flag) — data residency Frankfurt |
| **Retention** | Analytics: 24 months anonymised. Errors: 90 days. |
| **Security measures** | `sendDefaultPii: false` + `beforeSend` redaction (`sentry-scrub.ts`) |

---

## RA-9 — Data subject requests (DSR)

| Field | Value |
|---|---|
| **Activity** | Process access, rectification, erasure, portability, restriction, objection requests |
| **Legal basis** | Legal obligation (Art. 6(1)(c)) |
| **Process** | Email to privacy@elevay.dev → DPO logs request → identity verification → fulfil within 30 days |
| **Tooling** | `/api/gdpr/export` (data export JSON), `/api/gdpr/delete` (account deletion) |
| **Retention of request records** | 3 years (proof of compliance) |
| **Security measures** | Identity verification before any export/delete; audit log of every DSR |

---

## Change log

| Date | Change | Author |
|---|---|---|
| 2026-05-19 | Initial version covering 9 activities | DPO |
