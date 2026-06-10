# Vendor Management Policy

| Field | Value |
| --- | --- |
| Version | v1.0 |
| Effective date | 2026-06-10 |
| Owner | Martin Paviot (Founder) |
| Review cycle | Annual (next review due 2027-06-10) |

## 1. Purpose

Ensure that every third party with access to Elevay systems or customer data is identified, risk-rated, contractually bound, and periodically reviewed, and that access is fully revoked when a vendor is offboarded.

## 2. Scope

All production vendors and subprocessors. Development-only tooling (Capsolver, TextVerified, FuseAI, Rippletide) is explicitly out of production scope: it must never receive customer data and is excluded from the customer-facing subprocessor list, but its credentials are still subject to the offboarding rules in section 6.

## 3. Vendor Inventory

- The authoritative, customer-facing inventory is maintained at `_compliance/subprocessors.md` (vendor, purpose, data categories, region/EU posture, DPA status).
- The inventory is updated **before** any new vendor receives production data, and re-published whenever a vendor is added or removed (this also drives the customer notification obligation in Elevay's DPA, where applicable).
- The in-product subprocessor page (`/sub-processors`) must stay consistent with this file.

## 4. Risk Tiers by Data Access

| Tier | Definition | Vendors (current) | Diligence required |
| --- | --- | --- | --- |
| Tier 1 - Critical / bulk customer PII | Hosts or processes the customer database, mailbox/calendar content, or recordings at scale | Supabase, Vercel, Google (OAuth mailbox/calendar), Microsoft (OAuth mailbox/calendar), Zoho (company mailbox), Twilio, Deepgram, Recall.ai, Anthropic, OpenAI | DPA signed; SOC 2 Type II or ISO 27001 report reviewed; EU residency or EU processing option confirmed; annual review mandatory |
| Tier 2 - Scoped customer/prospect PII | Receives specific PII fields per request (enrichment, email delivery, jobs, analytics, errors) | Apollo, Kaspr, Lusha, Hunter, Datagma, Firmable, FullEnrich, Zeliq, Crunchbase, Resend, Inngest, Upstash, Stripe, Sentry, PostHog, Mistral (optional) | DPA signed; security posture reviewed (report or trust page); GDPR exposure assessed (see Kaspr precedent below); annual review |
| Tier 3 - No customer data | Public-data sources and infrastructure with no PII flow | Pappers, Zefix (public registries) | Light review: terms of use and availability only |

GDPR note: enrichment vendors are the highest regulatory-exposure tier in practice. The CNIL fined Kaspr EUR 240k over its data collection practices; this precedent is tracked as risk R-07 in the risk register and is a standing agenda item in the annual review of all Tier 2 enrichment vendors.

## 5. Onboarding Checklist

Before a vendor is wired into production:

1. DPA signed (or vendor's standard DPA with SCCs accepted) and filed.
2. SOC 2 / ISO 27001 report (or equivalent trust documentation) reviewed; material findings noted.
3. EU residency preferred and selected wherever the vendor offers it (e.g., Twilio EU region ie1, Anthropic EU endpoint, Sentry EU, PostHog EU, Supabase EU). Non-EU processing requires SCCs and a note in `_compliance/subprocessors.md`.
4. Data minimization check: send only the fields the integration needs.
5. Risk tier assigned (section 4) and the vendor added to `_compliance/subprocessors.md`.
6. Credentials stored in the password manager / Vercel env only (never in git), per the access control and encryption policies (02, 03).
7. Spend approved against the budget cap and logged.

## 6. Annual Review

Once per year (aligned with the annual risk assessment, Policy 10), for every vendor: confirm it is still needed, re-check the DPA and compliance report status, re-verify region/residency settings, review any security incidents or regulatory actions involving the vendor, and update the "DPA status" column in `_compliance/subprocessors.md`. Unused vendors are offboarded.

## 7. Offboarding

When a vendor relationship ends:

1. Revoke and delete all API keys, OAuth grants, and webhooks for the vendor (production and development).
2. Remove the vendor's environment variables from Vercel and `.env.local`.
3. Send a written data deletion request to the vendor and retain the confirmation as evidence.
4. Remove the vendor from `_compliance/subprocessors.md` and the `/sub-processors` page.
5. Record the offboarding date and evidence location in the vendor inventory history.

## 8. Related Documents

- `_compliance/subprocessors.md` (authoritative inventory)
- `07-data-retention-classification-policy.md` (data categories shared with vendors)
- `10-risk-assessment-policy.md` (vendor risks R-06, R-07)
