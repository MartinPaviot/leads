# Monaco → Elevay : Mapping competences → skills existants → gaps

Date: 2026-05-06

## Methode

Colonnes:
- **Capacite Monaco** : ce que leur produit fait (verifie par sources multiples)
- **Qui porte** : quel fondateur/role est responsable
- **Skill Elevay** : le skill existant qui couvre cette capacite (lu dans le code, handler fonctionnel verifie)
- **Statut** : couvert / partiel / manquant
- **Gap** : ce qui manque concretement

---

## 1. TAM Building + Account Scoring (Malay Desai — ML/Data)

| Capacite Monaco | Skill Elevay | Statut | Gap |
|---|---|---|---|
| Auto-build TAM from ICP | `tam-builder` (170 lignes, Apollo API) | Couvert | Pas de ML scoring natif, scoring via Apollo data only |
| ML scoring with firmographic signals | `contact-scoring.ts` + `lead-qualification` (77 lignes) | Partiel | Scoring rule-based, pas de ML model entraine sur les closed-won |
| ICP inference from closed-won deals | `icp-identification` (96 lignes, LLM + Apollo) | Couvert | Depend de la qualite des donnees closed-won en DB |
| Account ranking by fit | `lead-qualification` + `inbound-lead-qualification` | Couvert | Ranking existe, pas de re-ranking dynamique |

**Verdict : 75% couvert.** Gap principal : le scoring est rule-based, pas ML. Monaco dit "ML scoring" mais on n'a pas de preuve qu'ils font du vrai ML vs. des heuristiques pondérées.

---

## 2. Signal Overlay (Malay Desai — Data Pipelines)

| Capacite Monaco | Skill Elevay | Statut | Gap |
|---|---|---|---|
| Job changes detection | `champion-tracker` (157 lignes, Apollo API) | Couvert | |
| Funding signals | `funding-signal-monitor` (101 lignes, Apollo) | Couvert | |
| Hiring signals / job posting intent | `job-posting-intent` (140 lignes, Apollo + LLM) | Couvert | |
| Tech stack changes | Pas de skill dedie | Manquant | Apollo retourne tech stack mais pas le delta |
| Web activity tracking | Pas de skill | Manquant | Monaco track les visiteurs web — on n'a rien |
| Expansion signals | `expansion-signal-spotter` (181 lignes, DB) | Couvert | Basé sur données internes, pas de source externe |
| Leadership changes | `leadership-change-outreach` (124 lignes) | Couvert | Combine detection + outreach en un seul skill |
| Signal aggregation + prioritization | `signal-scanner` (152 lignes, DB + momentum) | Couvert | |
| Investor overlap detection | `investor-overlap` (162 lignes) | Couvert | Pas dans Monaco — c'est un plus Elevay |

**Verdict : 80% couvert.** Gaps : tech stack delta tracking, website visitor identification (Monaco ne l'a pas non plus selon les reviews, mais c'est une capacite concurrente a avoir).

---

## 3. AI Outbound Sequences (Sam Blond — Sales Methodology)

| Capacite Monaco | Skill Elevay | Statut | Gap |
|---|---|---|---|
| Generate personalized outreach sequences | `cold-email-outreach` (37 lignes handler, appelle `sequence-generator`) | Couvert | Sequence generator = 500+ lignes, 4 frameworks |
| Single email drafting | `email-drafting` (98 lignes, LLM) | Couvert | |
| Follow-up email after meeting | Via chat tool `generateFollowUpEmail` | Couvert | |
| Reply suggestion (3 tones) | Via chat tool `suggestEmailReply` | Couvert | |
| Methodology-based outreach (BASHO, etc.) | `outbound-methodologies.ts` + `sequence-generator.ts` | Couvert | 4 frameworks : BASHO, Challenger, Problem-Solution, Product-Led |
| Anti-pattern detection (bad openers, etc.) | `sequence-generator.ts` evaluator loop | Couvert | Plus knowledge base email-benchmarks.ts ajoutee |
| Objection handling | `handle-objection` (116 lignes, LLM + deal context) | Couvert | |
| Draft proposal | `draft-proposal` (147 lignes, LLM) | Couvert | Pas dans Monaco — plus Elevay |

**Verdict : 95% couvert.** C'est le domaine le plus complet. Le gap est dans la mesure de performance reelle (open rate, reply rate) qui n'est pas encore bouclee end-to-end.

---

## 4. Activity Capture (Abishek Viswanathan — Product)

| Capacite Monaco | Skill Elevay | Statut | Gap |
|---|---|---|---|
| Email capture + summarization | Email sync + `email-intelligence.ts` | Partiel | Sync existe, summarization via LLM existe, pas teste end-to-end |
| Meeting recording + notes | `meeting-brief` + `sales-call-prep` | Partiel | Brief generation OK, mais pas de recording/transcription integre |
| Call recording | Pas de skill | Manquant | Monaco a un meeting recorder natif |
| Auto-enrichment of captured data | `inbound-lead-enrichment` (130 lignes) | Couvert | Enrichit via Apollo a la reception |
| Contact cache / deduplication | `contact-cache` (75 lignes) | Couvert | |

**Verdict : 60% couvert.** Gap principal : pas de recording/transcription de meetings. C'est une feature produit lourde (audio processing, STT) pas un skill LLM.

---

## 5. Pipeline Tracking (Abishek Viswanathan — Product)

| Capacite Monaco | Skill Elevay | Statut | Gap |
|---|---|---|---|
| Signal-based stage advancement | `deal-velocity.ts` + auto-progression deal | Couvert | |
| Risk detection (ghosting, stalls) | `churn-risk-detector` (174 lignes) | Couvert | |
| Auto-filled fields | AI autofill (agent eval config presente) | Partiel | Config eval existe, pas clair si le handler est complet |
| Real-time pipeline reflection | `pipeline-review` (125 lignes) | Couvert | |
| Sequence performance tracking | `sequence-performance` (127 lignes) | Couvert | |

**Verdict : 85% couvert.** Gap : auto-fill des champs custom pas verifie en profondeur.

---

## 6. CRO Copilot / Ask Monaco (Sam Blond — Methodology)

| Capacite Monaco | Skill Elevay | Statut | Gap |
|---|---|---|---|
| Natural language pipeline queries | Chat agent + queryDeals/queryContacts tools | Couvert | 50/50 tool selection eval |
| Proactive business insights | `sales-coaching` (148 lignes, LLM + deal velocity) | Couvert | |
| Sales coaching | `sales-coaching` + golden case chat-002 | Couvert | |
| Deal coaching per-deal | `getDealCoaching` chat tool | Couvert | |
| Competitive battlecard | `battlecard-generator` (91 lignes, Apollo + LLM) | Couvert | |
| Competitor intelligence | `competitor-intel` (104 lignes, Apollo + LLM) | Couvert | |

**Verdict : 95% couvert.** Le chat agent avec routing + skills couvre cette capacite.

---

## 7. Forward Deployed AE (Brian Blond — Revenue Ops)

| Capacite Monaco | Equivalent Elevay | Statut | Gap |
|---|---|---|---|
| Human reviews AI output before sending | Pas de human-in-the-loop UI | Manquant | Les sequences sont generees mais il n'y a pas de UI de review/approve avant envoi |
| Human conducts meetings | Le fondateur (decision architecture confirmee) | Couvert | By design — l'AE reste humain |
| Meeting prep pour le fondateur | `meeting-brief` + `sales-call-prep` | Couvert | |
| White-glove onboarding | `onboarding-wizard.tsx` existe | Partiel | Onboarding existe mais pas "white-glove" avec un AE dedie |
| Feedback loop AE → product | Flywheel (`flywheel.ts`) + traces | Partiel | L'infra existe, le feedback humain explicite manque |
| QA des campagnes avant lancement | Evaluator-optimizer loop dans `sequence-generator.ts` | Couvert | Auto-QA, pas de human QA |
| Re-engagement des deals stalles | `re-engage-stalled` (144 lignes) | Couvert | |
| Scope POC | `scope-poc` (111 lignes) | Couvert | Pas dans Monaco — plus Elevay |

**Verdict : 50% couvert.** Le gap critique : pas de UI "review & approve" pour que le fondateur valide les emails/sequences avant envoi. C'est ce qui remplace l'AE humain de Monaco — le systeme prepare, le fondateur approve, le systeme envoie.

---

## Resume des gaps par priorite

| # | Gap | Impact | Effort | Priorite |
|---|---|---|---|---|
| 1 | **UI Review & Approve** avant envoi email/sequence | Critique — sans ca le fondateur ne peut pas etre le human-in-the-loop | Moyen (UI component + API) | P0 |
| 2 | **Meeting recording + transcription** | Haut — Monaco l'a, c'est un differentiateur cle | Haut (STT, audio processing, integration calendar) | P1 |
| 3 | **Scoring ML** (pas juste rule-based) | Moyen — ameliore la pertinence du TAM mais le rule-based fonctionne | Moyen (training pipeline, features) | P2 |
| 4 | **Tech stack delta tracking** | Bas — signal supplementaire, pas critique | Bas (Apollo diff periodic) | P3 |
| 5 | **Website visitor identification** | Bas — Monaco ne l'a pas non plus | Haut (pixel tracking, reverse IP) | P3 |
| 6 | **Reply/open rate feedback loop** | Haut — on genere des emails mais on ne mesure pas leur performance reelle | Moyen (track sends, link clicks, reply matching) | P1 |
