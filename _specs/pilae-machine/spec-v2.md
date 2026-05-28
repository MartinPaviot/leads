# Elevay → Machine commerciale Pilae · Spec Kiro v2

> **Méthodo :** Kiro (Spec → Plan → Execute) — Requirements (EARS), Design, Tasks.
> **Quoi :** configurer le tenant Pilae sur l'Elevay existant et combler 7 gaps produit pour livrer la machine outbound qui supporte l'OKR 1 M€ de pipeline signé en 90 jours.
> **Stack (locké) :** Next.js 15.5, TypeScript, Drizzle 0.45, Neon Postgres, Inngest 4.1, Upstash Redis, Apollo + Kaspr + Lusha (waterfall), Twilio + Deepgram Nova-3, Unipile (LinkedIn), Resend + EmailEngine (warmup natif), Recall.ai (meetings), Anthropic Claude + OpenAI fallback.
> **Owner :** Martin Paviot. **Premier tenant dogfood :** Pilae.
> **Diff vs v1 :** la v1 re-spécifiait du déjà-livré, proposait 4 fournisseurs hors stack lockée, ignorait 2 décisions stratégiques (wedge, kairos). La v2 part du ground truth du code (audit 2026-05-28), acte 6 décisions noir sur blanc, réduit le périmètre à 7 vrais gaps (≈ 10 dev-days), sort la propale/LOI/Docuseal du scope.

---

## 0. État actuel — ce qui est déjà shippé (ne pas re-spécifier)

Périmètre vérifié contre le code au 2026-05-28. Toute requirement qui re-spécifie ce qui suit est un bug de spec.

### 0.1 Schéma data (multi-tenant `tenantId`-scopé)
- `tenants`, `companies`, `contacts`, `deals`, `activities`, `notes`, `tasks`, `chatThreads`, `chatMessages` — `app/apps/web/src/db/schema/core.ts:48,78,115`
- `sequences`, `sequenceSteps` (enum `stepType` inclut déjà `phone_task`), `sequenceEnrollments`, `sequenceDrafts` (queue d'approbation avec optimistic lock `version`) — `outbound.ts:35,53,63,79,116`
- `linkedinAccounts`, `linkedinMessages`, `linkedinWebhookEvents` — `linkedin.ts:60`
- `customSignals`, `signalOutcomes` — `intelligence.ts:655`
- `connectedMailboxes`, `outboundEmails`, `warmupEmails`, `emailOptouts`

### 0.2 Infrastructure outbound shippée
- Dispatcher multi-canal — `app/apps/web/src/inngest/sequence-draft-router.ts` (commit `f511f79`, S1.3)
- Send worker LinkedIn avec limits/warmup/send window — `linkedin-send-worker.ts` (commit `05a45fd`, S1.4)
- Send worker email — `email-send-worker.ts`
- Reply handlers — `reply-handler.ts`, `reply-agent.ts` (stop-on-reply partiel, S2 en cours côté LinkedIn)
- Signal infra — `signal-monitor.ts`, `realtime-signal-handler.ts`, `signal-to-sequence.ts`, `signal-to-deal-alert.ts`, `deal-signal-sync.ts`, `signal-url-cache-evict.ts`
- Cadence cron — `sequence-cron.ts`, `sequence-draft-expiry.ts`, `sequence-draft-rejection-learner.ts`
- 64 fonctions Inngest au total

### 0.3 LinkedIn (Unipile) — S1.1 → S1.6 mergés
- S1.1 schéma + migration — commit `aff4f9f`
- S1.2 client + connect/callback/disconnect/webhook — `6cbb21b`, `lib/linkedin/unipile-client.ts`
- S1.3 dispatcher multi-canal + invite personalizer — `f511f79`
- S1.4 send worker + daily reset + warmup + limits — `05a45fd`
- S1.5 settings page + sidebar + brand icon — `0c340a3`
- S1.6 template Founder classic 4-touche — `f2e4087`
- S2 (reply unifié, inbox unifiée) — en cours, hors v2

### 0.4 Approbation outbound
- Queue per-draft — `/api/sequences/drafts/route.ts`, `/[id]/approve`, `/[id]/reject`, `/[id]/edit`, `/[id]/context`
- UI globale — `app/apps/web/src/app/(dashboard)/sequences/review/page.tsx`
- État `pending_approval → approved/rejected/sent` avec optimistic lock (`version` col)
- **Édition inline shippée** (`/edit` route + hook `use-inline-edit`)
- **Batch approve manquant** (vrai gap, cf B5)

### 0.5 Intégrations wired
- Apollo — `lib/apollo-client.ts`, `register-defaults.ts`
- Unipile — `lib/linkedin/unipile-client.ts`
- Anthropic + OpenAI fallback — `ai-provider.ts` (`@ai-sdk/anthropic@3.0.64`, region EU)
- Recall.ai — `inngest/recall-functions.ts` (meeting recording)
- Resend + EmailEngine + warmup natif — mature
- Inngest 4.1, Upstash Redis rate-limit, Neon Postgres

### 0.6 Branche `feat/voice-cold-call`
- Spec rédigée — `_specs/voice-cold-call/`
- Stack : Twilio Programmable Voice + Voice SDK JS, Deepgram Nova-3 streaming
- Handler `phone_task` non encore branché dans le dispatcher (gap C1)

---

## 1. Décisions actées (6 + 1)

Décisions verrouillées avant toute écriture de code. Ne pas rouvrir sans rétrospective explicite.

| # | Domaine | Décision | Rationale |
|---|---|---|---|
| **D1** | Enrichissement portable | Waterfall **Apollo → Kaspr (FR) → Lusha (US/UK)**. FullEnrich abandonné. | Locké 2026-05-19, mémoire `voice-cold-call`. Kaspr 55 % mobile FR. Cognism skippé. |
| **D2** | Cold call | **Twilio Programmable Voice + Deepgram Nova-3** intégrés ; dialer = Elevay. Orum/Nooks abandonnés. | "Automate every cold caller task except the actual conversation" — branche `feat/voice-cold-call` en cours. |
| **D3** | LinkedIn | **Unipile** (HQ Paris, EU). Sales Nav direct abandonné. | 6 sprints mergés (S1.1→S1.6). $59/mois/compte. Compatible sovereignty pack. |
| **D4** | Email warmup | **Resend + EmailEngine + warmup natif**. Instantly abandonné. | Stack natif mature ; client Instantly = skeleton non appelé. Pas de $300/mois pour dupliquer. |
| **D5** | Wedge | **Pilae = tenant FR/CH dogfood scopé**. Elevay produit = **US-first par défaut**. Pas de contradiction : multi-tenant déjà par construction. | Mémoire `elevay-gtm-philosophy.md` : France différée 12-18 mois. Pilae est un cas spécial assumé. |
| **D6** | Cadence | **Chronos par défaut + accélérateur kairos**. Les cadences sont rédigées chronos (J1→J10) ; un signal frais à poids élevé bumpe `nextStepAt` à `NOW()`. | Sauve la cohérence du philo doc sans bloquer le ship. L'accélérateur tombe gratuit du gap #3. |
| **D7** | Propale / LOI / e-sign | **Hors scope v2**. Track séparé `_specs/pilae-internal-tooling/`. | ~3-4 sem. de dev orthogonal au moteur outbound. Ne bloque pas Pilae operations. |

**Garde-fou anti-creep (D5)** : aucun `if (tenant.name === 'Pilae')` dans le code. Toute logique locale lit `tenant.locale` (US-en / FR-fr / FR-ch). Templates FR vivent dans le tenant config store, pas dans `lib/ai/`.

---

## 2. PHASE 1 — REQUIREMENTS (EARS)

> Tags : `[DONE]` = shippé, ne pas re-spécifier · `[LOCKED]` = décision §1, ne pas rouvrir · `[CFG]` = config tenant pure · `[NEW]` = vrai gap à coder · `[HORS SCOPE]` = track séparé

### R1 — Modèle de données
- **R1.1** `[DONE]` Multi-tenant `tenantId`-scopé sur toutes les entités outbound. `app/apps/web/src/db/schema/core.ts`.
- **R1.2** `[CFG]` Stocker l'ICP Pilae : 4 verticales (SaaS/tech, fintech, santé, agence), géo (Suisse romande → France), personas (décideur CTO/Head of Platform, influenceur DevOps/SRE, bloqueurs RSSI/DAF), anti-ICP — dans `tenants.config_jsonb` ou table dédiée si plus propre.
- **R1.3** `[NEW]` Tables manquantes : `playbook_entries`, deal split (`projectAmount` + `platformArr`), `companies.excludedReason` (anti-ICP flag). `call_tasks` **n'est pas une nouvelle table** — un `phone_task` step matérialisé par `sequenceDrafts.channel='phone_task'` suffit. `cohorts` **n'est pas une nouvelle table** — une cohorte = saved filter sur `companies` + enrollment.

### R2 — TAM & sourcing (Apollo)
- **R2.1** `[DONE]` Apollo wired pour TAM/firmographie — `lib/apollo-client.ts`.
- **R2.2** `[CFG]` Maintenir une named list active 250-400 comptes par verticale, dédupliquée, scopée tenant Pilae.
- **R2.3** `[NEW]` IF un compte matche l'anti-ICP, THEN flagguer `companies.excludedReason` et exclure de l'enrollment.

### R3 — Enrichissement (waterfall locké)
- **R3.1** `[LOCKED]` Waterfall Apollo → Kaspr → Lusha implémenté côté `feat/voice-cold-call` (`lib/voice/number-waterfall.ts`). Cache pour éviter re-billing.
- **R3.2** `[LOCKED]` Seuil de confiance sur le portable avant utilisation ; sous le seuil, contact routé email + LinkedIn uniquement.
- **R3.3** `[CFG]` Le tenant Pilae paie Kaspr (FR coverage prioritaire) ; Lusha activée si verticale touche US/UK.

### R4 — Scoring de signaux
- **R4.1** `[DONE]` Ingestion via `customSignals` + handlers (`signal-monitor`, `realtime-signal-handler`, `signal-to-sequence`). Étendre la taxonomie pour Pilae : levée Apollo, jobs SRE/platform, mentions NIS2/DORA/HDS, renouvellements SaaS, incidents publics.
- **R4.2** `[NEW]` THE SYSTEM SHALL calculer `priority_score = signal_weight × fit_icp × accessibility` par compte, cron Inngest daily 06:00 UTC, persister dans `companies.priorityScore` + `companies.priorityScoreComputedAt`.
- **R4.3** `[NEW]` **Accélérateur kairos** : WHEN un signal frais (≤ 24h) à poids élevé fire sur un `sequenceEnrollments.contactId` actif, THE SYSTEM SHALL bump `sequenceEnrollments.nextStepAt = NOW()`. Inngest fn `signal.accelerate.cadence`.

### R5 — Cohortes & cadences multicanales
- **R5.1** `[CFG]` Cohortes = saved filters sur `companies` + enrollment dans une `sequence`. Pas de nouvelle table.
- **R5.2** `[DONE]` Cadence engine via `sequence-draft-router.ts` + send workers email/LinkedIn. `phone_task` à brancher (cf C1).
- **R5.3** `[NEW]` Générateur email/DM **i18n via `tenant.locale`** : US-en (50-80 mots, "Hey [Name]", soft+hard CTA), FR-fr (80-120 mots, formel, soft CTA, footer CNIL), FR-ch (variante helvète si signal différent). Branche dans `ai-provider.ts`, aucun hardcode FR.
- **R5.4** `[LOCKED]` Délivrabilité via Resend + EmailEngine + warmup natif + domaines secondaires. Pas d'Instantly.
- **R5.5** `[DONE]` `touch.stop-on-reply` côté email (mature) ; côté LinkedIn S2 en cours.
- **R5.6** `[NEW]` `nurture.recycle.d30` — Inngest cron daily qui ré-enrolle les `sequenceEnrollments.status='completed'` sans réponse depuis 30 jours dans la séquence nurture.

### R6 — Cold call
- **R6.1** `[NEW]` Call queue quotidienne dérivée du `priority_score` + filter `sequenceDrafts.channel='phone_task' AND status='pending_approval'`. Vue dédiée `/cold-call/queue`. Affiche contexte compte, signal déclencheur, script d'ouverture/objections (généré par `ai-provider.ts` au moment du draft).
- **R6.2** `[LOCKED]` Dial intégré via Twilio Voice SDK, transcription Deepgram. Cf. `_specs/voice-cold-call/`.
- **R6.3** `[CFG]` Issue d'appel + notes loggées dans `activities` (déjà supporté) ; auto-progression `Sourcé → Contacté` si appel décroché.
- **R6.4** `[DONE]` Meetings transcrits via Recall.ai. Extraction qualification = prompt Claude existant à étendre pour les champs Pilae (R8.2).

### R7 — Approbation outbound
- **R7.1** `[DONE]` Approval queue per-draft — `/sequences/review`.
- **R7.2** `[DONE]` State machine + optimistic lock.
- **R7.3** `[DONE]` Édition inline — route `/api/sequences/drafts/[id]/edit`.
- **R7.4** `[NEW]` **Batch approve** — multi-select sur `/sequences/review`, endpoint `POST /api/sequences/drafts/bulk-approve` (body `{ ids: string[], scheduledSendAt?: string }`), transaction atomique avec rollback si une draft échoue le state check.

### R8 — Pipeline & qualification
- **R8.1** `[CFG]` Stages = `lead/qualified/proposal/negotiation/won/lost` (enum existant). Mapping Pilae : `Sourcé/Contacté/Conversation/Qualifié/Deep-dive/Propale/LOI/Activation` → soit on étend l'enum, soit on stocke le label custom dans `deals.customStage`. **Décision : étendre l'enum** pour préserver les requêtes typées.
- **R8.2** `[CFG]` Champs qualification BANT (à confirmer méthodo) : stack, coût annuel actuel, douleur, déclencheur daté, décideur identifié, priorité. Stockés dans `deals.qualificationJsonb`.
- **R8.3** `[NEW]` Gate `Qualifié → Deep-dive` : la transition exige `douleur ≠ null AND déclencheur_daté ≠ null AND décideur_accessible = true`. Implémenté côté `lib/deals/transition.ts`.
- **R8.4** `[NEW]` **Deal split** : ALTER deals ADD COLUMN `project_amount numeric`, ADD COLUMN `platform_arr numeric`. `deals.value` devient computed (`project_amount + platform_arr`) ou déprécié au profit de la somme côté UI. Jamais blendés dans le reporting.
- **R8.5** `[DONE]` Sync CRM via Gmail/Calendar auto-CRM existant.

### R9 — Deep-dive (capacité Paul)
- **R9.1** `[NEW]` Capacity rule : `tenants.config.deepDiveWeeklyCap = 2` (configurable). Tâche Inngest hebdo qui compte les meetings `type='deep_dive'` sur la semaine en cours et expose `deepDiveLoad` dans le dashboard.
- **R9.2** `[NEW]` Badge goulot sur dashboard : WHEN `deepDiveLoad ≥ cap`, afficher état "goulot Paul saturé" + bouton "voir la file en attente".

### R10 — Propale / LOI
- `[HORS SCOPE]` Track séparé `_specs/pilae-internal-tooling/`. Estimation indicative : 3-4 sem. Ne bloque pas la v2.

### R11 — Mesure & boucle d'apprentissage
- **R11.1** `[NEW]` Dashboard Pilae : funnel par stage, bookings vs cible 1 M€ (label strict "bookings", jamais "ARR"), métriques par canal (email/LinkedIn/phone), charge deep-dive Paul, backlog comptes non-touchés.
- **R11.2** `[NEW]` `playbook_entries` capturés après chaque échange (call, meeting, reply) : `type IN ('objection','accroche','question')`, `content text`, `outcome_label text`, `perf_score numeric`. Inngest handler sur événement `call.logged` ou `meeting.completed`.
- **R11.3** `[CFG]` Label "bookings" sur tout reporting Pilae. Un test snapshot bloque l'apparition du mot "ARR" dans le dashboard Pilae.

---

## 3. PHASE 2 — DESIGN

### 3.1 Architecture (diff vs existant)

```
                         ┌─────────────────────────────────────────────┐
                         │  Elevay (multi-tenant) — tenant: Pilae       │
                         │  Locale: FR-fr / FR-ch (D5 wedge isolation)  │
                         └─────────────────────────────────────────────┘

   [DONE] Apollo (TAM) ──► [DONE] customSignals + handlers
                                    │
                                    ▼
                          [NEW B3] signal.score.daily (cron 06:00 UTC)
                                    │
                                    ▼
                          [DONE] sequenceEnrollments  ◄─── [NEW B3] signal.accelerate.cadence
                                    │                          (bump nextStepAt si signal frais)
                                    ▼
                          [DONE] sequence-draft-router (S1.3)
                          │           │            │
                          ▼           ▼            ▼
                     [DONE]       [DONE]       [PENDING C1]
                     email-       linkedin-    phone_task-
                     send-worker  send-worker  send-worker
                     (Resend +    (Unipile)    (Twilio +
                     EmailEngine                Deepgram —
                     warmup)                    feat/voice-cold-call)
                          │           │            │
                          └───────────┴────────────┘
                                    │
                                    ▼
                     [DONE] /sequences/review (per-draft approve/reject/edit)
                                    +
                     [NEW B5] bulk-approve
                                    │
                                    ▼
                     [DONE] activities + [NEW B4] playbook_entries (post-call capture)
                                    │
                                    ▼
                     [DONE] deals  ─►  [NEW B2] deal split (projectAmount | platformArr)
                                    │
                                    ▼
                     [NEW B7] meeting capacity rule (Paul deep-dive cap)
                                    │
                                    ▼
                     [NEW D1] dashboard Pilae (funnel + bookings + canal + Paul)
                                    │
                                    ▼
                     [NEW B6] nurture.recycle.d30 (cron daily)
```

### 3.2 Modèle de données (diff Drizzle à produire)

Une seule migration consolidée recommandée pour réduire le bruit :

```sql
-- B1 anti-ICP
ALTER TABLE companies ADD COLUMN excluded_reason text;
ALTER TABLE companies ADD COLUMN excluded_at timestamptz;
CREATE INDEX idx_companies_excluded ON companies(tenant_id) WHERE excluded_reason IS NULL;

-- B2 deal split
ALTER TABLE deals ADD COLUMN project_amount numeric(12,2);
ALTER TABLE deals ADD COLUMN platform_arr numeric(12,2);
-- deals.value reste pour compat, computed côté UI = project_amount + platform_arr

-- R8.1 stages Pilae
ALTER TYPE deal_stage_enum ADD VALUE 'sourced' BEFORE 'lead';
ALTER TYPE deal_stage_enum ADD VALUE 'contacted' AFTER 'sourced';
ALTER TYPE deal_stage_enum ADD VALUE 'conversation' AFTER 'contacted';
-- (qualified existe déjà)
ALTER TYPE deal_stage_enum ADD VALUE 'deep_dive' AFTER 'qualified';
ALTER TYPE deal_stage_enum ADD VALUE 'proposal' AFTER 'deep_dive'; -- existe déjà sous forme 'proposal'
ALTER TYPE deal_stage_enum ADD VALUE 'loi' AFTER 'proposal';
ALTER TYPE deal_stage_enum ADD VALUE 'activation' AFTER 'loi';

-- R8.2 champs qualif
ALTER TABLE deals ADD COLUMN qualification_jsonb jsonb DEFAULT '{}'::jsonb;

-- B3 priority score
ALTER TABLE companies ADD COLUMN priority_score numeric(5,2);
ALTER TABLE companies ADD COLUMN priority_score_computed_at timestamptz;
CREATE INDEX idx_companies_priority ON companies(tenant_id, priority_score DESC NULLS LAST);

-- B4 playbook
CREATE TABLE playbook_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('objection','accroche','question')),
  content text NOT NULL,
  source_activity_id uuid REFERENCES activities(id),
  outcome_label text,
  perf_score numeric(4,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_playbook_tenant_type ON playbook_entries(tenant_id, type);

-- B7 capacity tracking
ALTER TABLE tenants ADD COLUMN config_jsonb jsonb DEFAULT '{}'::jsonb;
-- deepDiveWeeklyCap stocké dans config_jsonb, pas de nouvelle table
```

### 3.3 Orchestration Inngest — nouvelles fonctions

| Fonction | Trigger | Job |
|---|---|---|
| `signal.score.daily` | cron `0 6 * * *` UTC | recompute `companies.priorityScore` |
| `signal.accelerate.cadence` | event `signal.fresh` (poids ≥ seuil) | bump `sequenceEnrollments.nextStepAt = NOW()` |
| `nurture.recycle.d30` | cron `0 7 * * *` UTC | ré-enrolle complétés sans réponse > 30j |
| `playbook.capture.post_call` | event `call.logged` / `meeting.completed` | extraction LLM puis insert `playbook_entries` |
| `meeting.capacity.check` | cron `0 0 * * 1` UTC | compute `deepDiveLoad` semaine, push état dashboard |

### 3.4 Couche IA

- Réutiliser `ai-provider.ts` (Claude + OpenAI fallback, EU region).
- Templates outbound branchés sur `tenant.locale` via un `messageTemplateStore` scopé tenant. Aucun string FR/EN hardcodé dans `lib/ai/`.
- Tests : un tenant `locale='en-US'` produit 0 mot français (test snapshot avec dictionnaire FR-flag).

### 3.5 Intégrations (verrouillées §1)

| Service | Statut | Usage Pilae |
|---|---|---|
| Apollo | wired | TAM verticales |
| Kaspr | wired voice-cold-call | portables FR |
| Lusha | wired voice-cold-call | portables US/UK (rare pour Pilae) |
| Unipile | wired S1.2 | LinkedIn invite + message |
| Twilio + Deepgram | feat/voice-cold-call | dialer intégré + transcription |
| Resend + EmailEngine | wired | email + warmup natif |
| Recall.ai | wired | meetings transcription |
| Anthropic + OpenAI | wired EU region | génération + extraction |

### 3.6 Garde-fous (consolidés)

1. **Approval queue per-draft + batch (R7)** — vitesse via bulk-approve, sécurité via inline edit.
2. **Anti-tenant-creep (D5)** — `tenant.locale` partout, aucun hardcode "Pilae" dans le code.
3. **Qualité avant volume** — seuil `Kaspr.confidence` avant utilisation portable (locké voice-cold-call).
4. **Délivrabilité** — domaines secondaires + warmup natif EmailEngine (R5.4).
5. **Deal split inviolable** — `projectAmount` et `platformArr` jamais sommés implicitement dans le reporting brut (R8.4).
6. **Bookings ≠ ARR** — test snapshot bloque "ARR" dans le dashboard Pilae (R11.3).
7. **Capacity Paul** — meeting type `deep_dive` ne peut pas être booké au-delà du cap sans override explicite (R9).
8. **Kairos accélérateur** — `signal.accelerate.cadence` documenté + testé pour préserver le philo doc (D6).

---

## 4. PHASE 3 — TASKS (≈ 10 dev-days)

Convention Claude Code : lire le code existant avant d'écrire, étendre les modèles Drizzle existants (ne pas dupliquer), réutiliser composants UI + patterns API, scoper par `tenantId`. Branche unique `feat/pilae-machine`.

### Bloc A — Config tenant Pilae (2 jours, pure config)

- [ ] **A1** `[CFG]` Créer le tenant Pilae : `INSERT INTO tenants (name, locale, config_jsonb)` avec `locale='fr-fr'` (ou `fr-ch` si tu préfères), `config.deepDiveWeeklyCap=2`. _(D5, R9.1)_
- [ ] **A2** `[CFG]` Seed ICP dans `tenants.config_jsonb` : 4 verticales, personas, anti-ICP list, signal taxonomy étendue (NIS2/DORA/HDS). Page admin de config — étendre Settings existante. _(R1.2)_
- [ ] **A3** `[CFG]` Connecter mailbox Pilae (EmailEngine) + compte Unipile (Hosted Auth flow existant). _(D3, D4)_
- [ ] **A4** `[CFG]` Première liste TAM Apollo par verticale + dédup + anti-ICP exclude (utilise B1). 250-400 comptes max. _(R2.2)_
- [ ] **A5** `[CFG]` Créer première séquence Founder classic FR-fr (variante locale, pas de hardcode) + enroller cohorte 1. _(R5.3)_

### Bloc B — 7 gaps produit (6-7 jours)

- [ ] **B1** `[NEW]` **Anti-ICP** (0.5j) — _(R2.3, R3.3)_
  - Migration : `companies.excluded_reason`, `excluded_at`, partial index
  - Check dans le TAM builder : si match anti-ICP, set `excludedReason`, ne pas enroller
  - Test : enroll skip si `excluded_reason IS NOT NULL`

- [ ] **B2** `[NEW]` **Deal split** (0.5j) — _(R8.4)_
  - Migration : `deals.project_amount`, `deals.platform_arr`
  - UI deal detail : deux champs distincts, somme calculée affichée
  - Reporting : table dédiée projet vs plateforme, jamais somme implicite
  - Test snapshot : le dashboard montre 2 lignes séparées

- [ ] **B3** `[NEW]` **Signal scoring + accélérateur kairos** (1.5j) — _(R4.2, R4.3, D6)_
  - Inngest `signal.score.daily` : `signal_weight × fit_icp × accessibility`, persiste sur `companies.priority_score`
  - Inngest `signal.accelerate.cadence` : event handler qui bumpe `sequenceEnrollments.nextStepAt = NOW()` si signal frais ≤ 24h et poids ≥ seuil
  - Tests : score recompute + bump enrollment + idempotence

- [ ] **B4** `[NEW]` **Playbook entries** (1.5j) — _(R11.2)_
  - Migration : table `playbook_entries`
  - UI : page `/playbook` avec liste filtrée par type, perf trié
  - Inngest `playbook.capture.post_call` : extraction LLM sur transcript Recall.ai ou note d'appel
  - Test : capture déclenchée sur `call.logged`, insert OK, dédup sur content similaire

- [ ] **B5** `[NEW]` **Batch approve** (1j) — _(R7.4)_
  - Endpoint `POST /api/sequences/drafts/bulk-approve` (body `{ ids: string[], scheduledSendAt?: string }`)
  - Transaction atomique avec rollback si un state check échoue
  - UI : checkbox multi-select sur `/sequences/review` + bouton "Approve N selected"
  - Test : 10 drafts approuvés en batch, 1 en mauvais état → rollback complet

- [ ] **B6** `[NEW]` **Nurture recycle J+30** (0.5j) — _(R5.6)_
  - Inngest cron `0 7 * * *` UTC qui ré-enrolle dans la séquence "nurture" tous les `sequenceEnrollments.status='completed'` sans `replied=true` depuis 30j
  - Test : enrollement complété il y a 31j → ré-enrolé ; sans réponse → ré-enrolé ; avec réponse → skip

- [ ] **B7** `[NEW]` **Capacity rule Paul** (1j) — _(R9.1, R9.2)_
  - Inngest hebdo qui count meetings `type='deep_dive'` sur semaine en cours
  - Expose `deepDiveLoad` dans le tenant context
  - Badge dashboard : "goulot Paul saturé" si load ≥ cap
  - Calendar booking check : si load ≥ cap, retourne 409 avec message "deep-dive cap atteint, override possible"
  - Test : 2 deep-dives bookés cette semaine → 3ᵉ refusé sauf override

### Bloc C — Branchement voice (1 jour, dépend `feat/voice-cold-call` merge)

- [ ] **C1** `[PENDING]` Brancher `phone_task` handler dans `sequence-draft-router.ts` (route vers le worker Twilio) + alimenter call queue depuis `priority_score` filtré sur `sequenceDrafts.channel='phone_task' AND status='pending_approval'`. _(R6.1, R6.2)_
- [ ] **C2** Si `feat/voice-cold-call` non mergée à T+10j : mock le worker en `console.log + status='sent'` pour ne pas bloquer le DoD logiciel. Réactiver au merge.

### Bloc D — Dashboard Pilae (1 jour)

- [ ] **D1** `[NEW]` Page `/dashboard/pilae` (ou onglet tenant) : funnel par stage, bookings vs 1 M€ (deux barres : projet + plateforme), métriques par canal (touches, replies, meetings), charge deep-dive Paul (avec badge goulot), backlog comptes non-touchés. _(R11.1)_
- [ ] **D2** Test snapshot : le mot "ARR" n'apparaît jamais. _(R11.3)_

---

## 5. Definition of Done (logiciel)

DoD logiciel ≠ OKR commercial. Cocher logiciel ; suivre OKR séparément (§6).

- [ ] Tenant Pilae configuré (Bloc A) : `tenants` row + ICP + mailbox + Unipile + TAM seedé + première séquence enrolled
- [ ] 7 PRs mergées (B1 → B7) avec tests verts
- [ ] Migration consolidée appliquée sur prod (deal split, anti-ICP, priority score, playbook, qualif jsonb, stages enum, config jsonb)
- [ ] 5 nouvelles fonctions Inngest enregistrées et observées 24h sans erreur (`signal.score.daily`, `signal.accelerate.cadence`, `nurture.recycle.d30`, `playbook.capture.post_call`, `meeting.capacity.check`)
- [ ] Dashboard Pilae visible avec données réelles (au moins funnel + bookings + capacity Paul)
- [ ] Endpoint `bulk-approve` testé end-to-end sur 10+ drafts
- [ ] `phone_task` handler branché OU mocké explicitement (C2) selon état `feat/voice-cold-call`
- [ ] `regression.sh` clean
- [ ] Test anti-creep : aucun match de `/Pilae|pilae/` dans `lib/ai/` ou `lib/sequences/` (lecture via `tenant.locale` uniquement)
- [ ] Test anti-ARR : snapshot dashboard Pilae sans le mot "ARR"

---

## 6. OKR commercial (HORS spec produit)

- Suivi dans `_reports/pilae-okr.md`, jamais cité dans le DoD logiciel
- Cible : 1 M€ pipeline signé (bookings) en 90 jours
- Cible secondaire : 60 deep-dives bookés Paul sur la période (capacité limitante D6)
- Cible tertiaire : conversion par stage trackée pour identifier le goulot réel
- Cadence de revue : hebdomadaire, Martin

---

## 7. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Tenant-creep (Pilae pollue le wedge US) | Garde-fou D5 + test anti-creep dans le DoD |
| Chronos lock-in (cadences fixes deviennent la norme) | Accélérateur kairos B3 livré dès Phase 1, documenté + testé |
| `feat/voice-cold-call` retardée | Mock C2 pour ne pas bloquer le ship |
| Sur-spec scope (la propale revient en cours de route) | D7 acté noir sur blanc ; track séparé |
| Perso générée à côté | Approbation + édition inline (déjà shippé) |
| Domaine principal cramé | Domaines secondaires + warmup natif (R5.4) |
| Séquence qui continue après réponse | stop-on-reply (déjà shippé email ; LinkedIn S2) |
| Confusion bookings/ARR dans reporting | Test snapshot anti-ARR (DoD) |
| Deep-dives qui saturent Paul | Cap configurable + badge goulot + 409 sur booking (B7) |
| Régression sur multi-tenancy | Tests existants + lecture systématique de `tenantId` dans les nouvelles requêtes |

---

## 8. Annexe — Pourquoi cette v2 est plus petite

| Bloc original (v1) | Statut v2 | Raison |
|---|---|---|
| Bloc A "fondations data" (3 tâches) | Réduit à 0.5j de migration consolidée (B1+B2+B3+B4 migrations) | 6/9 entités existaient déjà |
| Bloc B "sourcing + enrichissement" (3 tâches) | Réduit à `[CFG]` config tenant | Apollo wired, waterfall locké voice-cold-call |
| Bloc C "scoring" (2 tâches) | B3 (1.5j) | Cron + accélérateur kairos en un PR |
| Bloc D "cadence" (5 tâches) | 0 nouvelle tâche | Tout shippé en S1.1→S1.6 + Resend natif |
| Bloc E "cold call" (3 tâches) | C1 (1j, dépend voice-cold-call) | Stack lockée ailleurs |
| Bloc F "approbation" (1 tâche) | B5 (1j, batch uniquement) | Per-draft + inline edit déjà shippés |
| Bloc G "pipeline + propale + LOI" (5 tâches) | B2 + R8.3 (gate qualif) ; propale/LOI hors scope D7 | Track séparé pour propale |
| Bloc H "mesure" (3 tâches) | B4 + D1 (2.5j) | Label "bookings" = 1 ligne dans le dashboard |

**Total v1 estimé : ~4 semaines.**
**Total v2 ancré : ~10 dev-days (2 config + 6-7 gaps + 1 voice + 1 dashboard).**

---

*Cette v2 est exécutable bloc par bloc (A → B → D, C en parallèle dès que `feat/voice-cold-call` merge). Pilae = premier tenant dogfood, scopé par construction multi-tenant. Aucun rebuild, aucune décision de stack rouverte.*
