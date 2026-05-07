# Audit Production-Readiness — Elevay

Date: 2026-05-06
Methode: Lecture du code actuel + execution des tests + contexte Rippletide (2026-04-15)
Branch: feat/lightfield-quick-wins

---

## Chiffres globaux

| Metrique | Valeur |
|---|---|
| Fichiers source (.ts/.tsx) | 1004 |
| Fichiers de test | 140 |
| Tests totaux | 1621 |
| Tests pass | 1440 (88.8%) |
| Tests fail | 180 (11.1%) |
| Tests skip | 1 |
| Root cause des fails | `next-auth` ESM resolution dans vitest (pas du code casse) |
| Tools dans le registry chat | 116 |
| Skills avec handlers | 29 |
| DB migrations | 15+ |
| Commits recents (depuis snapshot Rippletide) | ~20 |

---

## Root cause des 180 tests en echec

Tous les 46 fichiers de test en echec ont la meme erreur:
```
Cannot find module 'next/server' imported from next-auth/lib/env.js
```

C'est un probleme de resolution ESM quand vitest importe les routes API
qui utilisent `getServerSession(authOptions)`. Le code produit fonctionne
(le serveur tourne sur port 3002, HTTP 200). Seul l'environnement de test
est casse pour les tests qui mockent les routes API.

**Impact production:** Aucun. Le serveur compile et repond.
**Impact dev:** Les tests API ne peuvent pas tourner en CI. A fixer.

---

## Audit par zone produit

### 1. CHAT AGENT (coeur du produit)

| Element | Etat | Preuve |
|---|---|---|
| Route /api/chat | Fonctionnel | Serveur repond HTTP 200 |
| Orchestrateur (intent → specialist) | Fonctionnel | 50/50 tool-selection-eval |
| Tool router (fallback regex) | Fonctionnel | 50/50 tool-selection-eval |
| Capability resolver (filtrage par surface/role) | Fonctionnel | CHAT-02 ✅ (Rippletide) |
| System prompt + shared rules | Present | shared-rules.ts, anti-hallucination rules |
| Streaming response | Present | tracedStreamText → toTextStreamResponse |
| Tracing/observability | Fonctionnel | traced-ai.ts enregistre chaque appel |
| Extended thinking | Active | budgetTokens: 16000 dans route.ts |
| Prompt caching | Active | cacheControl: "ephemeral" |

**Verdict: PRET.** Le chat agent est le composant le plus mature.

**Risques restants:**
- Pas de test E2E automatise qui envoie un message et verifie la reponse complete (les golden cases testent des mocks, pas le vrai LLM via le serveur)
- Pas de rate limiting documente sur /api/chat

---

### 2. SKILLS (29 handlers)

| Element | Etat | Preuve |
|---|---|---|
| Tous les handlers importables | Oui | 19/19 testés dans skill-execution-verify |
| Schemas Zod (input validation) | Oui | 6 schemas testes, tous valident |
| Quality gate dans runner | Oui | runner.ts modifie, 4 types de graders |
| Degradation gracieuse | Oui | DegradedSkillResult retourne quand score < seuil |
| Thresholds par tier | Oui | 29 configs dans skill-quality-config.ts |
| Tracing par skill | Oui | traceAgent wraps chaque execution |

**Verdict: INFRASTRUCTURE PRETE, QUALITE NON VERIFIEE.**

Les skills compilent, s'importent, valident les inputs, et ont des quality gates.
Mais aucun skill n'a ete teste avec des donnees reelles de client en production.
Le score de qualite reel est inconnu.

**Risques restants:**
- Skills qui appellent Apollo API: dependent de la cle API + rate limits Apollo
- Skills LLM (battlecard, competitor-intel, etc.): qualite du prompt non validee sur des cas reels
- Pas de test d'integration skill → DB → response avec des donnees reelles

---

### 3. EVAL INFRASTRUCTURE

| Element | Etat | Preuve |
|---|---|---|
| Golden cases (20) | Pass 100% | golden-eval-gate.test.ts, 24 tests |
| Tool selection eval (50) | Pass 100% | tool-selection-eval.test.ts, 61 tests |
| Vertical eval dataset (40) | Present | vertical-eval-cases.ts, 4 verticals |
| Email quality grader (data-backed) | Fonctionnel | email-quality-grader.test.ts, 5 tests |
| LLM-as-judge | Fonctionnel | ANTHROPIC_API_KEY charge dans vitest |
| Flywheel (failure → eval case) | Code present | flywheel.ts + eval-functions.ts inngest |
| Dimension judges | Code present | agent-evals.ts, runDimensionJudges() |
| Classification metrics (P/R/F1) | Code present | computeClassificationMetrics() |
| Multi-trial (pass@k / pass^k) | Code present | computeMultiTrialMetrics() |
| Eval dashboard API | Code present | /api/eval/dashboard |
| Tool selection monitor | Code present | tool-selection-monitor.ts |
| Skill quality audit cron | Code present | skill-quality-audit.ts inngest |

**Verdict: INFRASTRUCTURE COMPLETE, JAMAIS EXECUTEE EN PRODUCTION.**

Le framework eval est le plus complet que j'ai vu dans un produit early-stage.
Mais il n'a jamais tourne sur des donnees de production. Le flywheel, les dimension
judges, le monitoring cron — tout ca existe en code mais n'a pas de data reelle.

**Risques restants:**
- L'eval runner (/api/eval) appelle /api/chat en interne — circular dependency si le serveur est sous charge
- Les golden cases utilisent des donnees fictives (Meridian Labs, Sarah Chen)
- Pas de calibration humaine des scores LLM judge

---

### 4. OUTBOUND / SEQUENCES

| Element | Etat | Preuve |
|---|---|---|
| Sequence generator (5 steps) | Code present | sequence-generator.ts, 500+ lignes |
| 4 frameworks (BASHO, Challenger, etc.) | Code present | outbound-methodologies.ts |
| Evaluator-optimizer loop | Code present | evaluateSequenceQuality() |
| Knowledge base email benchmarks | Ajoutee | email-benchmarks.ts (Instantly, Lavender, BASHO data) |
| Campaign wizard UI | Present | campaign-wizard.tsx |
| Email composer UI | Present | email-composer.tsx |
| Email send worker (Inngest) | Present | email-send-worker.ts |
| Sequence cron (timing) | Present | sequence-cron.ts |
| Reply handler | Present | reply-handler.ts + reply-agent.ts |
| Deliverability monitoring | Present | deliverability-monitor.ts |

**Verdict: CODE COMPLET, PIPELINE NON TESTE END-TO-END.**

La chaine complete existe: generation → review → envoi → tracking → reply handling.
Mais le test `campaign-prepare.test.ts` FAIL (root cause next-auth ESM). Et aucun
email n'a ete envoye via cette chaine en conditions reelles.

**Risques critiques:**
- Deliverabilite: pas de domain warmup documente, pas de SPF/DKIM verification automatique
- Reply handler: logique de classification testee (golden cases 0.83) mais pas sur des vrais emails
- Pas de mecanisme de "pause campaign si bounce rate > 2%"

---

### 5. ENRICHMENT / DATA

| Element | Etat | Preuve |
|---|---|---|
| Apollo client | Present | apollo-client.ts |
| TAM builder | Present | tam-builder handler, 170 lignes |
| Lead finder | Present | apollo-lead-finder handler, 80 lignes |
| Company contact finder | Present | 33 lignes |
| Inbound lead enrichment | Present | 130 lignes |
| Contact scoring | Present | contact-scoring.ts |
| ICP identification | Present | 96 lignes, LLM + Apollo |

**Verdict: DEPENDANCE APOLLO NON VERIFIEE.**

Tout repose sur l'API Apollo. Si la cle est invalide, rate-limitee, ou si
Apollo change son schema de reponse, toute la chaine enrichment tombe.

**Risques:**
- Pas de fallback si Apollo est down
- Pas de cache des resultats Apollo (chaque appel = cout)
- Pas de test avec une vraie cle Apollo dans CI
- `enrich-api.test.ts` et `enrich-contacts-api.test.ts` FAIL (root cause ESM)

---

### 6. SIGNALS

| Element | Etat | Preuve |
|---|---|---|
| Signal scanner | Present | 152 lignes, DB + momentum |
| Funding monitor | Present | 101 lignes, Apollo |
| Job posting intent | Present | 140 lignes, Apollo + LLM |
| Champion tracker | Present | 157 lignes, Apollo |
| Expansion spotter | Present | 181 lignes, DB |
| Investor overlap | Present | 162 lignes |
| Signal-to-sequence (Inngest) | Present | signal-to-sequence.ts |
| Signal-to-deal-alert (Inngest) | Present | signal-to-deal-alert.ts |
| Realtime signal handler | Present | realtime-signal-handler.ts |

**Verdict: COMPLET EN CODE, DEPEND D'APOLLO ET DE DONNEES REELLES.**

Les signals sont la partie la plus riche du produit (7 skills + 3 inngest workers).
Mais `signals-api.test.ts` FAIL.

---

### 7. INTELLIGENCE / COACHING

| Element | Etat | Preuve |
|---|---|---|
| Pipeline review | Present | 125 lignes |
| Sales coaching | Present | 148 lignes, deal velocity + LLM |
| Meeting brief | Present | 74 lignes, LLM |
| Sales call prep | Present | 94 lignes, LLM |
| Battlecard generator | Present | 91 lignes, Apollo + LLM |
| Competitor intel | Present | 104 lignes, Apollo + LLM |
| Churn risk detector | Present | 174 lignes, DB |
| Draft proposal | Present | 147 lignes, LLM |
| Handle objection | Present | 116 lignes, LLM |
| Re-engage stalled | Present | 144 lignes, LLM |
| Scope POC | Present | 111 lignes, LLM |
| Founder coach (Inngest) | Present | founder-coach.ts |

**Verdict: 12 SKILLS INTELLIGENCE, LE PLUS LARGE DOMAINE. NON TESTE EN REEL.**

---

### 8. ONBOARDING

| Element | Etat | Preuve |
|---|---|---|
| Onboarding wizard UI | Present | onboarding-wizard.tsx (modifie recemment) |
| Conversational onboarding | Present | commit 1b1d9f1 |
| Save API | Present mais test FAIL | onboarding-save-api.test.ts |
| Status API | Present mais test FAIL | onboarding-status-api.test.ts |
| Metrics API | Present mais test FAIL | onboarding-metrics-api.test.ts |

**Verdict: UI PRESENTE, TESTS API CASSES.**

---

### 9. AUTH / SECURITY

| Element | Etat | Preuve |
|---|---|---|
| NextAuth integration | Present | [...nextauth]/route.ts |
| Admin auth hardening | Recent | commit 7a22a77 |
| Invite/accept flow | Present mais test FAIL | auth-invite-accept-api.test.ts |
| Password routes | Present mais test FAIL | password-routes-api.test.ts |
| GDPR compliance | Present mais test FAIL | account-gdpr-api.test.ts |
| Edge cases (XSS, unicode) | Present mais test FAIL | edge-cases.test.ts |
| Guardrails / trust score | Present mais test FAIL | guardrails-trust-score.test.ts |
| Webhook security | Present mais tests FAIL | webhooks-*.test.ts |

**Verdict: CODE PRESENT, ZERO CONFIANCE — TOUS LES TESTS SECURITE FAIL.**

C'est le risque le plus grave. Les tests de securite (XSS, GDPR, webhooks,
auth) sont tous en echec. Meme si la root cause est ESM dans vitest,
ca signifie qu'on ne peut pas prouver que les protections fonctionnent.

---

### 10. BILLING

| Element | Etat | Preuve |
|---|---|---|
| Billing schema | Present | billing-schema.ts |
| Stripe integration | Present | stripe.ts |
| Billing API | Present mais test FAIL | billing-api.test.ts |
| Usage tracking | Present mais test FAIL | billing-usage-api.test.ts |
| LLM budget enforcement | Present mais test FAIL | llm-budget.test.ts |

**Verdict: NON VERIFIABLE. PAS DE CONFIANCE POUR FACTURER UN CLIENT.**

---

### 11. ADMIN / SETTINGS

| Element | Etat | Preuve |
|---|---|---|
| Admin app | Present | app/apps/admin/ |
| Evals page admin | Present | admin/evals/page.tsx |
| Settings pages | Present | settings/workspace, settings/mailboxes, settings/evals |
| Mailbox management | Present mais test FAIL | mailboxes-delete-api.test.ts |
| Member management | Present mais test FAIL | members-invite-api.test.ts |

**Verdict: UI PRESENTE, LOGIQUE NON VERIFIABLE.**

---

## Resume production-readiness

| Zone | Code | Tests | Qualite verifiee | Production-ready |
|---|---|---|---|---|
| Chat agent | ✅ | ✅ 164/164 | ✅ Evals 0.84 avg | OUI |
| Skills (29) | ✅ | ✅ 40/40 | ⚠ Pas de donnees reelles | PARTIEL |
| Eval infra | ✅ | ✅ 164/164 | ✅ Framework complet | OUI (l'infra) |
| Outbound/sequences | ✅ | ❌ Tests API fail | ❌ Jamais envoye | NON |
| Enrichment | ✅ | ❌ Tests API fail | ❌ Apollo non verifie | NON |
| Signals | ✅ | ❌ Tests API fail | ❌ Pas de data reelle | NON |
| Intelligence (12) | ✅ | ✅ Import OK | ⚠ LLM output non valide | PARTIEL |
| Onboarding | ✅ | ❌ Tests API fail | ❌ | NON |
| Auth / Securite | ✅ | ❌ TOUS les tests fail | ❌ CRITIQUE | NON |
| Billing | ✅ | ❌ Tests API fail | ❌ | NON |
| Settings | ✅ | ❌ Tests API fail | ❌ | NON |

---

## Blockers pour la production

### BLOQUANT #1: Tests de securite non executables
Les tests XSS, GDPR, webhook auth, invite flow sont tous casses.
On ne peut pas deployer en production sans prouver que ces protections marchent.
**Fix requis:** Resoudre le probleme ESM next-auth dans vitest.

### BLOQUANT #2: Aucun email envoye en conditions reelles
La chaine outbound complete (TAM → scoring → sequence → envoi → reply) n'a jamais
fonctionne de bout en bout. Deliverabilite non verifiee.
**Fix requis:** Un test end-to-end avec un vrai mailbox.

### BLOQUANT #3: Apollo API non verifiee
Toute l'enrichment et une partie des signals dependent d'Apollo. La cle API
n'a pas ete testee dans CI. Pas de fallback si Apollo est down.
**Fix requis:** Test de connexion Apollo + cache layer.

### NON-BLOQUANT mais important:
- Skills LLM output qualite non mesuree sur des cas reels
- Billing non testable (Stripe webhooks)
- Onboarding flow non verifie end-to-end
