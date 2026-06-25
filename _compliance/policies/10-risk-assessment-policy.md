# Risk Assessment Policy

| Field | Value |
| --- | --- |
| Version | v1.0 |
| Effective date | 2026-06-10 |
| Owner | Martin Paviot (Founder) |
| Review cycle | Annual (next review due 2027-06-10) |

## 1. Purpose

Establish a lightweight, repeatable method for identifying, scoring, treating, and tracking risks to Elevay's security, availability, and confidentiality commitments.

## 2. Methodology

- **Cadence:** a full risk assessment is performed at least annually, and incrementally whenever a major change occurs (new Tier 1/2 vendor, new data category, architecture change, security incident).
- **Scoring:** each risk is scored Likelihood (1-3) x Impact (1-3):
  - Likelihood: 1 = unlikely within a year, 2 = plausible within a year, 3 = expected or already observed.
  - Impact: 1 = minor (no customer data or availability impact), 2 = significant (degraded service or limited data exposure), 3 = severe (customer PII breach, extended outage, regulatory action).
- **Priority bands:** score 6-9 = High (treat within 30 days or formally accept), 3-4 = Medium (treat within the quarter), 1-2 = Low (monitor).
- **Treatments:** mitigate, transfer (insurance/vendor), avoid, or accept.

## 3. Risk Register

- Location: `_compliance/risk-register.md` (versioned in git; the appendix below seeds it).
- Each entry records: ID, description, likelihood, impact, score, treatment, owner, status, and review date.
- Risks discovered through incidents, evaluations, audits, or restore drills must be added within 5 business days of discovery.

## 4. Acceptance Authority

The Founder (Martin Paviot) is the sole acceptance authority. Accepted risks must state the rationale and a re-review date in the register; acceptance of any High risk is re-confirmed at every annual assessment.

## 5. Appendix: Starter Risk Register (v1.0, 2026-06-10)

| ID | Risk | L | I | Score | Treatment | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | Solo-founder bus factor: a single operator holds all credentials and operational knowledge; incapacity halts operations and customer support | 2 | 3 | 6 | Mitigate: credentials escrow in password manager with emergency access; this repo as executable runbook (Policy 08 section 6) | Open (mitigations in place, residual risk accepted) |
| R-02 | Push-to-main without branch protection on GitHub Free auto-deploys to production (Vercel productionBranch = main); a bad push ships straight to customers | 3 | 2 | 6 | Mitigate: preview deploys + tsc/test gate before merge as working practice; evaluate GitHub plan upgrade or rulesets for branch protection | Open |
| R-03 | Shared `ELEVAY_APP_SECRET` without rotation: a single long-lived application secret signs/encrypts across the app; compromise is broad and rotation is untested | 2 | 3 | 6 | Accept (founder-approved): rotation tooling deferred; re-review at next annual assessment; compromise response covered by incident response policy | Accepted |
| R-04 | LLM prompt injection from CRM data: prospect-controlled content (emails, transcripts, enrichment fields) flows into Anthropic/OpenAI prompts and could steer tool-calling agents | 2 | 2 | 4 | Mitigate: constrained tool schemas, citation-checked/fail-closed LLM steps, no destructive tools exposed to generation; periodic injection test cases in the eval harness | Open |
| R-05 | Mailbox/calendar OAuth token compromise: stored Google/Microsoft/Zoho tokens grant read access to customer mailboxes; leakage would be a severe PII breach | 1 | 3 | 3 | Mitigate: tokens encrypted at rest, per-user scoping (connected_mailboxes.user_id), minimal scopes, revocation on disconnect | Open |
| R-06 | Vercel or Supabase regional outage exceeds tolerance; daily-backup RPO means up to 24h data loss in worst case | 1 | 3 | 3 | Mitigate: RTO 4 business hours / RPO 24h adopted (Policy 08), PITR where enabled, annual restore drill with evidence | Open |
| R-07 | Enrichment vendor GDPR exposure: Tier 2 vendors (Apollo, Kaspr, Lusha, etc.) carry regulatory risk that can flow to Elevay as a customer; precedent: CNIL fined Kaspr EUR 240k | 2 | 2 | 4 | Mitigate: RGPD-clean cascade preference, annual vendor review (Policy 09), suppression lists honored (`email_optouts`, `do_not_call_list`), legitimate-interest basis documented (Policy 11) | Open |
| R-08 | Inngest background workers connect with service-role credentials and bypass RLS; a tenant-scoping bug in a job can read or write across tenants silently | 2 | 3 | 6 | Mitigate: explicit `tenant_id` predicates required in every job query, code review checklist item, cross-tenant regression tests | Open |
| R-08b | Postgres RLS is not active in production at all (verified 2026-06-10: zero rows in pg_policies, relrowsecurity=false on contacts/companies/deals/activities, application connects as `postgres` with rolbypassrls=true). Tenant isolation rests solely on application-level WHERE clauses | 2 | 3 | 6 | Mitigate: create a dedicated non-superuser application role without BYPASSRLS, apply the 0038 policy set for real, switch DATABASE_URL, verify with cross-tenant probes. Until then the R-08 mitigations are the only isolation layer | Open |
| R-09 | Call-recording retention gap: Twilio recordings could outlive the committed 90-day window | 2 | 2 | 4 | Mitigated: `recording-retention-purge` Inngest cron (daily 04:00 UTC) deletes recordings >90 days at Twilio and nulls the row pointer; recordings are double opt-in (`VOICE_RECORDING_ENABLED` deployment switch + `callRecordingEnabled` workspace toggle, both default off) with a mandatory disclosure in two-party-consent regions (Policy 07) | Mitigated |
| R-10 | Production secrets sprawl: many vendor API keys live in Vercel env and `.env.local`; accidental commit or laptop compromise exposes multiple Tier 2 vendors at once | 2 | 2 | 4 | Mitigate: `.gitignore` covers `.env*` and `_credentials/`, secrets only in password manager/Vercel, scoped keys where vendors support them (e.g., send-only Resend key), offboarding revocation (Policy 09) | Open |

## 6. Related Documents

- `08-business-continuity-dr-plan.md` (R-01, R-06)
- `09-vendor-management-policy.md` (R-07, R-10)
- `07-data-retention-classification-policy.md` (R-09)
