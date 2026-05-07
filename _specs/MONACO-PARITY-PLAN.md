# Monaco Parity Plan — 2026-05-06

Source: `_research/monaco-bilan-et-classification-2026-05-06.md` (Partie 4 + 7).

This plan tracks the addressable gaps between Elevay's current state (78% Monaco-equivalent) and the **Monaco-supérieur** target (96%). Each chantier follows the Kiro spec convention: a sub-folder under `_specs/MONACO-PARITY-XX-…/` contains `requirements.md`, `design.md`, `tasks.md`. This file is the index.

## Vague 1 — Polish dense (LIVRÉ 2026-05-06)

Direct edits, no spec needed:

| # | Chantier | Files touched | Status |
|---|---|---|---|
| 1 | "From [sender] To [recipient]" header in review queue | `app/(dashboard)/sequences/[id]/review/page.tsx` | ✅ |
| 2 | Per-sequence Approve/Reject UI in sequences list | `app/(dashboard)/sequences/page.tsx` | ✅ |
| 3 | Kanban $ totals in column headers | `app/(dashboard)/opportunities/page.tsx` | ✅ |
| 4 | Personnalisation fail: structured logging + UI badge | `inngest/functions.ts`, `app/(dashboard)/sequences/[id]/review/page.tsx` | ✅ |
| 5 | Risk detection: tooltip with reasons + ⓘ glyph | `app/(dashboard)/opportunities/page.tsx` | ✅ |

## Vague 2 — Robustesse moyenne

Polish-grade edits + observability hardening.

| # | Spec | Effort | Priority | Status |
|---|---|---|---|---|
| 6 | Auto-fill deal fields: extraction failure tally + zero-success warnings | S | P0 | ✅ Livré (`lib/deals/deal-autofill.ts`) |
| 7 | [MONACO-PARITY-01-signal-factual](MONACO-PARITY-01-signal-factual/) | M (1-2 sem) | P1 | ✅ Complet : URL verifier + 4-state classifier + cache pg-backed + migration `0039_*.sql` + runtime ensure + cron eviction + scanner integration + composant `<SignalConfidenceBadge>` reutilisable. Cablage UI dans TAM list à faire au prochain emit-path LLM-evidence. |
| 8 | [MONACO-PARITY-02-inbound-hot-signal](MONACO-PARITY-02-inbound-hot-signal/) | S (2-3j) | P1 | ✅ Livré (webhook + free-email + widget + 15 tests) |

## Vague 3 — Oceans (Kiro spec dédié, multi-semaines)

Structural changes requiring schema migrations, third-party integrations, or major UI surfaces.

| # | Spec | Effort | Priority | Status |
|---|---|---|---|---|
| 9 | [MONACO-PARITY-03-onboarding-7-phases](MONACO-PARITY-03-onboarding-7-phases/) | L (3-4 sem) | **P0** | ✅ Complet + premium tier : table `onboarding_progress` + 7 Zod validators + 9 hard checklist gates DB-grounded + APIs `/state`/`/phase/:n`/`/complete` + front-end `<OnboardingWizard>` au route `/onboarding-v3` + `<FounderLedUpsell>` ($299 one-time Stripe checkout) + `<OnboardingIncompleteBanner>` cable sur `/home` + telemetry PostHog (`onboarding_v3_phase_submitted`, `onboarding_v3_completed`, `onboarding_v3_founder_led_clicked`). |
| 10 | [MONACO-PARITY-04-visitor-id](MONACO-PARITY-04-visitor-id/) | L (2-3 sem) | **P0** | ✅ Complet : table `visits` + provider abstraction + Snitcher impl + pixel JS `/api/v1/pixel.js` + `/api/v1/visit/track` + Inngest `identifyVisit` + endpoint `/api/dashboard/hot-visitors` + `<HotVisitorsWidget>` cable sur home (grid 2-col avec hot-inbounds). **Decision Monaco-style** : Snitcher (Monaco's own choice). À activer en prod : set `SNITCHER_API_KEY` + embed pixel sur marketing site. |
| 11 | [MONACO-PARITY-05-coaching-rag-citations](MONACO-PARITY-05-coaching-rag-citations/) | M (1-2 sem) | **P0** | ✅ Complet sauf player video : chunking (12 tests) + citation parser (18 tests) + chip + CitedText + prompt + migration `0039_*.sql` (transcript_chunks + pgvector HNSW) + indexer dans `/api/meetings/process-transcript` + retrieval helper + chat tool `searchTranscripts` + endpoint `/api/meetings/[id]/transcript-chunks` + `<TranscriptChunks>` viewer avec scroll-to-cite + meeting page banner `?t=`. Reste : recording video player (depend Recall.ai surface ou natif via 06). |
| 12 | [MONACO-PARITY-06-meeting-recorder-native](MONACO-PARITY-06-meeting-recorder-native/) | XL (4-6 sem) | P2 | ⏸️ **Decision Monaco-style** : DEFER. Monaco lui-meme utilise toujours Recall.ai. Trigger pour rouvrir : Recall.ai bill > $1K/mois. |
| 13 | [MONACO-PARITY-07-ml-scoring-trained](MONACO-PARITY-07-ml-scoring-trained/) | L (4-6 sem) | P2 | ⏸️ **Decision Monaco-style** : DEFER. Monaco requiert ≥30 closed-won/tenant avant training. Aucun client Elevay actuel n'a ce volume. Trigger pour rouvrir : 1er tenant atteint 30 wins. |

## Sequencing

Recommended attack order based on impact × effort ratio + dependency chain:

1. **MONACO-PARITY-02** (inbound hot signal) — small, unlocks demo-form value capture.
2. **MONACO-PARITY-01** (signal factual + 4-state) — schema migration; needed before MONACO-PARITY-04 (visitor ID feeds same signal table).
3. **MONACO-PARITY-05** (coaching RAG) — biggest visible differentiator vs ChatGPT, M effort.
4. **MONACO-PARITY-04** (visitor ID) — exceeds Monaco's own product (they use Snitcher on their site but don't sell it).
5. **MONACO-PARITY-03** (onboarding 7-phases) — depends on stability of items 1-4 to validate at each phase.
6. **MONACO-PARITY-07** (ML scoring) — only after closed-won corpus is meaningful (≥30 wins per tenant).
7. **MONACO-PARITY-06** (native meeting recorder) — Recall.ai dependency is fine until volume justifies the rewrite.

## Cible chiffrée

Per Partie 8 du bilan :

| Étape Monaco | Score actuel | Cible Monaco-equiv | Cible Monaco+ |
|---|---|---|---|
| 1 — Build TAM | 70% | 85% | 95% |
| 2 — Overlay Signals | 75% | 90% | 95% |
| 3 — Execute Sequences | 85% | 95% | 98% |
| 4 — Capture Activity | 75% | 90% | 95% |
| 5 — Track Pipeline | 80% | 90% | 95% |
| 6 — Ask Monaco | 85% | 95% | 98% |
| **MOYENNE** | **78%** | **91%** | **96%** |

Ce plan transforme 78% → 96% en exécutant les 13 chantiers ci-dessus à la lettre.
