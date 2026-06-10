# Acceptable Use Policy

| Field | Value |
| --- | --- |
| Version | v1.0 |
| Effective date | 2026-06-10 |
| Owner | Martin Paviot (Founder) |
| Review cycle | Annual (next review due 2027-06-10) |

## 1. Purpose and Scope

This policy governs how workforce members (currently the Founder; any future employees or contractors) use Elevay company systems: production infrastructure (Vercel, Supabase, Upstash, Inngest, Twilio, Stripe, etc.), the GitHub repository, company email and mailboxes, vendor dashboards, and any device used to access them. Acknowledgement of this policy is required at onboarding and annually (see Policy 12).

## 2. General Rules

- Company systems are used for Elevay business. Incidental personal use is tolerated only where it creates no security or legal exposure.
- Credentials are personal, stored only in the approved password manager, and never shared, reused across services, or committed to git (`.env*` and `_credentials/` are gitignored by design).
- MFA must be enabled on every account that supports it, per the Access Control Policy (02).
- Customer data is accessed only for support, operations, or debugging with a concrete need; access is via tenant-scoped application paths or audited database access, never bulk-exported to personal devices.
- Production data must never be copied into development tooling or test environments. Dev-only services (Capsolver, TextVerified, FuseAI, Rippletide) must never receive customer data.
- Workforce members must not attempt to bypass security controls (RLS/tenant scoping, EU residency assertions, outbound test-mode guardrails) outside of documented, approved change processes.
- Suspected compromise of any account or device must be reported immediately under the Incident Response Policy.

## 3. AI Tool Usage Rules

Elevay is an AI product and the workforce uses AI tools daily; the rules are about where customer data may flow:

- **Approved for customer data:** Anthropic (EU endpoint) and OpenAI, both under signed DPAs, as integrated in the product's server-side LLM pipeline. Mistral is approved on the same basis where its optional integration is enabled.
- **Not approved for customer data:** any other LLM tool, including personal chatbot accounts, browser AI assistants, and free-tier tools without a DPA. Customer PII, mailbox content, transcripts, and production secrets must never be pasted into non-approved AI tools.
- Coding assistants may be used on the codebase (the code itself is Confidential, not customer PII), but prompts must not include production secrets or real customer records; use fixtures or redacted samples.
- AI-generated code and content is reviewed by a human before reaching production; the LLM is a constrained step, not an unreviewed author.

## 4. Prospect Outreach Compliance

Elevay both performs and powers B2B outreach; workforce use of these capabilities must comply with GDPR:

- Outreach to prospects relies on **legitimate interest** for B2B contact data (Article 6(1)(f)): business-role contact details, professional context, and a clear opt-out path in every message.
- **Suppression lists are always honored:** the `email_optouts` table blocks email sends and the `do_not_call_list` blocks voice calls. Workforce members must never work around a suppression entry, and opt-out requests are recorded promptly.
- Enrichment data is sourced only through the approved vendors in `_compliance/subprocessors.md` (see Policy 09 for the GDPR exposure review of enrichment vendors).
- Call recording is opt-in (`VOICE_RECORDING_ENABLED`) and subject to the 90-day retention rule (Policy 07); recordings are never made where local law requires consent that has not been obtained.

## 5. Enforcement

Violations are handled by the Founder; for future hires, violations may lead to access revocation, disciplinary action, or termination. Material violations involving customer data trigger the Incident Response Policy.

## 6. Related Documents

- `02-access-control-policy.md`, `03-encryption-policy.md` (credential and secret handling)
- `07-data-retention-classification-policy.md` (data classification referenced throughout)
- `12-security-awareness-training-policy.md` (acknowledgement cadence)
