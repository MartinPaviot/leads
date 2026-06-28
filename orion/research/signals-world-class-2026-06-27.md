# Signaux Elevay — vers un systeme world-class

## 0. Resume executif

L'attribution outcome→multiplier (Bayesian smoothing, clamp [0.5,2.5], k≥10) est la piece la mieux construite du systeme (`lib/scoring/signal-outcomes.ts:122-197`), et la formule `priority_score = signal × fit × accessibility` est saine (`lib/scoring/priority-score.ts:47-50`). Cinq detecteurs TAM-stream tournent en live (`lib/tam-stream/signals/index.ts:10-16`) et plusieurs crons signaux sont actifs. **Le defaut #1 est prouve et coute du classement revenue aujourd'hui** : trois chemins de code emploient trois taxonomies de types incompatibles, si bien que le scorer quotidien fait `multipliers["funding_recent"]` alors que les multipliers sont indexes `funding` → lookup `undefined` → tout retombe au plancher neutre 1.0× (`inngest/signal-score-daily.ts:76-90` vs `lib/scoring/signal-detectors.ts:16-22` vs `inngest/signal-monitor.ts:179-217`). Le moteur d'attribution est silencieusement court-circuite. S'ajoutent : pas de table `signals` normalisee (tout en JSONB `companies.properties`, triple source de verite qui derive), deux tables TTL divergentes, decay binaire, et detecteurs `tech_stack_change`/`leadership_change` lus mais jamais ecrits.

Le pari hackathon : un **Compound Signal Agent** a la demande sur une company froide, qui fan-out en parallele les sources gratuites/deja branchees (ATS publics, GitHub, Apollo job-postings, tech-detect, Crunchbase), streame chaque preuve avec citation HEAD-verifiee, puis synthetise en un seul appel Sonnet un "why-now" source + draft d'opener. Il incarne la these que tout le marche valide — le moat est la couche de jugement, pas la donnee — reutilise quasi tout l'existant, et boucle jusqu'a l'action.

---

## 1. Etat actuel — cartographie complete

### 1.1 Detection

Deux registres distincts, deux semantiques.

**Registre 1 — TAM-stream LIVE (calcul temps reel pendant le build).** `DEFAULT_SIGNALS` a `lib/tam-stream/signals/index.ts:10-16` :

| Cle | Detecteur | Source | Cout |
|---|---|---|---|
| `investor_overlap` | `investor-overlap.ts:30-101` | tenant cap table ∩ Apollo `investor_names` (memoire pure) | 0 |
| `funding_recent` | `funding-recent.ts:33-105` | Apollo `latest_funding_raised_at` (fenetre 180j) | 0 |
| `funding_crunchbase` | `funding-crunchbase.ts:28-170` | Crunchbase API (conditionnel `CRUNCHBASE_API_KEY`, 180j) | 0/inclus |
| `hiring_intent` | `hiring-intent.ts:19-81` | Apollo `num_current_job_openings` | 0 |
| `yc_company` | `yc-company.ts:31-87` | heuristique regex description+keywords | 0 |

Chaque detecteur produit un `SignalPayload {value, reason, sources[], confidence, computedAt}` (`lib/tam-stream/events.ts:100-106`). Les sources sont HEAD-verifiees par `verifySources()` (timeout 800ms, drop 404/410 ; `lib/tam-stream/verify-source.ts:26-61`). Orchestration : `runPerCompanyPipeline()` (`inngest/per-company.ts:76-406`), persiste dans `companies.properties.tamSignals` (`per-company.ts:388-399`). `ctx.now` est gele au demarrage du build pour determinisme (`signals/types.ts:24`).

**Registre 2 — properties-based LECTURE HISTORIQUE.** `SIGNAL_DETECTORS` a `lib/scoring/signal-detectors.ts:76-133` lit les sous-arbres JSONB deja stockes :
- `funding` → `properties.fundingLastCheckedAt`
- `funding_crunchbase` → `properties.tamSignals.funding_crunchbase.computedAt`
- `hiring` → `properties.jobPostingIntent.detectedAt`
- `tech_stack_change` → `properties.techStackChange.detectedAt` (**jamais ecrit par aucun producer**)
- `leadership_change` → `properties.leadershipChange.detectedAt` (**jamais ecrit**)
- `investor_overlap` → `properties.investorOverlap.scannedAt`

Usages : attribution (`asOf = deal.createdAt`, garde le credit du signal qui a ouvert la vente) et scoring live (`asOf = now`). Fraicheur via `isFreshAt()` binaire (`signal-detectors.ts:68-72`).

**Detection temps-reel + batch (cycle de vie complet).**
- Temps-reel : `evaluateRealtimeSignals()` (`inngest/realtime-signal-handler.ts:19-52`), trigger `signals/evaluate-realtime`, heuristiques sans LLM, concurrence 5/tenant + throttle 60/min. **Emet des notifications uniquement, ne persiste rien** (gap).
- Batch : `signalMonitorCron` (`inngest/signal-monitor.ts:31-62`), CRON `0 */4 * * *`, top 50 companies/tenant, `persistSignal()` → `companies.properties.signals[]` `{type, confidence, detail, detectedAt}` (`signal-monitor.ts:228-252`), types `funding_recent/acquisition/hiring_surge/executive_hire` (`:179-217`).

### 1.2 Scoring

Formule fondamentale (`lib/scoring/priority-score.ts:47-50`) :

```
priority_score = signal_multiplier × fit_score × accessibility
```

- `signal_multiplier` ∈ [0.5, 2.5] — lift closed-won appris (`signal-outcomes.ts:computeMultiplier`). Si total < `MIN_SAMPLE_SIZE=10` → 1.0× neutre (`signal-outcomes.ts:129-134`).
- `fit_score` ∈ [0,1] — `companies.score/100`, defaut neutre 0.5 si null (`priority-score.ts:42-45`).
- `accessibility` ∈ [0,1] — meilleur contact : email 0.4 + phone 0.4 + LinkedIn 0.2 (PICK best, pas somme ; `priority-score.ts:65-87`). Si 0 contact → 0.

Couche bonus separee (`lib/scoring/score-with-signals.ts:33-69`) : `BASE_BONUS_PER_SIGNAL=5`, cap `MAX_TOTAL_SIGNAL_BONUS=20`, points = 5 × multiplier[type].

Scoring ICP 100-points (`lib/scoring/scoring.ts:62-158`) : Industry 30 / Size 25 / Geo 20 / Funding 10 / Revenue 10 / Data Quality 5 ; grades A+≥90…F (`scoring.ts:9-16`).

Recompute quotidien : `signalScoreDaily` CRON `0 6 * * *` (`inngest/signal-score-daily.ts:93-268`), `bestMultiplierForCompany` (`:70-91`), persiste `companies.priorityScore` + `priorityScoreComputedAt`.

Kairos accelerator (`priority-score.ts:107-158`) : signal frais <24h ET multiplier ≥1.5 ET enrollment `active` ET `next_step_at > now` → bump `next_step_at` a NOW.

### 1.3 Stockage (schema reel)

**Pas de table `signals` normalisee.** Tout vit dans `companies.properties` (JSONB, `db/schema/core.ts:64`). Sous-arbres : `tamSignals{key:payload}`, `signals[]`, `funding/funding_crunchbase`, `jobPostingIntent`, `techStackChange`, `leadershipChange`, `investorOverlap`, `customSignals[id]`, `latestSignal`. Person-grain limite a `contacts.properties.latestSignal {type,label,observedAt}` (`lib/signals/latest-signal.ts:54-78`).

Tables existantes :
- `signal_outcomes` (`db/schema/intelligence.ts:222-240`) : `(tenantId, dealId, companyId, signalType, signalFiredAt, outcome, recordedAt, metadata)`, index `(tenantId,signalType,outcome)`, `(dealId)`. **Ledger d'attribution — a garder.**
- `anonymized_signal_benchmarks` : `(industry, companySize, signalType, outcomeRate, tenantCount, totalObservations, avgDealCycleDays)`, unique `(industry,companySize,signalType)`, k≥10.
- `custom_signals` (`intelligence.ts:664-713`) : `plan jsonb {judgePrompt, keywords[], urlPatterns[]}`, `backfilledAt`, unique `(tenantId,name)`.
- `signal_url_cache` (`db/schema/coaching.ts:48-71`) : `url UNIQUE, status, outcome, reason, expiresAt` (TTL 7j) ; evict CRON `30 3 * * *`.

### 1.4 Skills signaux

| Skill | Cron | Event | Chat | Etat | Ecrit |
|---|---|---|---|---|---|
| signal-scanner | Daily semaine 7h | — | oui | ACTIF | `contacts.properties.latestSignal` |
| job-posting-intent | — | — | oui | SEMI-DORMANT | `lastKnownEmployeeCount` |
| investor-overlap | — | — | — | **DORMANT** (enregistre `register-all.ts:69`, zero usage) | `properties.investorOverlap` |
| funding-signal-monitor | Mardi 7h | — | oui | ACTIF | `lastKnownTotalFunding/Stage`, `fundingLastCheckedAt` |
| expansion-signal-spotter | Lundi 10h | — | oui | ACTIF | read-only |
| champion-tracker | 1er du mois 8h | — | oui | ACTIF (Apollo 1cr/enrich) | `previousCompany/Title`, `championChangeDetectedAt` |
| contact-cache | — | — | oui | SEMI-DORMANT | `outreachStatus` |
| inbound-lead-qualification | — | contact/created | oui | ACTIF | read-only |

### 1.5 Wiring signal→action & autopilot

- `signals/auto-enroll` → `signalAutoEnroll` (`inngest/signal-to-sequence.ts:42-371`) : skip si open deal, anti-ICP gate (`:85-106`), routing multi-ICP via `primaryIcpId` (`:173-194`), `pickSequenceForSignal()` (`lib/sequences/triggers.ts:143-153`), suppression P0-5 (`:134-142`), **approval gate `confirm:always` → JAMAIS `allowed:true` aujourd'hui** → defere en "Needs you" (`:243-279`), sinon enroll + deal stage "lead".
- `signals/fresh-detected` → `signalAccelerateCadence` (`inngest/signal-accelerate-cadence.ts:49-135`) : Kairos. **Producer `signals/fresh-detected` incompletement cable** (gap connu).
- `signals/deal-alert-check` → `signalToDealAlert` (`inngest/signal-to-deal-alert.ts:33-191`) : LLM impact assessment, `coachingInsights`, notif.
- Cockpit outbound (`app/api/outbound/queue/route.ts:44-158`) : replies (1000) > reminders (600/800) > drafts (100..210, `100 + qualityScore×100 + max(0,10−signalFreshnessDays)`), cap 100 drafts.

### 1.6 Sources de donnees branchees

| Source | Statut | Cle | Signaux |
|---|---|---|---|
| Apollo (org + people) | LIVE | `APOLLO_API_KEY` (backbone) | firmo, funding, tech, hiring, job-postings |
| Crunchbase | LIVE conditionnel | `CRUNCHBASE_API_KEY` | funding, investors |
| Sirene / Zefix LINDAS | LIVE keyless | — | firmo FR/CH |
| Datagma / Firmable / Hunter | LIVE conditionnel | resp. cles | gap-fill EU/AU/email |
| Kaspr / Lusha | LIVE conditionnel | resp. cles | email/phone FR/EU |
| Unipile (Sales Nav + relations) | LIVE conditionnel | `UNIPILE_API_KEY`+`UNIPILE_DSN` | LinkedIn sourcing + warm graph |
| Tech-detect | LIVE keyless (opt-in, hors waterfall) | — | technographics |
| Snitcher / RB2B / Clearbit | LIVE conditionnel | resp. cles | visitor-ID |
| LLM narrative | LIVE | `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` | narration scores |
| **tech_stack_change / leadership_change** | **ABSENT** (lu, jamais ecrit) | — | — |
| **job-change (champion-grade)** | **ABSENT** comme signal entrant | — | — |
| PredictLeads / TheirStack / ATS publics | ABSENT | — | jobs/tech/news gratuits |
| Bombora / 6sense / G2 intent | ABSENT | — | intent tiers |

### 1.7 Surfacage UI

- `signal-chip.tsx:84-180` : true+high vert plein / true+medium vert pointille + "Heuristic" / true+indeterminate gris "—" / false barre. Popover Reasoning + Sources (`:214-325`).
- `signal-confidence-badge.tsx:23-71` : 4-etats (`lib/signals/confidence-state.ts:67-79`) verified/likely/uncertain/unverified ; URL cassee = invalide quel que soit le score (`:60-65`). Vue par defaut = verified+likely.
- Accounts page (`accounts/page.tsx:3049-3127`) : 3 categories de colonnes — TAM-stream (live d'abord, fallback `properties.tamSignals`), custom signals, detected signal types.

### 1.8 Tableau des gaps verifies

| # | Gap | Evidence | Impact |
|---|---|---|---|
| 1 | **Taxonomie divergente → multipliers morts** | `signal-score-daily.ts:87` lookup `funding_recent` vs multipliers `funding` (`signal-detectors.ts:16-22`) | Attribution court-circuitee, scorer retombe a 1.0× partout |
| 2 | Triple source de verite JSONB | `tamSignals` / `signals[]` / sous-arbres `signal-detectors.ts:76-133` | Derive silencieuse, scan full-table pour requeter |
| 3 | Deux tables TTL | `signal-detectors.ts:49-56` (6 types) vs `freshness.ts:31-60` (18) | Refactor de l'une diverge de l'autre |
| 4 | Decay binaire | `isFreshAt()` true/false (`signal-detectors.ts:68-72`) | Poids plein jour 179, zero jour 181 |
| 5 | tech_stack_change / leadership_change non ecrits | `signal-detectors.ts:106-119` sans producer | Signaux fantomes |
| 6 | Real-time persiste rien | `realtime-signal-handler.ts` notif-only | Emails/meetings ne nourrissent pas `signals[]` |
| 7 | Producer `signals/fresh-detected` absent | wiring "follow-up commit" | Kairos potentiellement inoperant |
| 8 | `signals[]` append-only, pas de tombstone/version | `signal-monitor.ts:240-246` | Analytics cycle de vie cassee |
| 9 | Confidence classifiee mais pas stockee ni scoree | `confidence-state.ts` UI-only | Pas de ponderation provenance |
| 10 | accessibility=0 → score 0 | `priority-score.ts:79-87` | Compte parfait injoignable non classe |
| 11 | Cold TAM sans signal = fit seul | `score-with-signals.ts:43-44` | Pas de lift sur cold |
| 12 | investorOverlapSkill dormant | `register-all.ts:69` | Capacite construite, inaccessible |

---

## 2. Taxonomie world-class des signaux

Doctrine convergente (Clay, Common Room, Unify, Apollo, 30MPC, Monaco) : **3-5 signaux, pas 40**, classes en fit/intent/timing/warm-path, scores avec decay par categorie, dedupliques sur une identite, declenches uniquement a convergence 2+ sources. Le moat est la logique de decision, pas le vendor (twelfth.agency).

### (a) Signaux legacy par source

| Source | Signaux | API / endpoint | Cout | RGPD |
|---|---|---|---|---|
| **LinkedIn Sales Nav** (via Unipile) | job change <90j, posted recently, mentioned in news, account growth | Pas d'API officielle d'extraction ; Unipile `POST linkedincontroller_search` (people+companies, Classic+SalesNav) | Unipile ~5€/compte/mois, min 49€ ; envoi 100-150 msg/j | Conforme via compte connecte client ; scraping = ToS violation |
| **PhantomBuster** | search export, profile scraper | `POST api.phantombuster.com/api/v2/agents/launch`, header `X-Phantombuster-Key-1` | Starter ~69$/mo (slots+heures) | zone grise ToS/RGPD |
| **Crunchbase** | funding rounds, M&A, investors, IPO, leadership | v4 Basic = 3 endpoints (`autocompletes`, `entities/organizations/{permalink}`, `POST searches/organizations`) ; cards `funding_rounds`/`acquisitions` en Enterprise | plus de free tier (2025) ; SaaS 99-199$/mo ; full API ~50k$/an | firmo niveau entreprise, faible |
| **Apollo** | funding, tech (1500+), hiring, job postings, intent topics, job-change (waterfall depuis 2026) | `POST mixed_companies/search` (0cr metadata) ; `people/match` (1cr email, 8cr phone) ; `GET organizations/{id}/job_postings` | Basic 49$ / Pro 79$ / Org 119$ user/mo | data broker, DPA + opt-out |
| **ZoomInfo** | Scoops (exec moves, hiring plans, M&A, RFP, layoffs), Intent | `api.zoominfo.com/gtm`, OAuth2 ; Scoops + Intent Search/Enrich | API ~50k$/an, 25 req/s | fort enjeu (emails/phones directs) |
| **BuiltWith** | tech stack + FirstDetected/LastDetected + spend | `api.builtwith.com/v22/api.json?KEY=&LOOKUP=` ; Lists API (qui utilise X) | Basic 295$ → Team Ultra 6000$/mo (×6 en 2026) | utiliser `NOPII` |
| **Wappalyzer** | tech + versions + confirmedAt + firmo | `GET /v2/lookup/?urls=`, header `x-api-key` | 1cr/URL cache, 5cr live ; Starter 39$/mo | NOPII sans base legale |
| **Bombora** | Company Surge (21600+ topics) | feed natif SF/HubSpot/Marketo + raw warehouse ; surge 3 sem vs 12 sem baseline | ~25-60k$/an+ | co-op consenti, niveau entreprise |
| **G2 Buyer Intent** | 9 signaux (profile/pricing/alternatives/compare…), buying_stage | `GET /api/v2/market_signals` (`data.g2.com/api/docs`) | add-on 40-50k$ list | account-level on-site |
| **Job boards ATS publics** | postes ouverts = stack + intent + velocity | Greenhouse `GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` ; Lever `api.lever.co/v0/postings/{co}?mode=json` ; Ashby | **0** | public, RGPD-safe |
| Indeed / LinkedIn Jobs | — | API search **depreciee/inexistante** ; partner-only pour poster | — | scraping seulement |

### (b) Signaux PLG & de-anon site

Reference honnete = chiffres prod Warmly (~65% company, ~15% person, US). Demo = 3-5× la prod.

| Outil | Granularite | Methode | Match US prod | API | Prix |
|---|---|---|---|---|---|
| **RB2B** | person US + company monde | identity graph/cookie-pool | ~15% pers / ~65% co | **webhook push only** (`app.rb2b.com/integrations/webhook`, payload fixe) | Free 150cr ; Pro+ 149$/mo ; 0.85$/cr overage |
| **Vector** | person/contact US | identity graph + Ad Reveal | 15-30% | webhooks + CRM | Reveal 399-999$/mo |
| **Warmly** | co+person waterfall | 20+ fournisseurs + consensus 2+ | 65%/15% | Slack/CRM/intent | Data Only 499$/mo → 19-45k$/an |
| **Snitcher** | company only | reverse-IP, jamais de PII | jusqu'a 65% | `POST api.snitcher.com/company/find?ip=`, Bearer, 600 req/min | API payante separee |
| **Koala** | — | — | — | **MORT** (shutdown sept. 2025, rachat Cursor) | — |
| **Clearbit Reveal** | company | reverse-IP | — | sunset, **HubSpot-only** (Breeze) | 45$/mo |
| **Factors.ai** | account | waterfall 4 sources | 40-65% | CRM + LinkedIn CAPI | dès 399$/mo |

**PQL first-party** (gratuit, frais, RGPD-safe — la couche la plus defendable) : activation/aha, limite free atteinte, visite pricing, invitation coequipier, integration connectee. Capture PostHog `posthog.capture()` + group analytics niveau compte ; Segment `track()`+`identify()`. Stockage warehouse → scoring fit×usage×intent (≤10 signaux) → activation reverse-ETL (Hightouch/Census). PQL→client 20-30%.

### (c) Signaux personne & communaute

**Common Room** — Person360 (identity resolution + waterfall), 100+ signaux 1st/2nd/3rd-party. Sources techniques : GitHub (OAuth/PAT scopes `read:org/read:user/user:email`, public repos only), Slack/Discord bots canaux publics, npm/PyPI via Scarf, job-change natif, funding/hiring/news natifs. API **ingest-only** (`POST /source/{id}/activity`, base `api.commonroom.io/community/v1`, Bearer, 20 req/s) — on ne pompe pas leurs signaux, on pousse les notres. De-anon web person-level = Vector, US-only, ~35% (doc) vs ~50% (marketing combine). De ~$2100/mo.

**Job-change tracking** (le warm signal n°1, convertit 3-5× le cold) : UserGems Core 2750$/mo, 21+ signaux ; Coresignal Employee Data dès 49$/mo + webhooks change-of-job ; Champify. **Proxycurl mort** (injonction LinkedIn 2025) → datasets ou comptes connectes (Unipile). FR gratuit : changement de dirigeant via BODACC.

### (d) Signaux DIFFICILES / propres — la liste differenciante

Score = impact × faisabilite-weekend. Le travail dur n'est pas l'API (souvent gratuite) mais (a) mapping entite→domaine→contact ICP, (b) snapshot+diff (etat→changement = velocity), (c) NLP d'extraction d'intent.

| Signal | Source technique | Cout | Pourquoi c'est dur |
|---|---|---|---|
| **Job boards ATS parses** (stack+intent+velocity) | Greenhouse/Lever/Ashby endpoints publics keyless | 0 | mapper slugs→ICP + NLP descriptions |
| **Adoption open-source** | npm `api.npmjs.org/downloads/point/...`, PyPI `pypistats.org`, Docker Hub `pull_count`, GitHub stars (snapshot+diff), deps.dev, ecosyste.ms | 0 (BigQuery cents) | lier repo→entreprise, derivee = snapshots datés, filtrer CI |
| **crt.sh + DNS/sous-domaines** | `crt.sh/?q=%25.{domaine}&output=json` (diff quotidien) | 0 | crt.sh lent/flaky ; diff vs snapshot ; sous-domaine→produit |
| **SEC EDGAR Form D + 8-K** (financement US pre-annonce) | `efts.sec.gov` full-text + flux Atom Form D + `data.sec.gov/submissions/CIK{...}.json` | 0 | User-Agent obligatoire, parse XML, lier CIK→domaine |
| **BODACC + recherche-entreprises FR** (dirigeant/financement) | `recherche-entreprises.api.gouv.fr/search` (keyless 7 req/s), BODACC Opendatasoft, Pappers (100cr gratuits) | 0 | filtrage `where=`, nature annonce→signal ; **avantage local que les US ignorent** |
| **Hiring velocity** | derive du #1 (snapshots ATS), ref PredictLeads | 0 DIY | historique date pour calculer la derivee |
| **Brevets** | EPO OPS (OAuth2 gratuit), Google Patents BigQuery, Lens.org | 0 | latence publication 18 mois, deposant→entite |
| **Ad Library** | Meta Ad Library UI/DSA (EU), Google Transparency (scraping) | 0/SaaS | API Meta exclut commercial, Google sans API |
| **Tech churn** (outil retire) | BuiltWith `/changes` (Team 995$/mo), DetectZeStack dès 9$/mo | $$ | l'historique est precisement ce qui est paywalle |
| **Podcast/YouTube mentions** | Listen Notes, YouTube Data API (quota 10k/j, search=100u) | 0/SaaS | transcripts payants, NER |
| **Posts LinkedIn execs** | Unipile (compte connecte) | ~49$/mo | ToS/legal, fraicheur activite rare, ban risk |

---

## 3. Framework "expert conseil signaux"

**Principe n°1 a repeter au founder : les outils se commoditisent, le framework non. 3-5 signaux, pas 40.**

### 3.1 Checklist de qualification

**A. Motion & economie de la transaction** (decide quels signaux sont economiquement actionnables)
1. Comment vends-tu ? founder-led / 1-2 SDR / self-serve / mix
2. **ACV ?** <5k / 5-25k / 25-100k / >100k € — LE chiffre qui dit si un signal a 30-150k$/an se rentabilise (un deal doit le financer)
3. Duree du cycle ? jours / semaines / 3-9 mois
4. **Surface first-party ?** trafic web qualifie / produit avec telemetrie / liste email — si NON aux trois → intent web/produit hors-jeu, bascule timing+warm-path
5. Volume cible/jour ? (~100 via priority_score, au-dela tu satures)
6. Budget data mensuel ? 0 / centaines / illimite

**B. ICP & perimetre** (couche FIT)
7. Meilleur client en une phrase (secteur, taille, geo, stack)
8. Top 5 clients — points communs ? investisseurs ? origine ?
9. **Anti-ICP : qui NE PAS cibler ?** (alimente suppression + anti-ICP gate)
10. Geo dominante EU/FR ou US ? (decisif RGPD)

**C. Comite d'achat & declencheur de douleur** (TIMING + WARM-PATH)
11. Qui signe / utilise / bloque ? (taille comite : 1-2 PLG, 6-10 enterprise)
12. **Quel evenement chez le prospect cree le besoin MAINTENANT ?** (la vraie question — leve, recrute VP Sales, migre d'outil, nouveau dirigeant)
13. Quelle douleur precise, quel symptome externe la trahit ? (30MPC : douleur specifique > trigger generique)
14. Tes champions bougent-ils ? (job-change = warm n°1, 3-5×)
15. Reseau : investisseurs communs, alumni, intros ? (Elevay a `investor_overlap` + relationship-graph Unipile)

**D. Historique** (calibre le SCORING)
16. 10-20 deals **closed-won** — methode sur laquelle tout le marche s'accorde : identifier les 3-5 signaux les plus correles au closed-won, ponderer par cette correlation (pas par dispo fournisseur)
17. 10 closed-lost (denominateur du lift vs baseline)
18. Signaux negatifs deja observes ? (licenciements, renouvellement concurrent → suppriment)

**E. Timing macro**
19. Cycle budgetaire des clients ? (annee fiscale, fin de contrat)
20. Latence acceptable ? <4h sur chaud ou batch quotidien suffit

Livrable : "Motion=X / ACV=Y / Surface first-party=O-N / 4 signaux + source + TTL + action routee".

### 3.2 Arbre de decision — quel signal pour quelle entreprise

Regle transverse : signaux par correlation closed-won, plafond 5, exiger 2 sources differentes avant routage haute-priorite, action routee obligatoire sinon on jette.

**PROFIL A — Founder-led / pre-PMF / pas de trafic ni telemetrie** (le cas Elevay/Pilae)

| Signal | Pourquoi | Source |
|---|---|---|
| Job-change champion → compte cible | warm n°1, 3-5× | Elevay `champion-tracker` ; Unipile ; FR BODACC gratuit |
| Investor overlap | diligence partagee, intro chaude | Elevay `investor_overlap` natif — gratuit, ne perime jamais |
| Levee recente <6 mois | capital frais, pic 48-72h | Elevay `funding_recent`/`funding_crunchbase` ; US SEC Form D ; FR BODACC |
| Hiring spike fonction pertinente | expansion → douleur nouvelle | Elevay `hiring_intent` ; breadth ATS publics gratuits |

**Ne PAS acheter ici** : Bombora/6sense/G2 (30-150k$/an). Sans surface first-party, rien contre quoi faire converger = cause n°1 d'echec documentee. Action = 1:1 founder-personnalise.

**PROFIL B — PLG / self-serve / ACV <5k** : activation/aha, limite free atteinte, invite coequipier, de-anon company-level pre-signup. PostHog/Segment group analytics. Action = play PLS auto, humain au seuil PQL.

**PROFIL C — Hybride / PLS / 5-25k** (defaut 2026) : CONVERGE first-party + account ; fire seulement quand signal contact ET compte coincident. De-anon (RB2B US/Snitcher EU) + champion + tech-stack + jobs. Action = sequence semi-auto perso signal-specifique.

**PROFIL D — Sales-led / enterprise / >100k / comite 6-10** : le cout des signaux chers se justifie. Intent surge (Bombora/6sense/G2) + trigger comite (4+ contacts/30j, 2+ depts, score≥150, 1+ exec → close 2×) + RFP/earnings (SEC) + exec hire. Action = ABM multi-thread, SLA 30 min Tier-1.

### 3.3 Mapping signal→angle→canal→timing (Kairos)

| Signal | Revele | Ouverture a ecrire | Canal | TTL Elevay |
|---|---|---|---|---|
| Levee | budget frais, gap process | "Felicitations serie X. Apres une levee, l'enjeu n°1 c'est {process} — voila comment {pair} l'a tenu…" | Email+LinkedIn | pic 48-72h, TTL 180j |
| Job-change champion | relation + nouveau pouvoir | "Vu que tu prends {poste} chez {boite} — on avait {contexte}. Les 90 premiers jours = audit {categorie}…" | LinkedIn puis email | 30-60j |
| Investor overlap | diligence partagee | "{Investisseur} nous a backes tous les deux — on resout {douleur} pour leurs portcos…" | LinkedIn/intro VC | ∞ |
| Hiring spike | expansion equipe | "Vous recrutez N {fonction} — le point de rupture c'est {douleur}. Regle pour {pair}." | Email | 30j |
| Tech-stack change | migration, fenetre switch | "Vu que vous passez a {techno}, les equipes butent sur {challenge}…" | Email | 90j |
| Leadership change | fenetre audit, 70% budget en 100j | "Nouveau {role} = 90j d'audit {categorie}. Voila les 3 questions des pairs." | LinkedIn+email | 120j |
| Visite pricing | intent haute (si first-party) | "Vu que tu regardais {page} — la question a ce stade c'est {objection}…" | Email rapide/call | 24-48h, -50% ; TTL 7j |
| Intent surge tiers | recherche categorie (enterprise) | "Votre equipe creuse {topic} — la decision se joue sur {critere}." | Email+ABM | 3-7j, -50% a 14j |

Mecanique Kairos Elevay : signal frais <24h ET fort ≥1.5× sur sequence active → `next_step_at`=NOW (double la file). Garde-fou : seules sequences `active` ; producer a cabler.

### 3.4 Les quatre classes + stacking

| Classe | Question | Nature | Decay | Role |
|---|---|---|---|---|
| FIT | Devraient-ils ? | statique firmo/techno | mois-annees | **Filtre, jamais le trigger** |
| INTENT | Cherchent maintenant ? | comportemental | jours 3-14 | Priorisateur (signal 3 sem = histoire) |
| TIMING | Fenetre ouverte ? | evenement discret | semaines-mois | **Declencheur** (raison de contacter now) |
| WARM-PATH | Route de confiance ? | relationnel | persistant | **Multiplicateur 3-5×** |

Condition de victoire = recouvrement FIT × INTENT/TIMING, demultiplie par WARM-PATH. Un signal seul ment ; empiler 3+ → pattern. Math (directionnel) : 3+ signaux ~2.4× ; multi-signaux 5-10× ; reply 25-40% vs 3-5%. Regle Apollo : 2 sources independantes avant haute-priorite. Ponderation = `poids_base × pertinence_persona × multiplicateur_topic × decay_temps`. Decay : halve tous les 30j, drop >60j ; SLA high ≤4h, medium ≤24h.

Traduction Elevay : `signal_multiplier` (TIMING/INTENT/WARM appris) × `fit_score` (FIT, plafonne, jamais trigger) × `accessibility`. Consequence : FIT multiplicateur plafonne, signal domine, sans contact joignable score=0.

### 3.5 Pieges & garde-fous

| Piege | Garde-fou |
|---|---|
| Sur-saturation/alert fatigue | plafonner 3-5, mieux vaut rater que sur-declencher |
| Faux positifs (bot, concurrent qui te recherche, candidat) | filtres d'exclusion AVANT le rep ; anti-ICP gate |
| Trigger generique sature (30MPC) | apparier chaque trigger commun a un signal de douleur specifique |
| Signal non-actionnable | pas d'action routee = on ne le track pas |
| Latence/fenetre ratee | TTL strict, drop >60j, SLA ≤4h high |
| Signal=certitude | eleve la probabilite, exiger convergence 2-sources |
| Doublon d'identite | dedup sur 1 identite AVANT scoring (cle deterministe email/LinkedIn) |
| Signaux negatifs ignores | suppression-list (layoffs, renouvellement concurrent, detresse) |
| Hallucination URL | HEAD-check ; URL cassee = signal invalide quel que soit le score |

RGPD (cible EU/FR) : person-level web inexploitable legalement en EU (consentement+DPIA+Art.14), plafonne ~15% meme US → couche EU = company-level (Snitcher-type, interet legitime). Person-level defendable seulement via first-party consenti (PQL). LinkedIn = Unipile sur compte connecte, pas scraping.

---

## 4. Architecture cible pour Elevay

### 4.1 La recommandation

**Construire une table `signals` normalisee derriere un "signal bus", unifier les deux registres sur une taxonomie canonique via une alias-map, puis dual-write → flip reads.** Pas de big-bang rewrite.

Trade-off accepte : pendant la migration (steps 3-7), deux sources de verite (JSONB + table) avec write amplification + une CHECK contrainte de sujet polymorphe, en echange de zero downtime scoring, reversibilite totale, et aucune cassure du scorer 100-points existant. Path "boil the lake additively".

### 4.2 Le defaut #1, prouve

Trois chemins desaccord sur le nom d'un signal :
1. **Learn** — `recordDealOutcome` → `detectActiveSignals(props)` (`signal-outcomes.ts:84`) ecrit `signal_outcomes.signalType ∈ {funding, hiring, …}` ; `getSignalMultipliers` retourne une map keyee sur ces noms (`:182-193`).
2. **Write** — cron 4h ecrit `properties.signals[]` avec `{funding_recent, acquisition, hiring_surge, executive_hire}` (`signal-monitor.ts:179-217`).
3. **Score** — `bestMultiplierForCompany` fait `multipliers[s.type]` (`signal-score-daily.ts:76-88`).

Resultat : `multipliers["funding_recent"]` etc. = `undefined` → plancher 1.0×. Le moteur Bayesian (la meilleure piece) est bypasse pour le `priority_score` quotidien.

### 4.3 Schema cible — table `signals` normalisee

Drizzle dans `db/schema/intelligence.ts` (a cote de `signalOutcomes:222`). Tenant-scoped. Sujet polymorphe via deux FK nullable + discriminateur.

```ts
export const signals = pgTable("signals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").references(() => tenants.id).notNull(),
  subjectType: text("subject_type").notNull(),            // 'company' | 'person'
  companyId: text("company_id").references(() => companies.id),
  contactId: text("contact_id").references(() => contacts.id),
  type: text("type").notNull(),                           // canonique
  category: text("category").notNull(),                   // fit|intent|timing|warm_path
  source: text("source").notNull(),                       // apollo|crunchbase|tam_stream|signal_monitor|realtime|custom|linkedin
  firedAt: timestamp("fired_at", { withTimezone: true }),
  observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
  ttlDays: integer("ttl_days"),                           // null = fait structurel
  expiresAt: timestamp("expires_at", { withTimezone: true }), // fired_at+ttl ; indexe
  confidence: real("confidence"),                         // 0..1
  confidenceState: text("confidence_state"),              // verified|likely|uncertain|unverified
  payload: jsonb("payload").default({}),                  // {reason, sources[], detail, raw}
  dedupKey: text("dedup_key").notNull(),
  supersededById: text("superseded_by_id"),
  invalidatedAt: timestamp("invalidated_at", { withTimezone: true }), // tombstone
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("signals_tenant_dedup_idx").on(t.tenantId, t.dedupKey),
  index("signals_subject_idx").on(t.tenantId, t.subjectType, t.companyId, t.contactId),
  index("signals_fresh_idx").on(t.tenantId, t.type, t.expiresAt),
  index("signals_category_idx").on(t.tenantId, t.category, t.firedAt),
  // CHECK: (company_id IS NOT NULL) <> (contact_id IS NOT NULL)
]);
```

Notes :
- `dedup_key` = `sha1(`${subjectType}:${subjectId}:${type}:${sourceEvtId ?? dayBucket(firedAt)}`)` — event-grain dedup ; structurels (ttl=null) collapse pour toujours.
- `expires_at` genere au write → fraicheur = filtre indexe `expires_at > now()` au lieu de N lectures JSONB.
- `category` porte la classe fit/intent/timing/warm_path → decay class-specifique + convergence gate.
- `signal_outcomes` reste tel quel (ledger d'attribution), keyera sur canonique apres unification.

### 4.4 Taxonomie canonique + alias-map

Nouveau module `lib/signals/taxonomy.ts` :

```ts
export const CANONICAL = {
  funding:           { category: "timing",    ttlDays: 180 },
  hiring:            { category: "timing",    ttlDays: 30  },
  tech_stack_change: { category: "timing",    ttlDays: 90  },
  leadership_change: { category: "timing",    ttlDays: 120 },
  investor_overlap:  { category: "warm_path", ttlDays: null },
  job_change:        { category: "warm_path", ttlDays: 60  },  // nouveau, person-grain
  website_visit:     { category: "intent",    ttlDays: 7   },
} as const;

export const ALIAS: Record<string, keyof typeof CANONICAL> = {
  funding_recent: "funding", funding_crunchbase: "funding", acquisition: "funding",
  hiring_intent: "hiring", hiring_surge: "hiring",
  executive_hire: "leadership_change",
  // yc_company = TRAIT (ICP catalog), pas un signal — drop
};
```

L'alias-map est le pont qui corrige le bug multiplier-mort sans toucher aucun detecteur : les deux registres resolvent via `toCanonical(type)` avant tout lookup.

### 4.5 Signal bus

Nouveau `lib/signals/bus.ts`, choke point unique :
- `recordSignal(input)` — WRITE : `toCanonical(rawType)` (kill divergence), drop si trait/unknown, classifie+stocke confidence (`confidence-state.ts:67`), calcule `expiresAt`, upsert `onConflictDoUpdate` sur `(tenantId,dedupKey)`, emet `signals/recorded` (cable le producer real-time).
- `activeSignals(subject)` — READ : une requete indexee `invalidatedAt IS NULL AND (expiresAt IS NULL OR expiresAt > now)`. Remplace `detectActiveSignals` JSONB.

Interface `SignalSource` : les 5 detecteurs TAM (`index.ts:10-16`) et les detecteurs cron (`signal-monitor.ts:170-223`) s'enregistrent dans un seul endroit, tous emettent du canonique via `recordSignal`.

### 4.6 Sequence de migration additive

`db:push` localdev ; `db:migrate:apply` avec `DATABASE_URL_OWNER` pour la migration additive prod.

| # | Step | Risque | j-h |
|---|---|---|---|
| 0 | `taxonomy.ts` + alias-map + tests. Pur, zero comportement | aucun | 1 |
| 1 | Collapse les deux tables TTL : supprimer `SIGNAL_TTL_DAYS` (`signal-detectors.ts:49-56`), re-export depuis `freshness.ts:31-60`, `isFreshAt` delegue. Memes valeurs → non-breaking | faible | 1 |
| 2 | Creer table `signals` + migration idempotente. Pas de read | faible | 1.5 |
| 3 | Bus + dual-write shadow : chaque writer (`per-company.ts`, `signal-monitor.ts:228`, `custom-signal-backfill.ts`, `real-time-detector.ts`) appelle aussi `recordSignal`. JSONB reste read source | faible | 3 |
| 4 | Backfill one-shot Inngest : lire tous les sous-arbres, mapper alias→canonique, `recordSignal` (idempotent) | faible | 2 |
| 5 | **Flip reads** flag `SIGNALS_TABLE_READ` : `score-with-signals.ts:40`, `signal-score-daily.ts:76`, `recordDealOutcome:84` lisent via bus. **Corrige le bug #1.** Diff old/new priority_score localdev avant prod | **moyen** | 3 |
| 6 | Real-time persistence : `real-time-detector.ts` write via bus + emet `signals/fresh-detected` (cable Kairos) | faible | 2 |
| 7 | Person-grain : emettre `subject_type=person` `job_change` depuis Unipile relations + `lib/context/relationship-graph.ts` ; migrer `latest-signal.ts:54` | moyen | 4-5 |
| 8 | Retirer writers JSONB une fois UI (`accounts/page.tsx`, `signal-chip.tsx`) lisant la table | faible | 1-2 |

Steps 0-5 (~11.5 j-h) = minimum pour declarer le defaut #1 clos. Le scorer 100-points (`scoring.ts`) n'est jamais touche.

---

## 5. Le pari hackathon (ce week-end)

### 5.1 Idees scorees (Nouveaute × Faisabilite-WE × Impact-demo, /10)

| # | Idee | Nouv. | Faisab. | Demo | Total |
|---|---|---|---|---|---|
| **1** | **Compound Signal Agent** — fan-out ATS+GitHub+tech+funding live, synthese 1 signal compose source + draft | 9 | 8 | 9 | **26** |
| 2 | Signaux FR souverains (BODACC/recherche-entreprises) | 9 | 8 | 7 | 24 |
| 3 | Agent expert-conseil auto-config custom-signals | 6 | 9 | 6 | 21 |
| 4 | De-anon visiteur + auto-draft | 3 | 5 | 5 | 13 |

### 5.2 LE choix : Compound Signal Agent

Pourquoi : nouveaute max (Clay/Common Room/Monaco surfacent des signaux isoles, personne ne synthetise un compound source end-to-end) ; incarne la these "moat = jugement, pas data" ; reutilise tout l'existant ; boucle jusqu'a l'action gated ; near-free vs 30-120k$/an.

Le cut realiste : **a la demande sur 1 company, pas les 300 du build** (300 × fan-out = mort par rate-limit) — plus demo-able et plus faisable. LinkedIn posts execs = SKIP v1 (rate-limit + ToS). Mapping domaine→org GitHub = hint optionnel + degradation gracieuse.

### 5.3 Fichiers a creer + reuse

**A creer :**
1. `lib/signals/compound/fanout.ts` — collecteur parallele (Greenhouse/Lever/Ashby + GitHub + Apollo job-postings + tech-detect + Crunchbase) → `Evidence[] {source, snippet, url, fetchedAt}`, passe par `verifySources`.
2. `lib/signals/compound/synthesize.ts` — `tracedGenerateObject` (Sonnet) sur schema zod `{whyNow, angle, subSignals[{type, evidence, citationUrl}], confidence, freshnessDays, draftOpener}`. Prompt grounded uniquement sur l'evidence (claim sans citationUrl = supprime).
3. `app/api/signals/compound/route.ts` — endpoint ndjson SSE streamant `evidence.collected` puis `synthesis.done`. Copie squelette `tam/build`.
   (+ panneau UI "Deep Signal" sur la ligne account, front-only).

**Reuse (file:line) :**
- SSE ndjson `ReadableStream` + heartbeat + abort : `app/api/tam/build/route.ts:180-569` ; concurrence `:672-699`.
- Contrat detecteur + payload : `lib/tam-stream/signals/types.ts:40-43`, `events.ts` ; modele `signals/hiring-intent.ts:19-81`.
- Anti-hallucination : `lib/tam-stream/verify-source.ts:26-61` + classifieur `lib/signals/confidence-state.ts:53-79`.
- Persist + chip : `per-company.ts:386-399` ; colonne = 1 ligne dans `signals/index.ts:10-16` ; `components/signal-chip.tsx`.
- LLM : `anthropic("claude-sonnet-4-6")` (`tam/build/route.ts:149-150`) via `lib/ai/traced-ai` ; prompt grounded a copier de `lib/custom-signals/generator.ts:36-113`.
- Sources : Apollo MCP `apollo_organizations_job_postings` ; `lib/tech-detect/index.ts:23-28` ; `lib/integrations/crunchbase-client.ts` (`isCrunchbaseAvailable:42-43`).
- Draft : `lib/scoring/signal-opener.ts` (`generateOpener`) + `lib/outbound/outbound-methodologies.ts`, envoi via send-gate.
- Warm-path bonus : `findWarmPathsToCompany` (`per-company.ts:308`) + `lib/context/relationship-graph.ts`.

### 5.4 Plan heure-par-heure (~24h)

- **Ven 19-23h (4h)** — `fanout.ts` : 5 collecteurs paralleles → `Evidence`, branches sur `verifySources`. Test 2-3 domaines reels (une boite Greenhouse + une avec org GitHub).
- **Sam 09-13h (4h)** — `synthesize.ts` : schema zod + prompt Sonnet grounded-only. Test sur evidence de vendredi.
- **Sam 14-18h (4h)** — `route.ts` SSE (copie `tam/build`), streame evidence puis synthese. Test curl bout-en-bout.
- **Sam 19-22h (3h)** — panneau UI "Deep Signal" : chaque source atterrit avec favicon + tick (style `signal-chip`), puis carte compound.
- **Dim 09-12h (3h)** — wiring draft (`generateOpener`), animation streaming, degradation gracieuse.
- **Dim 13-16h (3h)** — hardening demo : 2-3 heros (Greenhouse+GitHub+funding riches), screen-capture de secours, repeter le script.
- **Dim 16-18h** — buffer + deploy preview Vercel.

### 5.5 Script de demo (2 min)

Angle : "Tous les outils GTM vous vendent une lance a incendie de signaux isoles ; un humain doit ENCORE relier les points et deviner le why-now. Ce travail de jugement, les incumbents le facturent 30-120k$/an. On en a fait un agent."

- **0:00-0:20 Hook** — "Acme, compte froid dans notre TAM. Aucun outil ne dirait de l'appeler aujourd'hui. Regardez." → clic Deep Signal.
- **0:20-1:00 Fan-out live** — les lignes atterrissent une a une, chacune citee+cochee : "Greenhouse… 4 roles backend Kafka. GitHub… repo neuf pousse cette semaine. Tech-detect… concurrent qu'on remplace. Crunchbase… Serie A il y a 3 mois."
- **1:00-1:40 Synthese** — carte unique : "Acme a leve en mars, monte une data-platform (Kafka + repo neuf) et tourne sur [concurrent]. Fenetre de migration : maintenant." "Aucun signal isole ne le donne, chaque affirmation liee a sa source HEAD-verifiee. Zero hallucination."
- **1:40-2:00 Payoff** — draft d'opener referencant le trigger convergent, citations attachees, un clic pour envoyer via la send-gate. "Compte froid → message source pret a partir en 15 secondes. La couche de jugement automatisee — near-zero la ou Clay+UserGems+Bombora coutent 6 chiffres."

Quatre differenciateurs : (1) compound pas isole ; (2) chaque claim source + verifie ; (3) boucle jusqu'a l'action gated ; (4) near-free.

---

## 6. Plan d'action priorise

### Hackathon (48h)

| Ordre | Chantier | Effort j-h | Impact | Dependances |
|---|---|---|---|---|
| 1 | `compound/fanout.ts` (5 collecteurs + verifySources) | 0.5 | demo | reuse Apollo MCP, tech-detect, crunchbase-client |
| 2 | `compound/synthesize.ts` (Sonnet grounded) | 0.5 | demo | fanout, traced-ai |
| 3 | `api/signals/compound/route.ts` SSE | 0.5 | demo | copie tam/build |
| 4 | Panneau UI Deep Signal | 0.5 | demo | signal-chip, stream consumer |
| 5 | Wiring draft + degradation + hardening demo | 0.5 | demo | generateOpener |

### Post-hackathon (production)

| Ordre | Chantier | Effort j-h | Impact | Dependances |
|---|---|---|---|---|
| 1 | **taxonomy.ts + alias-map** (step 0) | 1 | corrige defaut #1 (prerequis) | — |
| 2 | **Collapse TTL tables** (step 1) | 1 | elimine derive | step 0 |
| 3 | **Table `signals` + migration** (step 2) | 1.5 | fondation | — |
| 4 | **Bus + dual-write shadow** (step 3) | 3 | choke point unique | steps 0-2 |
| 5 | **Backfill** (step 4) | 2 | continuite donnees | step 3 |
| 6 | **Flip reads + flag** (step 5) | 3 | **debloque multipliers (revenue ranking)** | steps 3-4 |
| 7 | Real-time persistence + producer Kairos (step 6) | 2 | emails/meetings nourrissent signals + Kairos operant | step 5 |
| 8 | Person-grain + job_change Unipile (step 7) | 4-5 | warm signal n°1 | step 6, relationship-graph |
| 9 | Decay graduel exponentiel + confidence scoree | 4 | precision scoring | step 5 |
| 10 | Convergence gate (2 sources avant haute-priorite) + suppression-list negatifs | 4 | qualite, anti-faux-positifs | step 5 |
| 11 | Sources gratuites tier-S (ATS breadth, SEC Form D, BODACC `dirigeant_change`) comme `RegisteredSignal` | 6 | breadth signaux, edge FR | bus |
| 12 | Retirer writers JSONB (step 8) | 1-2 | dette technique | step 5, UI |

Steps 1-6 (~11.5 j-h) closent le defaut #1 et debloquent le classement revenue actuellement degrade. Coeur unification complet ~15-19 j-h ; world-class avec person-level + 2 sources gratuites ~35-45 j-h.