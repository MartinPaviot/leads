# Elevay Subprocessors

| Field | Value |
| --- | --- |
| Version | v1.0 |
| Last updated | 2026-06-10 |
| Owner | Martin Paviot (Founder) |

Elevay (www.elevay.dev) uses the following subprocessors to provide the service. This list covers **production** vendors only; development tooling that never touches customer data is excluded. Governance: see `policies/09-vendor-management-policy.md`. Customers are notified of changes per the Elevay DPA.

## Infrastructure and Platform

| Vendor | Purpose | Data categories | Region / EU posture | DPA status |
| --- | --- | --- | --- | --- |
| Vercel | Application hosting, edge network, logs | All application traffic incl. customer PII in transit; request logs | Global edge; EU function regions used; SCCs | To confirm |
| Supabase | Postgres database (system of record), backups | All customer data incl. CRM PII, transcripts, audit log | EU region (residency asserted at boot) | To confirm |
| Upstash | Redis cache and queues | Transient operational data; limited PII in cache | EU region (residency asserted at boot) | To confirm |
| Inngest | Background jobs and crons (sync, enrichment, retention purge) | Job payloads may include customer PII references | US-based control plane; SCCs | To confirm |
| Stripe | Billing and payments | Customer billing contact and payment data | Global; SCCs; EU entity available | To confirm |

## Communications and Voice

| Vendor | Purpose | Data categories | Region / EU posture | DPA status |
| --- | --- | --- | --- | --- |
| Resend | Transactional and outbound email delivery (send.elevay.dev) | Recipient email addresses, message content | US-based; SCCs | To confirm |
| Twilio | Voice calling; opt-in call recording | Phone numbers, call metadata, recordings (90-day retention) | EU region ie1 selected | To confirm |
| Deepgram | Call transcription | Call audio streams, transcripts | US-based; SCCs | To confirm |
| Recall.ai | Meeting recording bot (notetaker) | Meeting audio/video, participant names, transcripts | US-based; SCCs | To confirm |

## Mailbox and Calendar Connectivity

| Vendor | Purpose | Data categories | Region / EU posture | DPA status |
| --- | --- | --- | --- | --- |
| Google | Customer mailbox and calendar sync (OAuth, customer-granted) | Email and calendar content of connected accounts | Global; EU terms available | To confirm |
| Microsoft | Customer mailbox and calendar sync (OAuth, customer-granted) | Email and calendar content of connected accounts | Global; EU Data Boundary | To confirm |
| Zoho | Company mailbox provider | Company email content | EU datacenters available | To confirm |

## AI / LLM Processing

| Vendor | Purpose | Data categories | Region / EU posture | DPA status |
| --- | --- | --- | --- | --- |
| Anthropic | LLM inference (drafting, analysis, agents) | Prompt context may include CRM PII, email/transcript excerpts | EU endpoint used | To confirm |
| OpenAI | LLM inference (secondary provider) | Prompt context may include CRM PII, email/transcript excerpts | US-based; EU residency options emerging; SCCs | To confirm |
| Mistral | LLM inference (optional, where enabled) | Prompt context may include CRM PII | EU (France) | To confirm |

## Data Enrichment

| Vendor | Purpose | Data categories | Region / EU posture | DPA status |
| --- | --- | --- | --- | --- |
| Apollo | B2B contact/company sourcing and enrichment | Prospect business contact data (name, role, email, phone, company) | US-based; SCCs | To confirm |
| Kaspr | Contact enrichment (FR focus) | Prospect business contact data incl. phone numbers | EU (France); subject to CNIL oversight | To confirm |
| Lusha | Contact enrichment (phone/email) | Prospect business contact data | US/IL; SCCs | To confirm |
| Hunter | Email finding and verification | Prospect business email addresses | EU (France) | To confirm |
| Datagma | Contact enrichment | Prospect business contact data | EU (France) | To confirm |
| Firmable | Company/contact data | Prospect business contact data | AU-based; SCCs | To confirm |
| FullEnrich | Bulk contact enrichment (EU mobile/email waterfall) | Prospect business contact data | EU (France) | To confirm |
| Zeliq | Contact enrichment | Prospect business contact data | EU (France) | To confirm |
| Crunchbase | Company firmographics and funding data | Company-level data; limited personal data (executives) | US-based; SCCs | To confirm |
| Pappers | French company registry data | Public company registry data; officers' names (public record) | EU (France) | To confirm |
| Zefix | Swiss company registry data | Public company registry data | Switzerland (adequacy decision) | To confirm |

## Monitoring and Analytics

| Vendor | Purpose | Data categories | Region / EU posture | DPA status |
| --- | --- | --- | --- | --- |
| Sentry | Error monitoring | Error payloads, request metadata (PII scrubbing applied) | EU region selected | To confirm |
| PostHog | Product analytics | Usage events, user identifiers | EU region selected | To confirm |
