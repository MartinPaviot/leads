# Elevay compliance documentation

This directory holds the documents auditors, customers, and our own DPO
need to inspect Elevay's security and privacy posture.

| Document | Purpose | Audience |
|---|---|---|
| [ropa.md](./ropa.md) | Record of Processing Activities (GDPR Art. 30 / nFADP Art. 12) | DPO, supervisory authorities |
| [dpia-llm.md](./dpia-llm.md) | DPIA for LLM processing (GDPR Art. 35) | DPO, supervisory authorities, sovereign-aware customers |
| [data-classification.md](./data-classification.md) | Field-level classification and controls | Engineering, DPO |
| [incident-response.md](./incident-response.md) | IR playbook + 72h notification flow | All staff |
| [asset-inventory.md](./asset-inventory.md) | Information asset inventory (ISO 27001 A.5.9) | CTO, auditors |
| [vendor-management.md](./vendor-management.md) | Sub-processor onboarding/review/offboarding | DPO, CTO |
| [risk-register.md](./risk-register.md) | Identified risks, treatments, owners | CTO, DPO, board |

Public-facing equivalents live in the app routes:

- `/privacy` — Privacy Policy (data-driven from `src/data/dpas.json`)
- `/sub-processors` — Canonical sub-processor list
- `/security` — Architecture, controls, compliance roadmap
- `/terms`, `/acceptable-use` — legal

The application-level enforcement of region pinning is in:

- `src/lib/region-config.ts` — EU/CH host allowlist, Anthropic endpoint guard
- `src/lib/geo-detect.ts` — request-time EU detection
- `src/db/index.ts` — DB region assertion at boot
- `src/lib/ai/ai-provider.ts` — Anthropic EU endpoint singleton + Mistral router
