# AUDIT-INPUTS.md — Elevay DD a16z

> Pre-rempli le 2026-04-27 par Claude a partir du codebase + memoires.
> Sections marquees INCONNU = donnees non derivables du code, necessitent input fondateur.
> Sections marquees INFERE = estimation raisonnable a valider.

---

## A. MODELE ECONOMIQUE

### A.1 Pricing tiers

| Tier        | ARPU mensuel cible | Limite contacts | Limite emails/mois | Limite AI queries/mois | Mailboxes | SLA      |
|-------------|--------------------|-----------------|--------------------|------------------------|-----------|----------|
| Free trial  | $0 (14 jours)     | 100             | 50                 | 100                    | 1         | —        |
| Starter     | $49/mois           | 1,000           | 500                | 500                    | 3         | Email    |
| Pro         | $99/mois           | 10,000          | 5,000              | Unlimited              | Unlimited | Priority |
| Enterprise  | NON DEFINI (pas de Stripe Price ID) | Custom | Custom | Custom | Custom | Dedicated |

> Source : `app/apps/web/src/app/(dashboard)/pricing/page.tsx` + `lib/billing.ts`
> Stripe Price IDs configurees : STRIPE_STARTER_PRICE_ID, STRIPE_PRO_PRICE_ID

### A.2 Volumes cibles

| Horizon        | Tenants total | DAU | Runs/user/jour (moyenne) |
|----------------|---------------|-----|---------------------------|
| 3 mois         | INCONNU       | INCONNU | INCONNU              |
| 6 mois         | INCONNU       | INCONNU | INCONNU              |
| 12 mois        | INCONNU       | INCONNU | INCONNU              |
| 24 mois (a16z) | INCONNU       | INCONNU | INCONNU              |

Distribution prevue par flow demo (% du volume total) — INFERE depuis usage patterns:
- TAM : ~15% (onboarding trigger, batch)
- Gmail OAuth : ~25% (core setup flow, recurring sync every 15min)
- Campaigns/Sequences : ~20% (outbound sequences, active sending)
- Calls Synthesis : ~10% (meeting-dependent, lower frequency)
- Dashboard / Chat : ~25% (primary daily interface, 126 tools)
- Autres / non demo : ~5%

### A.3 Marge brute IA-only cible

- Marge unitaire cible (% sur ARPU mensuel) : INCONNU — fondateur doit definir
- Floor minimal acceptable (en dessous = unsustainable) : INCONNU — typiquement >60% pour SaaS AI
- Modele de cout utilise pour projection : INCONNU — aucun cost model file detecte dans le repo

### A.4 Hypotheses de cout LLM

- Modele dominant prevu : claude-sonnet-4-6 (primary), claude-haiku-4-5 (lightweight tasks : live meetings, account intelligence), gpt-4o-mini (fallback si pas de cle Anthropic)
- Tokens moyens par run par flow (si mesure) :
  - TAM : in __ / out __ (A REMPLIR — pas de telemetrie detectee)
  - Gmail sync : in __ / out __ (A REMPLIR)
  - Campaigns : in __ / out __ (A REMPLIR)
  - Calls : in __ / out __ (A REMPLIR)
  - Chat queries : in __ / out __ (A REMPLIR)
- Prompt caching active ? **NON** (aucune reference `cache_control` dans le codebase)
- Batch API utilisee pour async ? **NON** (aucune reference Batch API)

> ALERTE AUDIT : Prompt caching absent = surcout significatif sur les system prompts repetes. A chiffrer.

---

## B. CLAIMS INVENTORY

### B.1 Capacites revendiquees (landing page)

Source : `app/apps/web/src/app/(marketing)/page.tsx`

```
- CLAIM-001 : "Your CRM finds customers, joins your calls, and does the work for you" (hero headline)
- CLAIM-002 : "One click to link Gmail or Outlook. Elevay syncs your emails, calendar, and contacts — automatically." (step 1)
- CLAIM-003 : "Elevay auto-joins Google Meet, Zoom, and Teams. It records, transcribes, and extracts buying signals — budget, timeline, competitors, objections." (step 2)
- CLAIM-004 : "After each call, review the extracted data — action items, deal intel, matched contacts — and confirm with one click before it enters your CRM." (step 3 — human-in-the-loop)
- CLAIM-005 : "Natural language queries with citations." (chat feature)
- CLAIM-006 : "Define your ideal customer. Elevay searches real databases, scores every company, and builds your target account list — ready for outreach." (TAM builder)
- CLAIM-007 : "AI writes outreach from real meeting notes and email threads." (sequences/campaigns)
- CLAIM-008 : "24 hours before each call, get a full brief: who you're meeting, deal history, recent interactions, talking points, potential objections." (meeting prep)
- CLAIM-009 : Positioning vs Legacy CRMs (Salesforce, HubSpot, Attio) — "They make you fill them"
- CLAIM-010 : Positioning vs AI SDR v1 (11x, Artisan, AiSDR) — "They spam on your behalf"
- CLAIM-011 : Positioning vs Outbound Stack (Apollo + Instantly + Clay) — "Five tools, zero memory"
- CLAIM-012 : "Free to start. Set up in 3 minutes."
- CLAIM-013 : "The autonomous GTM engine for founders"
```

> A COMPLETER : claims du pitch deck, claims des sales decks si existants

### B.2 Demos prevues en sessions techniques a16z

INFERE depuis les 5 flows detectes dans le codebase:
```
1. Onboarding wizard + ICP analysis + TAM build (~5 min, prod)
2. Gmail OAuth connect + email sync + auto-contact creation (~3 min, prod)
3. Chat "ask anything" — NL query on CRM data with citations (~5 min, prod)
4. Sequence generation + personalized outbound from meeting notes (~5 min, prod)
5. Meeting join + transcription + post-call notes + follow-up (~8 min, prod or scripted recording)
```

### B.3 Failure modes connus en demo

```
- Risque connu 1 : build-tam et onboarding-narrator manquaient de l'AGENT_REGISTRY (corrige WS-0)
- Risque connu 2 : Gmail OAuth en conditions reelles — latence sync initiale
- Risque connu 3 : 12 bugs documentes dans docs/bugs/WS-0-discovered.md (5 S2, 7 S3)
- Risque connu 4 : defaultDataVisibility="team" est un placeholder non fonctionnel (BUG-WS0-002)
- Risque connu 5 : confidenceGaps panel read-only / dead UI dans l'onboarding wizard (BUG-WS0-003)
- Risque connu 6 : find-contacts hardcode les seniorities, ignore la selection user (BUG-WS0-007)
- Risque connu 7 : Calendar sync pour calls flow — pas de confirmation que ca marche en conditions reelles
- Risque connu 8 : A REMPLIR par Martin (incidents passes en demo)
```

---

## C. FLOWS DEMO — SPECIFICATION GROUND TRUTH

### C.1 Flow TAM

- Input typique : ICP textuel (persona, industrie, geo, taille) via onboarding wizard ou chat
- Output attendu : Liste de comptes scorees, enrichies Apollo, dans le CRM
- Latence acceptable (p95) : A REMPLIR
- Token budget par run : A REMPLIR (non mesure — pas de telemetrie tokens detectee)
- Criteres de succes observables : Comptes crees dans Accounts, enrichis, scores visibles
- Metriques de qualite (recall, precision, etc.) : A REMPLIR
- Edge cases qu'un user reel essaiera :
  1. ICP qui produit 0 resultat
  2. ICP qui produit 100k+ resultats
  3. ICP malformed / contradictoire
  4. Apollo timeout
  5. Apollo retourne donnees incoherentes

> Entrypoint : build-tam skill dans `lib/chat/tools/skills.ts` + observability registry `build-tam`
> 2-4 strategies Apollo generees par le LLM

### C.2 Flow Gmail/Outlook OAuth -> CRM

- Input typique : Connexion OAuth Google ou Microsoft
- Output attendu : Emails synces, contacts auto-crees, calendrier synce toutes les 15 min
- Latence acceptable (p95) : A REMPLIR
- Token budget par run : A REMPLIR
- Criteres de succes observables : Emails visibles dans le CRM, contacts matchen, calendrier peupl
- Edge cases :
  1. Compte avec 50k+ emails
  2. OAuth token expire mid-sync
  3. Emails en langue non-anglaise
  4. Shared mailbox / delegation
  5. Microsoft tenant avec restrictions admin

> Entrypoints : `sync-emails`, `calendar-sync`, `google-oauth-connected` dans observability registry

### C.3 Flow Campaigns/Sequences

- Input typique : Liste de contacts + objectif outreach (via chat ou UI sequences)
- Output attendu : Sequence 5 etapes, emails personnalises, envois planifies
- Latence acceptable (p95) : A REMPLIR
- Token budget par run : A REMPLIR
- Criteres de succes : Emails envoyes, tracking ouvertures/clics
- Edge cases :
  1. Contact sans email valide
  2. Domaine en liste noire
  3. Limite emails/mois depassee
  4. Bounce rate > 10%
  5. Sequence sur contact deja en sequence active

> Entrypoints : `generate-sequence`, `send-sequence-step`, `launch-campaign`

### C.4 Flow Calls Synthesis -> CRM -> Follow-up

- Input typique : Meeting enregistre (Google Meet / Zoom / Teams)
- Output attendu : Transcription, notes structurees, deal intel, follow-up auto
- Latence acceptable (p95) : A REMPLIR
- Token budget par run : A REMPLIR
- Criteres de succes : Notes visibles, contacts matches, deal mis a jour, follow-up draft
- Edge cases :
  1. Meeting sans participant identifie dans CRM
  2. Transcription basse qualite (accent, bruit)
  3. Meeting de 2h+ (token limits)
  4. Meeting non-sales (internal, 1on1)
  5. Multi-language meeting

> Entrypoints : `process-transcript`, `auto-meeting-prep`, `generate-meeting-prep`
> Live meetings : claude-haiku-4-5 (lightweight)

### C.5 Flow Dashboard / Chat

- Input typique : Requete langage naturel sur les donnees CRM
- Output attendu : Reponse contextuelle avec citations, action cards si applicable
- Latence acceptable (p95) : A REMPLIR
- Token budget par run : A REMPLIR
- Criteres de succes : Reponse factuelle, grounded, citations tracables
- Edge cases :
  1. Requete ambigue
  2. Requete sur donnees inexistantes
  3. Requete d'action destructive (suppression)
  4. Requete cross-tenant (securite)
  5. Requete necessitant >5 tool calls enchaines

> 139 tools exposes au modele dans `lib/chat/tools/`
> System prompt : `lib/prompts/chat-system-prompt.ts`

---

## D. COMPLIANCE & CONTRAINTES

### D.1 GDPR (cible EU obligatoire)

- Region pinning EU enforced ? **NON** — le code note "True GDPR compliance would use a proper geo-IP provider", utilise approximation TLD email
- DPA signe avec Anthropic ? A REMPLIR
- DPA signe avec AWS Bedrock ? A REMPLIR
- Sub-processors documentes ? **OUI (en termes/legal)** — DPA claimed avec tous les sub-processors dans la privacy page
- DPIA realisee ? A REMPLIR
- Politique de retention documentee ? **OUI** — "Deleted within 30 days of account closure or upon GDPR deletion request"
- Procedure de droit a l'oubli implementee ? **OUI** — `/api/gdpr/delete/route.ts` + `/api/gdpr/export/route.ts` existent, SOC2 CC6.7 logging

> ALERTE AUDIT : Region pinning absent. Approximation TLD pas suffisante pour DD a16z.

### D.2 SOC 2 / ISO 27001 / autres

- En cours ? INFERE NON — le code reference SOC2 CC6.7 et ISO 27001 A.5.34 dans le logging GDPR export (aspiration), mais aucune certification, aucun cabinet, aucun timeline detecte.
- Echeance prevue : INCONNU
- Cabinet auditeur : INCONNU

### D.3 Politique de retention donnees

- Logs applicatifs : INCONNU — depends de la config Vercel/Sentry (pas dans le code)
- Conversations agent : Pas de TTL detecte dans le schema. chatMessages et chatThreads persistent indefiniment.
- Donnees client (CRM imports) : 30 jours post-cloture (claim privacy page). Pas de cron de purge detecte dans le code.
- PII brutes (emails, noms) : Stockees en clair dans contacts, activities. Pas de chiffrement at-rest column-level.
- Embeddings derives : Persistent indefiniment dans pgvector. Pas de purge.
- Backups DB : INCONNU — depends de la config Neon (managed).

### D.4 Regulations sectorielles

- Restrictions donnees HR (lois locales sur le profilage) : INFERE RISQUE — contact scoring (contacts.score) et company scoring (companies.score) constituent du profilage automatise. Pas de mention Article 22 GDPR (droit de ne pas etre soumis a une decision automatisee) dans le code ou les pages legales.
- Restrictions cold email (CAN-SPAM, GDPR e-Privacy, CASL Canada) : Mentionnes dans Terms + AUP. Code inclut unsubscribeContact tool et warm-up compliance reference dans AUP. Mais pas de verification automatique du consentement avant envoi dans le code.
- Restrictions enregistrement appels (consentement bilateral selon Etat US) : RISQUE REEL — Recall.ai meeting bot rejoint les calls. Pas de mecanique de consentement detectee dans le code. 12 etats US exigent le consentement bipartite (CA, IL, PA, etc.).

---

## E. TOLERANCE AUX PANNES

| Flow       | Latence p95 max | Outage upstream max | Erreur silencieuse acceptable ? | Fallback existant ? |
|------------|-----------------|---------------------|----------------------------------|----------------------|
| TAM        | INCONNU (batch via Inngest, async) | Apollo API outage | NON — user attend le resultat | NON — Apollo only provider |
| Gmail sync | INCONNU (cron every 15min) | Google API outage / OAuth token expiry | OUI — sync retry au prochain cron | NON — pas de provider alternatif |
| Campaigns  | INCONNU (async via email-send-worker) | Resend/SMTP outage, mailbox limits | NON — email perdu = irreversible | NON — Resend seul provider |
| Calls      | INCONNU (depends on Recall.ai) | Recall.ai outage, meeting platform API | OUI — meeting non-record = data loss acceptable | NON — Recall.ai seul |
| Chat       | INFERE <5s p95 (streaming) | Anthropic API outage | NON — chat est le primary UX | OUI — gpt-4o-mini fallback (pickModel in action.ts:35-40) |

---

## F. ANTI-PATTERNS / RISQUES CONNUS

```
- 139 tools exposes a un seul agent dans le chat — risque de confusion/hallucination tool selection
- Aucun prompt caching — surcout potentiellement >2x vs avec caching
- Aucun batch API pour les operations async (TAM build, enrichment batch)
- 12 bugs documentes dont 5 S2 non resolus (dead UI, placeholder features, hardcoded values)
- defaultDataVisibility="team" = feature revendiquee mais non fonctionnelle
- Pas de telemetrie tokens — impossible de chiffrer le cout par run
- Region pinning EU absent malgre claims GDPR
- fullName split naif casse les noms composes (BUG-WS0-012)
- find-contacts ignore la selection utilisateur de seniorities (BUG-WS0-007)
- A REMPLIR par Martin : autres anti-patterns connus
```

---

## G. DONT-TOUCH ZONES

```
- _research/ : teardowns competiteurs, pas du code prod
- _harness/ : harness de build autonome, pas en prod
- _tools/ : outils d'automatisation (captcha, SMS), pas en prod
- _credentials/ : secrets, jamais auditer le contenu
- _calibration/ : donnees de calibration eval
- _fixtures/ : donnees de test
- fuse-analysis/ : teardown FuseAI specifique
- docs/ : documentation retroactive, pas du code prod
- A REMPLIR par Martin : autres zones legacy/experimental
```

---

## H. CONCURRENTS & BENCHMARK DEFENSIVITE

### H.1 Concurrents directs (full-stack agentique GTM)

- **Monaco.com** — Auto-built TAM, ML scoring, signal-based prioritization, AI outbound, deal coaching. Teardowns extensifs dans `_research/teardown-monaco-v3/` et `monaco-deep-dive-2026-04-20/`
- **FuseAI (tryfuse.ai)** — YC W25, chat-first, credits-unified pricing, 18 SEO vs-pages. Teardown dans `fuse-analysis/ANALYSIS.md`. Compte free actif.
- **ROX** — Teardown dans `_research/teardown-rox/`

### H.2 Concurrents zero-entry CRM / memory

- **Lightfield.app** — Zero manual data entry, auto-capture interactions, schema-less memory, NL queries 95%+ recall. Teardowns dans `_research/teardown-lightfield-v2/`
- **Attio** — 35 MCP tools, Thread Agent, Universal Context. Teardown dans `_research/teardown-attio.md`

### H.3 Stack OSS reproduisable en N jours

Quel sous-ensemble d'Elevay est reproductible en <30 jours ?
- Chat wrapper Claude + tools basiques (query CRM) — trivial (~3 jours)
- OAuth Gmail + sync emails — 1-2 semaines (googleapis + NextAuth)
- UI CRM basique (contacts, accounts, deals) — 2-3 semaines
- Basic sequence/campaign sending — 1 semaine (Resend + cron)

Quel sous-ensemble necessite >6 mois (le moat) ?
- 126 tools avec capability resolver + surface gating + trust score — 2-3 mois minimum pour la couverture et le gating
- Flywheel few-shot learning (agentFewShotExamples + curateFewShotExamples) — 1+ mois d'implementation + mois de donnees accumulees
- Eval framework complet (13 grader types + agent registry + observability) — 2+ mois
- Bi-temporal knowledge graph (contextGraphNodes/Edges) — 1-2 mois
- Meeting bot integration + post-call pipeline (Recall -> transcribe -> extract -> match -> followup) — 2-3 mois
- 29 skill handlers (enrichment, intelligence, outreach) — 2+ mois
- Trust score + approval mode + audit trail (toolCallEvents with snapshots + undo) — 1-2 mois

INFERE : Le moat n'est pas un single feature mais l'integration depth. Reproduire chaque piece est faisable; reproduire l'ensemble integre avec les feedback loops (flywheel, trust, evals) necessite 6-12 mois. Le vrai moat potentiel = donnees accumulees (few-shot examples, trust scores, signal outcomes) qui s'ameliorent avec l'usage.

---

## I. CALENDRIER DD A16Z

- Date envoi data room : INCONNU
- Date sessions techniques avec partner : INCONNU
- Date sessions techniques avec engineering team a16z : INCONNU
- Date Q&A list recue : INCONNU
- Date term sheet visee : INCONNU
- Date diligence period (post-term-sheet) : INCONNU
- Date closing vise : INCONNU

> NOTE AUDIT : Sans calendrier, les priorites de remediation sont definies par severite pure (P0/P1) plutot que par deadline.

---

## J. ASSETS PROPRIETAIRES REVENDIQUES

- Datasets proprietaires : AUCUN detecte. Pas de fine-tuning dataset. Few-shot examples accumules dans agentFewShotExamples (auto-generated from validated responses).
- Signal scoring weights : signalOutcomes table + lift multipliers. Weights derivees des outcomes (won/lost par signal type). Pas de ML model custom — scoring heuristique + LLM.
- Taxonomie ICP proprietaire : ICP analysis multi-step chain (extract intelligence -> infer ICP with extended thinking). Pas de taxonomie figee — generation LLM par workspace.
- Embeddings fine-tunes : AUCUN. Semantic search utilise embeddings OpenAI standard via pgvector.
- Golden eval set : evalDatasets + evalCases tables. 13 grader types (pattern_match, forbidden_pattern, tool_used, tool_sequence, json_schema, field_accuracy, classification, llm_judge, faithfulness, contains_all, word_count, latency_check, cost_check). Taille du dataset en DB inconnue sans acces.
- Skills proprietaires : 29 skill handlers dans src/skills/ (enrichment/4, intelligence/10, outreach/+). 26 tools skills exposes au chat.
- Workflows orchestres non triviaux : (1) prepareCampaign 5-step Inngest (select->enrich->discover->score->finalize), (2) post-call pipeline (Recall->transcribe->extract->match->update->followup), (3) email sync pipeline (cron 15min->fetch->analyze sentiment->create activities->auto-create contacts), (4) coaching engine (inngest/coaching-engine.ts), (5) autonomous pipeline (inngest/autonomous-pipeline.ts), (6) deal progression (cron 9am+9pm)

---

## K. EQUIPE & PROCESS

- Nombre d'inges full-time sur la couche agent : 1 (Martin, solo founder-engineer, avec Claude Code comme co-pilot — 533 commits en 6 mois, 20.5/semaine)
- Process de PR review prompts : INFERE — pas de process formel detecte. Pas de CONTRIBUTING.md, pas de PR template. Martin est seul reviewer.
- Eval gate present a chaque PR ? NON — evals existent (13 grader types) mais ne bloquent pas le merge
- Canary deployment des prompts ? NON — deploy direct a 100% via Vercel auto-deploy
- On-call rotation ? NON — solo founder, pas de rotation possible
- Cadence postmortem post-incident : NON — zero fichier postmortem ou incident dans le repo
- Bus factor sur la couche agent : 1 — Martin seul. Risque existentiel pour un investisseur.

---

**STATUT : Complete au maximum derivable du code. 12 champs INCONNU restants (volumes cibles, marges, DPA, calendrier DD) — donnees purement business non derivables du codebase. L'audit peut proceder avec ces lacunes en notant les analyses economiques comme LIMITEES.**
