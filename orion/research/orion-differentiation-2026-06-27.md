# Orion — la valeur evidente (vs Fiber AI / Orange Slice / Lopus)

## 0. La these en 5 lignes

Orion n'est pas un wrapper d'enrichissement de plus. Il occupe la couche **signal → interpretation → grounding, en AMONT** de l'envoi : il prend des sources (dont des sources souveraines et hard-to-get que personne ne revend), les **resout sur une seule entite**, en **synthetise un why-now compose, date et verifie au contenu**, le **score sur les outcomes reels du tenant**, et emet un **brief** (citableFacts / doNotClaim) qu'un agent outbound consomme. Fiber, Orange Slice et Lopus sont tous, par construction, des **agregateurs/orchestrateurs de providers commerciaux + perso de surface** : ils livrent des lignes de donnees ou un mail merge LLM, jamais le jugement date et source entre les deux. Ils sont donc a la fois des **consommateurs naturels** du brief Orion (on les rend meilleurs) et des **concurrents partiels** sur la seule couche d'entree. La demonstration tient en une phrase : eux te disent *"ce contact a change de job / cette regle a matche"* ; Orion te dit *"voici POURQUOI contacter ce compte MAINTENANT, prouve par 3 sources concordantes verifiees, avec ce que tu peux affirmer, ce que tu ne dois PAS affirmer, et une priorite calibree sur tes propres resultats."*

**Honnetete sur l'etat des connaissances.** FAIT VERIFIE (sources primaires) : le pivot de Fiber vers une data-API agent-native, l'API publique Fiber (200+ ops, MCP, webhooks Tracker), le positionnement Orange Slice (spreadsheet TypeScript agentique, providers nommes), et le double visage de Lopus (Beacon social-intent deprioritise / Probe analytics RevOps actuel). SUPPOSE / NON VERIFIE : les **noms exacts des regles Tracker** de Fiber (necessitent un appel authentifie), les **endpoints/auth precis** d'Orange Slice (docs rendues en JS, non lues mot-a-mot), et **l'API de Lopus** (docs.lopus.ai ne resout pas — aucune API publique documentee). Ces zones sont marquees comme telles partout dans le document.

---

## 1. Ce que font Fiber AI / Orange Slice / Lopus (et leur plafond)

### Fiber AI

Fiber a **pivote** (FAIT VERIFIE, site + YC) d'un "AI SDR autonome" (YC S23) vers une **plateforme de data-APIs agent-native** : *"the freshest data APIs for AI sales, recruiting & growth"*. Sa page `/sales` dit elle-meme qu'il fait list-building + enrichment, **pas d'envoi**. C'est le concurrent INPUT le plus direct d'Orion sur la couche donnees : 100+ providers agreges (LinkedIn, Crunchbase, BuiltWith, SemRush, Apollo), 40M+ entreprises / 850M+ personnes, contact reveal waterfall 16+ providers avec "0% bounce guarantee". Il **detecte** des signaux (Tracker via webhook, job-changes, saved-search relancees) mais **ne les interprete pas** : il emet des evenements bruts et des lignes enrichies.

| | Fiber AI |
|---|---|
| Categorie | Data-API / enrichment infra agent-native (au credit) |
| Data d'entree | 100+ providers (LinkedIn, Crunchbase, BuiltWith, SemRush, Apollo), live LinkedIn/GitHub. Fraicheur snapshot : entreprises 2-3 sem, jobs 2-3 j, personnes 1-2 mois (FAIT VERIFIE, fiche YC) |
| Signaux / interpretation | Detecte (Tracker webhook, job-change, saved-search). **N'interprete pas** : evenements bruts, pas de why-now, pas de compound. Noms de regles Tracker = SUPPOSE |
| Sortie | Donnees (rows, payloads, webhooks). **N'ecrit ni n'envoie pas** |
| Role pour Orion | **INPUT** (enrichissement + flux de signaux bruts), accessoirement OUTPUT (push d'audience a surveiller) |
| PLAFOND | Pas d'interpretation/why-now ; pas de compound verifie HEAD ; pas de grounding citableFacts/doNotClaim ; pas de scoring calibre ; **pas de serie temporelle/velocite** (snapshots ecrases) ; pas de SEC/EDGAR, BODACC/INPI, ATS nommes, npm/PyPI, crt.sh ; oriente US+LinkedIn |

### Orange Slice

Orange Slice (YC S25, FAIT VERIFIE) est un **"spreadsheet d'enrichment agentique ou chaque colonne execute du TypeScript genere par IA"** — un Clay-killer pour developpeurs. Tu decris une colonne en langage naturel, l'IA ecrit le code, une flotte d'agents l'execute en parallele. C'est un **orchestrateur de providers commerciaux** (OpenAI, Firecrawl, Apify, BetterContact, FullEnrich, BuiltWith, PredictLeads) — rien de hard-to-get proprietaire. Il **enrichit, n'interprete pas** : les signaux apparaissent comme des cellules brutes, sans scoring ni why-now.

| | Orange Slice |
|---|---|
| Categorie | Enrichment + orchestration de workflow GTM (spreadsheet TS) |
| Data d'entree | Providers commerciaux revendus (Apollo/PredictLeads/BuiltWith/FullEnrich...), scraping Firecrawl/Apify, monitoring Reddit/HN brut |
| Signaux / interpretation | **Agrege, n'interprete pas.** Signal limite (PredictLeads, forums). Reviews notent : pas de job-change, pas de scoring, pas de why-now |
| Sortie | Donnees enrichies → CRM ; **peut envoyer** basiquement (colonne LLM → Instantly/HeyReach/Gmail/Slack). Mail-merge LLM par ligne, **sans grounding** |
| Role pour Orion | **OUTPUT** (consomme le brief en custom fields via webhook) ; INPUT possible mais faible (rachat de providers). Endpoints/auth = SUPPOSE |
| PLAFOND | Pas de sources hard-to-get ; pas de compound why-now ; pas de scoring calibre ; pas de grounding (perso LLM = risque hallucination) ; stateless, pas d'historique/velocite ; equipe 2 pers. |

### Lopus

Lopus (YC W25, FAIT VERIFIE) a fait un **pivot net** et a deux visages. **Beacon** (historique, deprioritise) : lead discovery par intent social (Reddit/X/forums) — le seul morceau qui touche Orion. **Probe / "Operations Data Platform"** (focus actuel) : analytics RevOps interne, semantic-layer auto-reparante anti-hallucination sur le data warehouse — **pas du tout du signal→outbound**. Le concurrent frontal d'Orion chez Lopus n'est donc meme plus le focus de la boite.

| | Lopus (Beacon / Probe) |
|---|---|
| Categorie | Beacon : social-intent lead gen. Probe (actuel) : analytics RevOps + semantic layer |
| Data d'entree | Beacon : posts sociaux publics (Reddit/X/forums). Probe : 500+ integrations CRM/billing + Snowflake/BigQuery + transcripts/Slack (**donnees internes du client**) |
| Signaux / interpretation | Beacon : 1 seul signal (post = identity+intent), NLP/filtering, **pas de scoring** confirme. Probe : anomalies de metriques **internes**, pas de signaux d'achat externes |
| Sortie | Beacon : surface des leads + **suggere** un texte, **n'envoie pas**. Probe : dashboards/alertes |
| Role pour Orion | **INPUT faible** (flux social Beacon comme une source de plus) ; OUTPUT quasi nul (n'envoie pas). **API = NON VERIFIE** (docs.lopus.ai ne resout pas) |
| PLAFOND | Mono-source instant-t ; pas de hard-to-get ; pas de compound ; pas de velocite ; pas de grounding prospect ; pas de scoring calibre ; pas d'identite resolue/warm-path |

**Constat transversal :** les trois occupent le meme quadrant — *niveau achete + perso de surface*. Aucun ne fait les trois choses qui definissent Orion : (1) la **derivee historisee** (accelaration, pas niveau), (2) le **compound why-now verifie au contenu**, (3) le **scoring calibre sur outcomes reels + identite resolue**.

---

## 2. La couche DATA D'ENTREE d'Orion

La carte est priorisee par (valeur unique x faisabilite). Les Tiers 0/1 sont la *table stakes* (Fiber les a aussi → jamais le differenciateur). Le **Tier 2** est ce qui rend la valeur indeniable : sources difficiles, souvent gratuites, que les wrappers n'ont pas — non parce que l'API est dure, mais parce que le travail est le mapping entite→domaine→contact + le snapshot/diff + le NLP d'intent.

### Tier 0/1 — firmo de base + registres (table stakes)

| Source | Signal alimente | API / cout | Pourquoi ce n'est PAS l'edge |
|---|---|---|---|
| CSV / inbound | sujet de depart | parser / 0 | tout le monde importe un CSV |
| Apollo (org+people) | firmo, funding niveau, tech, hiring count, job-postings | inclus | data-broker commoditise, Fiber tape le meme Apollo |
| Waterfall firmo (Datagma/Hunter/Kaspr/Lusha...) | gap-fill EU email/phone | conditionnel | c'est litteralement ce que Fiber vend |
| Sirene / recherche-entreprises FR | firmo officielle FR, etat entreprise | keyless, 7 req/s, 0 | les wrappers US sont aveugles a la donnee FR souveraine |
| Pappers FR / Zefix-LINDAS CH | agregat registre FR/CH | 100cr gratuits / keyless, 0 | idem — avantage geo modere |

> Avantage local concret : Fiber/Orange Slice/Lopus sont US-centric. La couche registre FR/CH donne un sujet *plus propre que le leur* sur l'Europe — et debloque le Tier 2 souverain.

### Tier 2 — les sources HARD-TO-GET (l'edge)

| # | Source | Signal unique INTERPRETE | API / cout | Pourquoi un outil outbound ne l'a pas |
|---|---|---|---|---|
| 1 | **ATS publics JSON** (Greenhouse/Lever/Ashby) | stack reel + intent + **velocite d'embauche** par fonction (derivee) | endpoints JSON publics / **0** | ils lisent un *count* Apollo ("3 postes"), pas l'historique date → pas de derivee. Dur = mapper slug ATS→domaine + NLP de la description |
| 2 | **SEC EDGAR Form D / 8-K** | financement US **pre-annonce** (avant Crunchbase/presse) | efts.sec.gov + flux Atom / **0** | les wrappers attendent que Crunchbase publie (J+30). Orion voit a J+0. Dur = User-Agent, parse XML, CIK→domaine |
| 3 | **BODACC FR** | **job-change dirigeant** + financement FR, gratuit la ou UserGems coute 2750$/mo | Opendatasoft + recherche-entreprises / **0** | les wrappers US n'indexent pas le BODACC. Warm-signal n1 gratuit sur la France |
| 4 | **Adoption open-source** (npm/PyPI/Docker/GitHub) | **derivee d'adoption** (+40%/mois, accelere), repo pousse cette semaine | api.npmjs.org, pypistats, deps.dev / 0 | un wrapper revend un *nombre de stars*. La derivee n'existe qu'avec des snapshots historises propres |
| 5 | **Tech churn** (outil retire du stack) | **fenetre de migration** (le plus haut intent qui existe) | tech-detect diff snapshot / 0 DIY | l'historique tech est ce que BuiltWith paywalle (995$/mo). Snapshote soi-meme = gratuit et proprietaire |
| 6 | **crt.sh + DNS / sous-domaines** | **lancement produit/infra** (nouveau sous-domaine = nouvelle ligne) | crt.sh JSON, diff quotidien / 0 | personne ne correle un sous-domaine neuf a un trigger commercial |
| 7 | **Job-change champion** (warm) | warm-signal n1 (x3-5) : champion change de boite → compte cible chaud | Unipile + BODACC / ~49$/mo / 0 | les wrappers ne tissent pas le graphe relationnel du tenant. Non-achetable |
| 8 | **Investor overlap** (warm) | diligence partagee → intro chaude, ne perime jamais | cap-table tenant ∩ Apollo investor_names / 0 | aucun wrapper ne connait le cap-table du client |
| 9 | **PQL first-party** (si surface produit) | activation/aha/limite free/visite pricing — seul person-level RGPD-safe | PostHog/Segment / 0 | les wrappers vendent du person-level achete (RGPD-fragile EU) ; le first-party consenti est propre |

**Principe de priorisation :** plafonner a 3-5 signaux *actionnables*, exiger **convergence 2+ sources** avant haute-priorite, classer par correlation closed-won — l'inverse du reflexe wrapper ("plus de sources = mieux").

---

## 3. La table de VALEUR des signaux (le coeur)

Legende : oui = capacite native / non = absent / partiel = brut ou indirect. La colonne decisive est la derniere : **ce qu'Orion fait que personne d'autre ne fait** (why-now source, scoring calibre, do-not-claim).

| Signal | Fiber AI | Orange Slice | Lopus | Orion | Interpretation d'Orion (le delta decisif) |
|---|---|---|---|---|---|
| Firmo de base | oui | oui | non | oui | identite **resolue** cross-source (un seul sujet), pas une ligne de plus |
| Funding via Crunchbase | oui | oui (PredictLeads) | non | oui | source, mais Orion y **ajoute** la pre-annonce ci-dessous |
| Funding **SEC Form D** (pre-annonce) | non | non | non | **oui** | vu a J+0 (avant Crunchbase J+30) ; lie CIK→domaine, date, cite |
| Funding **BODACC FR** | non | non | non | **oui** | financement + job-change dirigeant FR, gratuit, souverain |
| Hiring (count) | oui | oui (PredictLeads) | non | oui | au-dela du count : ATS JSON parse + NLP de la description |
| Hiring **velocite** (ATS publics, derivee) | non | non | non | **oui** | "+4 roles Kafka en 3 sem, accelere" — calculable seulement avec snapshots propres |
| Job-change (perso surveillee) | partiel (job-change lists) | non | non | oui | + warm-path : le champion devient un compte chaud (x3-5) |
| Tech-stack (technographics) | oui (BuiltWith) | oui (BuiltWith) | non | oui | source, mais Orion y ajoute le churn ci-dessous |
| **Tech-churn** (outil retire, fenetre de migration) | non | non | non | **oui** | diff temporel proprietaire = l'intent le plus haut qui existe |
| Adoption open-source (GitHub/npm/PyPI, derivee) | partiel (GitHub lookup) | non | non | **oui** | "+40%/mois" et non "X stars" — derivee non-achetable |
| crt.sh / sous-domaines (lancement infra) | non | non | non | **oui** | correle un sous-domaine neuf a un trigger commercial |
| Intent social (Reddit/X) | partiel (live social) | partiel (Reddit/HN brut) | oui (Beacon) | oui (via ingestion) | Orion **verifie + score + combine** le flux ; les autres le livrent brut |
| Investor-overlap / warm-path | non | non | non | **oui** | cap-table ∩ investisseurs + graphe relationnel du tenant |
| **Compound why-now** (3+ sources → 1 preuve datee) | non | non | non | **oui** | la synthese sourcee HEAD-verifiee — aucun autre ne la produit |
| Scoring calibre (signal x fit x access, multipliers appris) | non | non | non | **oui** | probabilite de win calibree sur les closed-won du tenant |
| **Grounding** citableFacts[] / doNotClaim[] | non | non | non | **oui** | la couche anti-hallucination livree comme DONNEE au sender |
| Sortie = BRIEF d'intelligence | non (rows) | non (cellules/mail) | non (suggestion) | **oui** | le livrable est un verdict priorise et source, pas des lignes |

Lecture visuelle : sur les 8 dernieres lignes (de SEC Form D a BRIEF), **Orion est seul** — c'est exactement la zone que les trois ne peuvent pas occuper en restant des agregateurs.

---

## 4. La valeur ajoutee, evidente

Quatre cas same-company. A gauche, ce qu'un agent outbound produit **seul** avec Fiber/Orange Slice/Lopus. A droite, ce qu'il produit **avec le brief Orion**.

**Cas 1 — Acme, scale-up data US.**
- *Sans Orion (Fiber)* : webhook "Acme a poste 3 jobs" + une ligne enrichie (CEO + email, 0% bounce). L'agent ecrit : *"Vu que vous recrutez, on peut vous aider a scaler."* Generique, non date, faux risque ("vous recrutez" = count Apollo).
- *Avec Orion* : brief = *Form D depose mars (SEC, URL) + 4 roles Kafka/streaming sur Greenhouse en 3 semaines (ATS, accelere) + retrait de [concurrent] du stack (tech-churn) → fenetre de migration MAINTENANT.* citableFacts = {round date, roles, outil retire, tous verifies HEAD} ; doNotClaim = {montant du round non confirme}. L'agent ecrit un opener date, source, factuellement sur. **Le delta : un why-now compose qu'aucun signal isole ne donne.**

**Cas 2 — startup FR, PME.**
- *Sans Orion (Orange Slice)* : colonne PredictLeads vide (couverture FR faible), perso LLM par ligne qui invente un "contexte" plausible mais non source → risque d'hallucination, aucun garde-fou.
- *Avec Orion* : BODACC = changement de dirigeant (nouveau DG, date, URL) + recherche-entreprises a jour. Brief : *"nouveau DG depuis [date], premiers 90 jours = fenetre d'achat."* L'agent FR ecrit juste, sur une source souveraine **qu'Orange Slice n'ingere pas**.

**Cas 3 — editeur dev-tools.**
- *Sans Orion (Lopus Beacon)* : un post Reddit "je cherche une alternative a X" matche l'ICP → suggestion de texte, a l'utilisateur d'ecrire et d'envoyer. Mono-source, instant-t, non verifie.
- *Avec Orion* : ce meme post Reddit **plus** +40%/mois de downloads npm (derivee) + un sous-domaine `app.` apparu cette semaine (crt.sh). Compound : *"adoption en acceleration + lancement produit imminent + intent exprime."* priority_score calibre. **Le delta : Lopus donne 1 post ; Orion donne la convergence datee et priorisee.**

**Cas 4 — n'importe quel compte, cote securite.**
- *Sans Orion* : le sender (y compris Fiber/Orange Slice eux-memes) peut citer un chiffre approximatif ou contacter un opt-out — rien ne l'en empeche.
- *Avec Orion* : doNotClaim[] + evaluateSend comme oracle d'eligibilite rendent l'agent **incapable** d'inventer (rien hors citableFacts) ou de contacter un interdit. On rend n'importe quel sender meilleur ET sur.

---

## 5. Coopetition : exporter vers eux ET les depasser

**Le positionnement est amont, pas frontal.** Orion ne se bat ni sur l'enrichissement contact brut (Fiber est 4-10x moins cher avec 0% bounce — inutile de le concurrencer la), ni sur l'execution spreadsheet (Orange Slice), ni sur l'analytics interne (Probe). Orion detient la couche **non-commoditisable** : signal→brief.

**Le pont d'export (on les rend meilleurs).**
- **Vers Fiber** : Orion consomme Fiber comme tap d'enrichissement + flux de signaux bruts (job-change, Tracker, live LinkedIn/GitHub) via un `FiberDataPort` / `FiberSignalIngestor`, et peut **repousser** une audience resolue+scoree vers `createAudience`/`addTrackerCompanies` pour surveillance continue. Le brief, lui, **ne va pas a Fiber** (il ne sait pas envoyer) — il va a l'agent outbound.
- **Vers Orange Slice** : Orion pousse le brief comme **custom fields** dans une sheet via webhook entrant (`why_now`, `citable_facts`, `do_not_claim`, `angle`, `priority_score`) → ses colonnes/sequences deviennent pertinentes et sures, la ou elles n'avaient que de la data brute. Interop propre. (Mecanisme exact = SUPPOSE, a valider avec une cle.)
- **Vers Lopus** : fit faible (n'envoie pas) ; au mieux Beacon fournit un flux social qu'Orion verifie/score/combine. Traiter Lopus comme source best-effort, jamais comme dependance (API NON VERIFIEE).
- **Vers Instantly / agent Elevay** : export via `toInstantlyCustomVariables` ou brief imbrique generique.

**Le moat non-copiable.** Le code de chaque moteur se copie en un weekend ; ce qui ne se copie pas est **ce que le code alimente dans le temps** :
1. **Donnees historisees proprietaires** — la derivee (velocite, tech-churn, adoption) n'existe qu'avec l'historique snapshote. Un entrant demarre avec un retard egal a tout l'historique accumule. Irrattrapable retroactivement.
2. **Identite resolue** construite du corpus du tenant — sans corpus, le clustering rend des clusters vides.
3. **Outcomes calibres** — multipliers appris sur les vrais closed-won + pool anonymise cross-reseau. Aucune API ne contient ces labels.
4. **Graphe warm-path** — tisse du reseau propre du tenant ; multiplicateur x3-5, non-achetable.
5. **Grounding compose verifie-au-contenu** — pas un prompt, une integration research→brief→gate→score ou chaque fait est HEAD-verifie et content-matche.

La phrase pour le founder : *Fiber/Orange Slice/Lopus revendent un niveau achete au meme prix que leurs concurrents. Orion produit le sens date, la derivee, le sujet resolu et la probabilite calibree — quatre choses qu'on ne peut pas acheter, seulement accumuler. Le moat n'est pas le code ; c'est le flywheel que le code alimente. Et le pont d'export transforme la coopetition en distribution : ils deviennent les consommateurs de la couche d'intelligence amont qu'aucun d'eux ne produit.*

---

## 6. Risque & verification

Avant de s'engager sur une integration, points a confirmer en live (honnete sur ce qu'on ne sait pas) :

- **Fiber AI.** FAIT VERIFIE : pivot, API publique (200+ ops, MCP, webhooks Tracker, contact reveal cascade), auth `x-api-key`. A CONFIRMER : les **noms exacts des regles Tracker** (`GET /v1/tracker/rules`, appel authentifie requis) — donc le perimetre reel des signaux ; le **pricing contractuel** (chiffres $300/$900/$2400 et credits viennent de repertoires tiers) ; la latence/qualite reelle du flux de signaux vs la fraicheur snapshot annoncee. Mitigation : `FiberSignalIngestor` generique qui normalise n'importe quel payload vers le schema `signals` d'Orion → aucune casse si la taxonomie differe.
- **Orange Slice.** FAIT VERIFIE : positionnement, providers, SDK TS, webhooks entrants, sync CRM. A CONFIRMER en live avec une cle : **endpoints exacts, schema d'auth, helper `webhook.addRootFieldsToSheet`, "unlimited API requests / Zapier"** (docs rendues en JS, non lues mot-a-mot). Risque produit : equipe 2 personnes (key-person risk), accessibilite TypeScript-only.
- **Lopus.** A CONFIRMER en priorite : **existence d'une API** — `docs.lopus.ai` ne resout pas, aucune doc publique trouvee ; seule mention = "API access" dans le tier Pro de Probe (non confirme). Le `LopusPort` propose est explicitement hypothetique (schema de champs Beacon = SUPPOSE). Traiter Lopus comme source best-effort, jamais comme dependance critique. Noter aussi que Beacon est **deprioritise** cote Lopus — partenariat possiblement non maintenu.
- **General.** Re-confirmer cote contrat tout chiffre de scale/fraicheur/pricing (sources tierces). Pour les sources hard-to-get net-new d'Orion (SEC, BODACC, crt.sh, npm/PyPI), valider les contraintes operationnelles (User-Agent SEC obligatoire, latence crt.sh, mapping repo→entreprise) avant de promettre la couverture.