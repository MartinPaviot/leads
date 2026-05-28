# Risk register

**Last updated:** 2026-05-19
**Owner:** CTO
**Review cadence:** quarterly

Risks identified, scored, and tracked. Score = Likelihood (1-5) × Impact (1-5).
Treatment: mitigate / accept / transfer / avoid.

---

## R-001 — CLOUD Act exposure on US-operated sub-processors

| Field | Value |
|---|---|
| Description | 14 of 16 sub-processors are US-headquartered; data residency in EU does not eliminate extraterritorial US data requests. |
| Likelihood | 3 (US legal access requests rare but real) |
| Impact | 4 (loss of sovereignty-sensitive customers, regulatory pressure) |
| Inherent score | 12 |
| Treatment | Mitigate — build EU-sovereign profile (Mistral, Scaleway, Clever Cloud, Brevo, GlitchTip, PostHog self-host) |
| Residual score (sovereign profile) | 4 |
| Owner | CTO |

---

## R-002 — Sole-founder concentration

| Field | Value |
|---|---|
| Description | One person holds all production credentials. Bus factor = 1. |
| Likelihood | 3 |
| Impact | 5 (full service inaccessibility) |
| Inherent score | 15 |
| Treatment | Mitigate — escrow recovery codes with notary, document recovery procedure, plan first hire |
| Residual score | 8 |
| Owner | Founder |

---

## R-003 — LLM provider outage / change in terms

| Field | Value |
|---|---|
| Description | Anthropic/OpenAI service degradation or unilateral DPA change |
| Likelihood | 3 |
| Impact | 3 (chat assistant degraded; not catastrophic) |
| Inherent score | 9 |
| Treatment | Mitigate — circuit breaker + multi-provider router (Anthropic, Mistral, OpenAI) |
| Residual score | 4 |
| Owner | CTO |

---

## R-004 — Data Privacy Framework legal collapse

| Field | Value |
|---|---|
| Description | DPF challenged at CJEU; potential invalidation removes one transfer basis |
| Likelihood | 2 (timeline uncertain) |
| Impact | 3 (transfer compliance scramble) |
| Inherent score | 6 |
| Treatment | Mitigate — never rely on DPF alone; SCCs + supplementary measures everywhere |
| Residual score | 2 |
| Owner | DPO |

---

## R-005 — Prompt injection via untrusted email content

| Field | Value |
|---|---|
| Description | Attacker emails the user; the email body is processed by LLM with tool-use enabled; LLM executes attacker-controlled actions |
| Likelihood | 4 (low cost to attempt) |
| Impact | 4 (cross-tenant data exfiltration possible) |
| Inherent score | 16 |
| Treatment | Mitigate — tag-wrapped untrusted content in prompts; human-in-the-loop for write actions; tool allowlist |
| Residual score | 6 |
| Owner | CTO |

---

## R-006 — Cross-tenant IDOR

| Field | Value |
|---|---|
| Description | Missing tenantId scope in a query allows reading another tenant's data |
| Likelihood | 3 (code complexity high) |
| Impact | 5 (catastrophic for trust) |
| Inherent score | 15 |
| Treatment | Mitigate — tenant scoping required on every query; CI grep for missing scope; audit log on cross-tenant attempts |
| Residual score | 5 |
| Owner | CTO |

---

## R-007 — Reputation damage from outbound spam

| Field | Value |
|---|---|
| Description | A user sends abusive outbound; our shared sending domains get reputationally damaged |
| Likelihood | 3 |
| Impact | 4 |
| Inherent score | 12 |
| Treatment | Mitigate — per-tenant sending domains, spam rate monitoring, hard-cap at 0.25%, content review, acceptable use enforcement |
| Residual score | 5 |
| Owner | CTO |

---

## R-008 — Backup unavailability

| Field | Value |
|---|---|
| Description | Need to restore DB but backup is corrupted or untested |
| Likelihood | 2 |
| Impact | 5 |
| Inherent score | 10 |
| Treatment | Mitigate — monthly restore test, multi-day PITR, off-provider cold backup |
| Residual score | 4 |
| Owner | CTO |

---

## R-009 — Loss of customer trust from inaccurate privacy page

| Field | Value |
|---|---|
| Description | Privacy page claims (e.g. "Supabase EU") do not match reality; discovered by a security-conscious customer |
| Likelihood | 2 (mitigated by data-driven page from dpas.json) |
| Impact | 4 |
| Inherent score | 8 |
| Treatment | Mitigate — page reads dpas.json (single source of truth); test ensures page rendering uses manifest |
| Residual score | 2 |
| Owner | DPO |

---

## R-010 — MFA absence on admin accounts

| Field | Value |
|---|---|
| Description | No TOTP/WebAuthn on Elevay admin accounts |
| Likelihood | 3 |
| Impact | 5 |
| Inherent score | 15 |
| Treatment | Mitigate — roadmap Q3 2026 |
| Residual score (post-fix) | 4 |
| Owner | CTO |

---

## Heatmap

Inherent (before treatment):

```
              Impact →
Likelihood ↓   1    2    3    4    5
   5
   4                            R-005
   3              R-003   R-001 R-007 R-002 R-006 R-010
   2              R-004        R-009 R-008
   1
```

After mitigation, all residual scores fall below 8 except R-002 (8) which
remains as long as Elevay is a one-person operation.
