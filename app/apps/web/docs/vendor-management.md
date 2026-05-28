# Vendor (sub-processor) management procedure

**Last updated:** 2026-05-19
**Owner:** DPO + CTO
**Review cadence:** annually per vendor

ISO 27001 A.5.19 / A.5.20 / A.5.21 — supplier relationships, agreements,
ICT supply chain.

---

## 1. Onboarding a new vendor

Before integrating any third party that may process personal data:

1. **Necessity check.** Is this vendor required? Could existing tooling do
   the job? Default to "no new vendor".
2. **Sovereignty triage.** Prefer EU/CH-sovereign vendors. Document the
   sovereignty tier:
   - Tier A: EU/CH operator, EU/CH hosting (true sovereign)
   - Tier B: EU/CH hosting, non-EU operator (residency only)
   - Tier C: non-EU operator and hosting (last resort)
3. **Security review.** Request:
   - SOC 2 type II / ISO 27001 / SecNumCloud certifications
   - Latest pentest report
   - Vulnerability disclosure policy
   - Security questionnaire (use SIG-Lite or CAIQ)
4. **DPA review.** Verify the vendor offers a GDPR-aligned DPA:
   - SCCs as transfer mechanism (not DPF as sole basis)
   - Sub-processor notification commitments
   - Audit rights
   - Data return / deletion at end of contract
5. **DPIA delta.** If the new vendor changes the risk profile of an
   existing activity (e.g. new LLM provider), update the DPIA.
6. **DPA registry update.** Add the vendor to `src/data/dpas.json` with
   accurate region, operator jurisdiction, CLOUD Act exposure.
7. **Customer notification.** If the vendor adds personal data processing,
   trigger the 30-day notification flow.
8. **Approval.** DPO + CTO sign-off recorded in this file.

---

## 2. Tiered review cadence

| Tier | Annual review depth |
|---|---|
| Critical (DB, hosting, LLM, payment) | Full re-assessment: certs valid, no material DPA change, no incident, alternatives still ranked |
| High (transactional email, observability, queue) | Certs + DPA refresh |
| Medium (enrichment, ancillary) | DPA refresh only |

---

## 3. Vendor risk register

| Vendor | Tier | Last review | Next review | Status |
|---|---|---|---|---|
| Supabase | Critical | 2026-05-19 | 2027-05-19 | acceptable; sovereign migration in progress |
| Vercel | Critical | 2026-05-19 | 2027-05-19 | acceptable; sovereign migration in progress |
| Anthropic | Critical | 2026-05-19 | 2027-05-19 | acceptable on EU endpoint |
| Mistral AI | Critical (opt-in sovereign) | 2026-05-19 | 2027-05-19 | preferred for sovereign profile |
| OpenAI | High | 2026-05-19 | 2027-05-19 | embeddings only; migration target Mistral Embed |
| Stripe | Critical | 2026-05-19 | 2027-05-19 | required for payments; EU subsidiary contract |
| Resend | High | 2026-05-19 | 2027-05-19 | migrating to Brevo |
| Sentry | High | 2026-05-19 | 2027-05-19 | EU DSN; self-host roadmap |
| PostHog | High | 2026-05-19 | 2027-05-19 | EU Cloud OK |
| Inngest | High | 2026-05-19 | 2027-05-19 | sovereign migration target BullMQ |
| Recall.ai | Medium | 2026-05-19 | 2027-05-19 | optional feature; no EU alternative |
| Apollo | Medium | 2026-05-19 | 2027-05-19 | sovereign migration target Datagma+Pappers |
| Google (OAuth/Gmail) | Critical (non-substitutable) | 2026-05-19 | 2027-05-19 | structural |
| Microsoft (Entra/Graph) | Critical (non-substitutable) | 2026-05-19 | 2027-05-19 | structural |

---

## 4. Offboarding

When discontinuing a vendor:

1. Stop sending new data
2. Trigger data return (where supported) and deletion (always)
3. Obtain deletion attestation from the vendor where contractually due
4. Revoke API keys and OAuth grants
5. Remove from `src/data/dpas.json`
6. Notify customers of the change
7. Archive the contract + DPA + correspondence for 5 years

---

## 5. Concentration risk

Two concentration risks to monitor:

- **AWS exposure**: Supabase, Anthropic (Bedrock), and many third parties
  ride on AWS. A regional AWS outage cascades. Mitigation: prefer
  managed-DB providers (Scaleway, Infomaniak) that don't run on AWS for
  the sovereign profile.
- **US operator exposure**: today 14 of 16 sub-processors are US-operated
  (CLOUD Act). The sovereign profile removes this by design.
