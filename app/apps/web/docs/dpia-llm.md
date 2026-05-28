# DPIA — Large Language Model processing

**Last updated:** 2026-05-19
**Owner:** DPO (privacy@elevay.dev)
**Legal basis for DPIA:** GDPR Art. 35 (high-risk processing — automated
decisions, large-scale personal data, innovative technology)
**Status:** initial assessment, to review at each LLM provider change

This DPIA covers RA-5 (LLM inference) in the RoPA. It documents the
necessity, proportionality, risks, and mitigation measures for sending
personal data to large language model providers.

---

## 1. Description of the processing

Elevay sends prompts to large language models for:

- Chat assistant (natural-language queries on the user's CRM)
- Email generation (drafts based on contact + deal context)
- Lead scoring (classification)
- Deal coaching (recommendations based on activity history)
- Meeting and email summarisation

The prompts include:

- Contact data: name, professional email, job title, company
- Company data: name, domain, industry, size
- Deal data: name, stage, value, history of activities
- Email and meeting content: as written by users and their counterparts
- Free-form user instructions

Output is consumed by the user inside the application; the user accepts,
edits, or discards it. No fully automated decision with legal effect is
made on the basis of LLM output alone (out of scope of Art. 22 GDPR).

---

## 2. Providers and their role

| Provider | Role | Region | Operator jurisdiction | Default |
|---|---|---|---|---|
| Anthropic (Claude) | Chat, generation, scoring | EU (eu.anthropic.com) | US (Cloud Act) | yes |
| Mistral AI | Same as above | EU (FR — Mistral La Plateforme) | EU-sovereign | opt-in |
| OpenAI | Embeddings only | US | US (Cloud Act) | yes |

Anthropic and OpenAI are bound by a contractual no-training commitment for
data sent through the API. Mistral La Plateforme commercial terms include
the same commitment. We hold their public DPAs.

---

## 3. Necessity and proportionality

| Question | Answer |
|---|---|
| Is the processing necessary for the purpose? | Yes — the product's core differentiation is AI-driven chat, scoring, and generation. Replacing these features with manual workflows would defeat the contract. |
| Is the data minimised? | Yes per-call: we only include the fields relevant to the specific task. CRM is not bulk-shipped to the LLM. |
| Are less-intrusive alternatives possible? | (a) Self-hosted open-source LLM (Llama 3.3, Mistral Small 3) — possible at significantly higher cost; on roadmap as the "EU-sovereign profile". (b) Smaller, on-premise models — not yet capable enough for the user-facing chat. |
| Is the retention by the provider minimised? | Yes — zero-data-retention requested where the provider exposes that option; otherwise contractual 30-day max. |

---

## 4. Risks identified

### 4.1 Confidentiality risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Prompt-injection causes the LLM to exfiltrate other tenants' data | Low (per-tenant DB isolation; prompts never contain other tenants' data) | High | Tenant scoping in every read query; LLM context built only from current tenant |
| Untrusted user content (email body, meeting transcript) instructs the LLM to perform unintended actions | Medium | Medium | Wrap untrusted content in delimited blocks in the prompt; system prompt instructs the model to treat content inside delimiters as data not instructions |
| Personal data sent to a US provider falls under CLOUD Act access | Certain for Anthropic/OpenAI (operator US) | Medium-High for sovereignty-sensitive customers | EU endpoint pinning; offer Mistral (FR-sovereign) profile; document openly on `/sub-processors` |
| Model trains on customer data | Mitigated contractually | High if breached | Contractual no-training; audit by reviewing provider DPA at renewal |

### 4.2 Integrity risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM hallucinates a CRM fact that gets actioned by the user | Medium | Low-Medium | Cite source documents in chat responses; human-in-the-loop before any external action (email send, contact write) |
| LLM is used to generate a misleading email | Low | Medium | Human approval required before send |

### 4.3 Availability risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM provider outage | Medium (covered for Anthropic by circuit breaker) | Medium | Circuit breaker → OpenAI fallback; on `LLM_PROVIDER=auto` Mistral can serve as fallback |
| Cost spike from malicious prompt amplification | Low | Medium | Per-tenant rate limits + token caps |

### 4.4 Rights and freedoms of data subjects

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Data subject has no way to know their data was sent to an LLM | High before mitigation | Medium | Disclosed in `/privacy` and `/sub-processors`; per-user setting to disable AI features |
| Data subject objection to automated processing | Low | Low | Documented right of objection; `/api/gdpr/*` endpoints |

---

## 5. Supplementary measures

1. **Regional pinning**: `ANTHROPIC_REGION=eu` enforced via env + boot guard.
2. **PII minimisation**: prompts include only the fields needed for the task.
3. **Contractual no-training**: validated in Anthropic, OpenAI, Mistral DPAs.
4. **Prompt-injection mitigation**: untrusted content wrapped in delimited XML-like tags.
5. **No autonomous actions**: tool calls that perform writes (send email, create sequence) require human approval.
6. **Audit logging**: every LLM call is logged (model, tenant, latency, token usage) — no payload content stored.
7. **Opt-out path**: tenants in regulated sectors can switch to Mistral (FR-sovereign) via `LLM_PROVIDER=mistral`.
8. **Right to information**: explicit notice in `/privacy` and `/security`.

---

## 6. Residual risk

| Risk area | Residual level after mitigation |
|---|---|
| Confidentiality (CLOUD Act) | Medium for Anthropic profile; Low for Mistral profile |
| Integrity (hallucination) | Low — human-in-the-loop on all external actions |
| Availability | Low — circuit breaker + fallback |
| Rights and freedoms | Low — disclosure + opt-out + DSR pipeline |

For sovereignty-sensitive customers (public sector, regulated finance), the
recommendation is to provision under the EU-sovereign profile to bring
confidentiality residual risk to Low.

---

## 7. Consultation

| Stakeholder | Status |
|---|---|
| DPO | Author of this DPIA |
| Engineering lead | Reviewed mitigations are implementable; FINDING-004 region pinning applied |
| CNIL prior consultation | Not required — residual risks are not high |

---

## 8. Decision

**Approved.** The processing is necessary and proportionate, residual risks
are acceptable for the default profile, and the EU-sovereign profile is
available for customers requiring stricter guarantees.

Review at:
- Each new LLM provider added
- Each change in provider DPA terms
- Annually

---

## Change log

| Date | Change | Author |
|---|---|---|
| 2026-05-19 | Initial DPIA covering Anthropic EU + Mistral opt-in + OpenAI embeddings | DPO |
