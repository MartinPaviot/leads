# AUDIT-INPUTS.md — Elevay DD a16z

> Pre-rempli le 2026-04-27 par Claude a partir du codebase + memoires.
> Martin/Ombeline : valider chaque section, corriger ce qui est faux, completer les `A REMPLIR`.

---

## A. MODELE ECONOMIQUE

### A.1 Pricing tiers

| Tier        | ARPU mensuel cible | Limite contacts | Limite emails/mois | Limite AI queries/mois | Mailboxes | SLA      |
|-------------|--------------------|-----------------|--------------------|------------------------|-----------|----------|
| Free trial  | $0 (14 jours)     | 100             | 50                 | 100                    | 1         | —        |
| Starter     | $49/mois           | 1,000           | 500                | 500                    | 3         | Email    |
| Pro         | $99/mois           | 10,000          | 5,000              | Unlimited              | Unlimited | Priority |
| Enterprise  | A REMPLIR          | A REMPLIR       | A REMPLIR          | A REMPLIR              | A REMPLIR | A REMPLIR|

> Source : `app/apps/web/src/app/(dashboard)/pricing/page.tsx` + `lib/billing.ts`
> Stripe Price IDs configurees : STRIPE_STARTER_PRICE_ID, STRIPE_PRO_PRICE_ID

### A.2 Volumes cibles

| Horizon        | Tenants total | DAU | Runs/user/jour (moyenne) |
|----------------|---------------|-----|---------------------------|
| 3 mois         | A REMPLIR     | A REMPLIR | A REMPLIR            |
| 6 mois         | A REMPLIR     | A REMPLIR | A REMPLIR            |
| 12 mois        | A REMPLIR     | A REMPLIR | A REMPLIR            |
| 24 mois (a16z) | A REMPLIR     | A REMPLIR | A REMPLIR            |

Distribution prevue par flow demo (% du volume total) :
- TAM : A REMPLIR %
- Gmail OAuth : A REMPLIR %
- Campaigns/Sequences : A REMPLIR %
- Calls Synthesis : A REMPLIR %
- Dashboard / Chat : A REMPLIR %
- Autres / non demo : A REMPLIR %

### A.3 Marge brute IA-only cible

- Marge unitaire cible (% sur ARPU mensuel) : A REMPLIR
- Floor minimal acceptable (en dessous = unsustainable) : A REMPLIR
- Modele de cout utilise pour projection : A REMPLIR

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

```
1. A REMPLIR — quels flows seront demontres, duree, env (prod/staging)
2. ...
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

- En cours ? A REMPLIR
- Echeance prevue : A REMPLIR
- Cabinet auditeur : A REMPLIR

> Note : le code GDPR export reference SOC2 CC6.7 et ISO 27001 A.5.34 dans le logging, ce qui suggere une intention mais pas une certification.

### D.3 Politique de retention donnees

- Logs applicatifs : A REMPLIR
- Conversations agent : A REMPLIR (pas de TTL detecte dans le schema)
- Donnees client (CRM imports) : 30 jours post-cloture (claim privacy page)
- PII brutes (emails, noms) : A REMPLIR
- Embeddings derives : A REMPLIR
- Backups DB : A REMPLIR

### D.4 Regulations sectorielles

- Restrictions donnees HR (lois locales sur le profilage) : A REMPLIR
- Restrictions cold email (CAN-SPAM, GDPR e-Privacy, CASL Canada) : **Mentionnes dans Terms + AUP** — "Comply with all applicable anti-spam and data protection regulations"
- Restrictions enregistrement appels (consentement bilateral selon Etat US) : A REMPLIR — risque reel si meeting bot rejoint sans consentement explicite

---

## E. TOLERANCE AUX PANNES

| Flow       | Latence p95 max | Outage upstream max | Erreur silencieuse acceptable ? | Fallback existant ? |
|------------|-----------------|---------------------|----------------------------------|----------------------|
| TAM        | A REMPLIR       | Apollo outage       | A REMPLIR                        | A REMPLIR            |
| Gmail sync | A REMPLIR       | Google API outage   | A REMPLIR                        | A REMPLIR            |
| Campaigns  | A REMPLIR       | SMTP outage         | A REMPLIR                        | A REMPLIR            |
| Calls      | A REMPLIR       | Meeting bot outage  | A REMPLIR                        | gpt-4o-mini fallback |
| Chat       | A REMPLIR       | Anthropic outage    | A REMPLIR                        | gpt-4o-mini fallback |

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
- Chat wrapper Claude + tools basiques (query CRM) — trivial
- OAuth Gmail + sync emails — 1-2 semaines avec Composio
- UI CRM basique (contacts, accounts, deals) — 2-3 semaines avec template

Quel sous-ensemble necessite >6 mois (le moat) ?
- 139 tools integres avec routing intelligent — A REMPLIR (Martin : est-ce vraiment un moat ou juste du volume ?)
- Flywheel few-shot learning sur les reponses validees — A REMPLIR
- Meeting bot + transcription + extraction structuree + matching contacts — A REMPLIR
- Signal detection multi-source — A REMPLIR
- A REMPLIR par Martin : qu'est-ce qui est veritablement defensible ?

---

## I. CALENDRIER DD A16Z

- Date envoi data room : A REMPLIR
- Date sessions techniques avec partner : A REMPLIR
- Date sessions techniques avec engineering team a16z : A REMPLIR
- Date Q&A list recue : A REMPLIR
- Date term sheet visee : A REMPLIR
- Date diligence period (post-term-sheet) : A REMPLIR
- Date closing vise : A REMPLIR

---

## J. ASSETS PROPRIETAIRES REVENDIQUES

- Datasets proprietaires : A REMPLIR
- Signal scoring weights : A REMPLIR (detect dans `lib/chat/tools/skills.ts` mais nature exacte a confirmer)
- Taxonomie ICP proprietaire : A REMPLIR (ICP analysis multi-step chain dans le codebase)
- Embeddings fine-tunes : A REMPLIR (pas de fine-tuning detecte — semantic search utilise embeddings standard)
- Golden eval set : A REMPLIR (eval system detecte dans `/api/eval/runs/route.ts` mais taille/couverture inconnues)
- Skills proprietaires : 15 skills detectees dans `lib/chat/tools/skills.ts` (analyzePipeline, scanSignals, generateBattlecard, researchCompetitor, detectChurnRisk, analyzeSequencePerformance, findLeadsAtCompany, detectExpansionOpportunities, buildTAM, findLeadsByDomain, defineICP, prepSalesCall, qualifyLeads, qualifyInboundLead, +)
- Workflows orchestres non triviaux : build-tam (multi-strategy Apollo), post-call pipeline (transcribe -> extract -> match -> update -> followup), email sync pipeline

---

## K. EQUIPE & PROCESS

- Nombre d'inges full-time sur la couche agent : A REMPLIR (Martin = solo founder + Claude Code ?)
- Process de PR review prompts : A REMPLIR
- Eval gate present a chaque PR ? NON (pas de CI eval gate detecte)
- Canary deployment des prompts ? NON
- On-call rotation ? A REMPLIR
- Cadence postmortem post-incident : A REMPLIR
- Bus factor sur la couche agent : A REMPLIR (probablement 1 — Martin seul)

---

**STATUT : Pre-rempli. 47 champs "A REMPLIR" restants. Martin/Ombeline doivent completer avant de lancer 01-PREFLIGHT.**
