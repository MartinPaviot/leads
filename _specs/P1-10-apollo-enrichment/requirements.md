# P1-10 — Apollo firmographic/funding enrichment dans le brief de recherche

## Note importante (verite du code post-P0, ancree file:line — verifie 2026-06-22)

Le grounding d'audit est en grande partie perime. **Apollo n'est PAS un gap** : tout le tissu d'enrichissement existe deja, teste, en prod.

Ce qui EXISTE deja (NE PAS re-specifier) :

- **Client REST Apollo complet.** `app/apps/web/src/lib/integrations/apollo-client.ts:1-319` — `enrichOrganization(domain)` (`:84-91`), `enrichPerson(...)` (`:125-155`), `searchPeople` (`:164-180`), `searchOrganizations` (`:268-275`). Auth `X-Api-Key` (`:26`), circuit breaker `APOLLO_CIRCUIT` (`:6`, `:20`), gestion 403 plan-level (`:36-42`). Le type `ApolloOrganization` porte deja `total_funding`, `latest_funding_stage`, `latest_funding_raised_at`, `estimated_num_employees`, `annual_revenue`, `technology_names`, `investor_names`, `num_current_job_openings` (`:52-82`). **Le grounding "client REST Apollo + cle dediee, 4-5j" est faux : c'est deja construit.**
- **Waterfall company-enrichment avec Apollo en palier 10.** `app/apps/web/src/lib/providers/company-enrichment/` : `enrichCompany(input, ctx)` (`waterfall.ts:148-192`) orchestre Apollo(10) → SIRENE(15) → Zefix(16) → Datagma/Firmable/Crunchbase(20) → Hunter(30) → LLM(100) (`register-defaults.ts:29-42`), avec geo-routing (`waterfall.ts:41-50`) et early-exit saturation (`waterfall.ts:59-68`). **Le grounding "PROPOSITION: creer apollo-enrich.ts comme premier palier d'un waterfall (fallback vers scrapers maison)" est DEJA livre** — l'adapter est `apollo-adapter.ts:27-109`, priorite 10.
- **Provenance PAR-CHAMP deja modelisee.** `ProvenanceEntry { provider, field, atIso }` (`types.ts:103-107`), `WaterfallResult.provenance` peuplee a chaque merge (`waterfall.ts:176-180`). **Le grounding "stocker la provenance Apollo par-champ (necessite ajout au schema)" est a moitie fait** : le moteur produit la provenance, mais elle n'est PAS persistee dans le brief (voir gap ci-dessous).
- **Funding/headcount deja exposes pour les triggers signal.** `ApolloOrganization.num_current_job_openings`/`investor_names`/`latest_funding_raised_at` (`apollo-client.ts:64-82`) alimentent deja les filtres signal de `searchOrganizations` (`apollo-client.ts:205-226`).
- **Le brief consomme deja par P0-2.** `ResearchBriefContext` (`prospect-context.ts:27-33`), lu read-only depuis le cache (`prospect-context.ts:179-193`), rendu au LLM (`prospect-context.ts:332-342`).

Le GAP REEL, etroit et boilable :

1. **Le pipeline du brief de recherche n'appelle JAMAIS le waterfall d'enrichment.** `fetchAllSources(domain, linkedinUrl, companyName)` (`build-intelligence-brief.ts:186-235`) ne lance que `scrapeCompanyWebsite`/`scrapeJobPostings`/`detectTechStack`/`fetchRecentNews`/`fetchLinkedInActivity` (`:198-207`). `grep apollo` dans `campaign-engine/sources/` = 0. Le brief synthetise par `synthesizeBrief` (`build-intelligence-brief.ts:54-69`) ne recoit AUCUN fait firmographique/funding Apollo — il ne voit que `company.industry/size` deja en base (`:64-67`).
2. **Le brief ne porte aucune provenance par-champ.** Le row `intelligenceBriefs` (`db/schema/campaign.ts:22-53`) n'a ni colonne `firmographics` ni `firmographic_provenance`. `IntelligenceBrief` (`types.ts:1-23`) n'a aucun champ provenance. Donc P1-11 (citations) n'a aucune source attribuable pour les facts firmographiques/funding.
3. **`ResearchBriefContext` n'expose ni firmographics enrichies ni provenance.** `prospect-context.ts:27-33` = `bestAngle/painPoints/competitorDetected/publicContent/warmthSignals`. Le LLM de generation ne voit donc le funding que via `props.total_funding` du row company (`prospect-context.ts:168-172`), pas via le brief, et sans citation.

Correction au grounding sur le chemin "agent-callable tools" : les tools MCP Apollo (`apollo_organizations_enrich`, etc.) sont **agent-callable** et un agent de recherche P1-9 generique n'existe PAS encore dans ce repo (aucun `lib/agents/research-agent.ts` ; les agents existants sont `orchestrator.ts`/`agent-registry.ts`, hors-perimetre). Reposer P1-10 sur un agent P1-9 inexistant est un couplage fantome. Le chemin propre ET livrable aujourd'hui est : brancher le **waterfall existant** (`enrichCompany`) dans `fetchAllSources`, dont Apollo est deja le palier 10. C'est le MVP. L'option "exposer apollo-enrich comme tool de l'agent P1-9" est flaguee HORS SCOPE (ocean — depend d'un agent non livre).

## Scope

On construit (MVP boilable) :
- Branchement du waterfall `enrichCompany` (`waterfall.ts:148`) comme source supplementaire dans `fetchAllSources` (`build-intelligence-brief.ts:186-235`), soft-fail comme les autres sources.
- Persistance des facts firmographiques/funding enrichis ET de leur provenance par-champ dans le row `intelligenceBriefs` (2 colonnes jsonb additives + ALTER idempotent).
- Extension de `IntelligenceBrief` (`types.ts:1-23`) et `ResearchBriefContext` (`prospect-context.ts:27-33`) avec les firmographics enrichies + provenance.
- Rendu firmographique enrichi (avec provenance par-champ) dans `formatContextForPrompt` (`prospect-context.ts:310-384`) et dans `toResearchBriefContext` (`build-intelligence-brief.ts:150-162`).
- Budget : 0 credit en cas de cache-hit du brief (`getCachedBrief` court-circuite tout, `build-intelligence-brief.ts:26-29`) ; le waterfall n'est appele qu'au build froid.

On ne reconstruit PAS :
- Le client Apollo, l'adapter Apollo, le waterfall, les criteres, la provenance moteur (existent, intacts — `apollo-client.ts`, `apollo-adapter.ts`, `waterfall.ts`, `criteria.ts`, `types.ts`).
- `synthesizeBrief` / le scraping website/news/jobs/tech/linkedin (`build-intelligence-brief.ts:54-69`, `sources/*`).
- Le wiring P0-2 brief→prompt (`prospect-context.ts:179-193`, `:332-342`).
- Le contact-enrichment waterfall (`providers/contact-enrichment/*`), hors-perimetre.

## Exigences (EARS)

### Enrichment dans le brief

- **R1** — WHEN `buildIntelligenceBrief(companyId, tenantId, contactId?)` construit un brief FROID (cache-miss, `build-intelligence-brief.ts:26-29`) ET que `company.domain` est non nul, THE SYSTEM SHALL appeler `enrichCompany({ domain, name }, { tenantId })` (`waterfall.ts:148`) en source additionnelle de `fetchAllSources` (`:186-235`).
- **R2** — IF `company.domain` est nul, THEN THE SYSTEM SHALL ne pas appeler le waterfall et laisser les firmographics enrichies a `null` (le waterfall exige un domaine pour Apollo — `apollo-adapter.ts:40-49`).
- **R3** — WHEN le waterfall retourne un `WaterfallResult` (`types.ts:109-116`), THE SYSTEM SHALL extraire dans le brief les champs firmographiques/funding : `industry`, `description`, `employeeCount`, `sizeRange`, `annualRevenue`, `revenueRange`, `foundedYear`, `city`, `state`, `country`, `fundingStage`, `totalFunding`, `investors`, `technologies` (sous-ensemble de `EnrichedCompany`, `types.ts:11-33`).
- **R4** — WHEN le waterfall retourne `provenance` (`waterfall.ts:179`), THE SYSTEM SHALL persister la provenance par-champ `{ field, provider, atIso }` dans le brief, restreinte aux champs effectivement remplis (R3).
- **R5** — IF `enrichCompany` rejette OU retourne `enriched === false` (`waterfall.ts:190`), THEN THE SYSTEM SHALL incrementer `sourceErrors` (`build-intelligence-brief.ts:191-223`) avec `source: "firmographics"` et poursuivre la synthese sans firmographics enrichies (soft-fail, comme les autres sources `:214-222`).
- **R6** — THE SYSTEM SHALL borner l'appel waterfall par un timeout via `withTimeout` (`lib/utils/with-timeout.ts`, livre en P0) avec defaut 6000 ms, et traiter le depassement comme un soft-fail (R5).

### Persistance + schema

- **R7** — THE SYSTEM SHALL ajouter au schema `intelligenceBriefs` (`db/schema/campaign.ts:22-53`) deux colonnes jsonb additives : `firmographics jsonb DEFAULT NULL` et `firmographic_provenance jsonb DEFAULT '[]'::jsonb`, sans casser les colonnes existantes.
- **R8** — WHEN un brief est upserte (`build-intelligence-brief.ts:99-106`), THE SYSTEM SHALL ecrire `firmographics` (objet plat des champs R3) et `firmographicProvenance` (tableau R4) dans le `set`/`values`.
- **R9** — THE SYSTEM SHALL scoper toute lecture/ecriture du brief par `tenantId` + `companyId` (+ `contactId` quand disponible), identique a `getCachedBrief` (`build-intelligence-brief.ts:116-123`) — aucun changement de tenant-scoping.

### Exposition vers la generation

- **R10** — THE SYSTEM SHALL etendre `IntelligenceBrief` (`types.ts:1-23`) d'un champ `firmographics: FirmographicFacts | null` et `firmographicProvenance: FieldProvenance[]`, mappes dans `rowToBrief` (`build-intelligence-brief.ts:237-261`).
- **R11** — THE SYSTEM SHALL etendre `ResearchBriefContext` (`prospect-context.ts:27-33`) d'un champ optionnel `firmographics?: { facts: FirmographicFacts; provenance: FieldProvenance[] }`, peuple par `toResearchBriefContext` (`build-intelligence-brief.ts:150-162`).
- **R12** — WHERE `ctx.researchBrief.firmographics` est defini, THE SYSTEM SHALL emettre dans `formatContextForPrompt` (`prospect-context.ts:310-384`) une section `FIRMOGRAPHICS (verified)` listant les facts non-nuls avec leur provider source (ex `- Funding: Series A ($12M) [source: apollo]`).
- **R13** — IF `ctx.researchBrief.firmographics` est `undefined`, THEN `formatContextForPrompt` SHALL produire exactement la sortie firmographique actuelle (aucune section vide), preservant le comportement P0-2.

### Budget / idempotence / non-regression

- **R14** — WHEN un brief NON expire existe en cache (`getCachedBrief`, `build-intelligence-brief.ts:26-29`), THE SYSTEM SHALL NE PAS appeler le waterfall (0 credit Apollo), rendant l'enrichment idempotent dans la fenetre TTL 14 j (`build-intelligence-brief.ts:17`).
- **R15** — THE SYSTEM SHALL NOT modifier l'ordre/le contenu des autres sources de `fetchAllSources` (`:198-207`) ni le contrat de `synthesizeBrief` (`:54-69`).
- **R16** — THE SYSTEM SHALL NOT appeler le waterfall depuis `readCachedBrief` (`build-intelligence-brief.ts:141-147`) ni depuis `buildProspectContext` (`prospect-context.ts:104`) — l'enrichment reste dans le build froid uniquement (lecture cache pure cote generation, R14).
- **R17** — THE SYSTEM SHALL NOT exposer le payload `raw` Apollo (`apollo-adapter.ts:98`) au LLM ni a `ResearchBriefContext` (forensic seulement, jamais rendu).

## Criteres d'acceptation

- **AC1** (R1) — GIVEN une company avec `domain`, WHEN `buildIntelligenceBrief` construit un brief froid, THEN `enrichCompany` est appele 1x avec `{ domain, name }` et `{ tenantId }`. (NON IMPLEMENTE — `fetchAllSources` `:198-207` ne contient aucun appel waterfall.)
- **AC2** (R2) — GIVEN une company sans `domain`, WHEN le brief est construit, THEN `enrichCompany` n'est PAS appele AND `brief.firmographics === null`. (NON IMPLEMENTE.)
- **AC3** (R3/R4) — GIVEN un waterfall qui remplit `industry/employeeCount/fundingStage/totalFunding`, WHEN le brief est construit, THEN `brief.firmographics` porte ces 4 champs AND `brief.firmographicProvenance` contient une entree `{ field, provider, atIso }` par champ rempli. (NON IMPLEMENTE.)
- **AC4** (R5) — GIVEN un waterfall qui throw, WHEN le brief est construit, THEN `brief.sourceErrors` contient `{ source: "firmographics", error }` AND le brief est quand meme persiste avec les autres sources. (NON IMPLEMENTE — soft-fail existe pour les 5 sources actuelles `:214-222`, a etendre.)
- **AC5** (R6) — GIVEN un waterfall qui depasse 6000 ms, WHEN le brief est construit, THEN l'appel est abandonne en soft-fail AND le build du brief ne depasse pas le budget des autres sources. (NON IMPLEMENTE.)
- **AC6** (R7/R8) — GIVEN la table `intelligence_briefs`, WHEN on inspecte le schema, THEN les colonnes `firmographics` et `firmographic_provenance` existent AND un upsert ecrit les deux. (NON IMPLEMENTE — `db/schema/campaign.ts:22-53` n'a pas ces colonnes.)
- **AC7** (R12) — GIVEN `ctx.researchBrief.firmographics` avec `fundingStage="Series A"` source `apollo`, WHEN `formatContextForPrompt` s'execute, THEN la sortie contient `FIRMOGRAPHICS (verified)` et une ligne `Funding: Series A ... [source: apollo]`. (NON IMPLEMENTE.)
- **AC8** (R13) — GIVEN `ctx.researchBrief.firmographics === undefined`, WHEN `formatContextForPrompt` s'execute, THEN la sortie est byte-identique a la sortie post-P0-2 actuelle (test snapshot). (Garanti par non-regression.)
- **AC9** (R14) — GIVEN un brief en cache non expire, WHEN `buildIntelligenceBrief` est rappele, THEN `enrichCompany` n'est PAS appele (0 credit). (Cache-hit DEJA IMPLEMENTE dans `build-intelligence-brief.ts:26-29` — garantir qu'il court-circuite AVANT le nouveau code waterfall.)
- **AC10** (R16) — GIVEN `buildProspectContext`, WHEN il lit le brief (`prospect-context.ts:179-193`), THEN aucun appel waterfall/Apollo n'est emis. (Read-only DEJA IMPLEMENTE `prospect-context.ts:182-189` — non-regression, le nouveau code ne doit pas s'y glisser.)
- **AC11** (R17) — GIVEN un brief enrichi, WHEN on inspecte `ResearchBriefContext`, THEN aucun champ ne contient le payload `raw` Apollo. (NON IMPLEMENTE — a garantir dans `toResearchBriefContext`.)

## Edge cases exhaustifs

1. **Domaine present mais Apollo 403 (plan free, 75 credits/mois).** `apollo-adapter` propage l'erreur (`apollo-client.ts:36-43`) → waterfall capture en attempt non-ok (`waterfall.ts:208-217`), passe au palier suivant (SIRENE/LLM). Si tous echouent, `enriched=false` → soft-fail R5. Le brief reste valide.
2. **Quota Apollo epuise en milieu de batch.** Circuit breaker `APOLLO_CIRCUIT` (`apollo-client.ts:6`) ouvre apres N echecs ; le waterfall skip Apollo et tombe sur le palier suivant. Aucune exception remontee au build du brief.
3. **Waterfall reussit mais ne remplit que `description` (LLM-fallback).** `firmographicProvenance` ne contient que `{ field: "description", provider: "llm-fallback" }`. La section `FIRMOGRAPHICS (verified)` ne liste que ce champ. Pas de funding cite si non source.
4. **Provider remplit un champ deja present dans le row company.** Le waterfall merge "first non-null wins" (`waterfall.ts:101-112`) ; `firmographics` reflete la valeur waterfall, pas le row company. Pas de double-source : provenance pointe le provider waterfall, pas la DB.
5. **`totalFunding` present mais `fundingStage` null.** La ligne de rendu affiche le montant sans stage (`Funding: $12M [source: apollo]`). Pas de "null" textuel.
6. **Brief contact-level vs company-level.** Le waterfall est company-only (domaine) → `firmographics` identiques pour tous les contacts d'une meme company. L'unique index `(tenantId, companyId, contactId)` (`campaign.ts:51`) permet des rows distincts ; chaque upsert re-ecrit les memes firmographics — acceptable (idempotent).
7. **`forceRefresh: true`.** Court-circuite le cache (`build-intelligence-brief.ts:26`) → waterfall rappele → consomme 1 credit Apollo. Documenter : `invalidateBrief` (`:263-268`) + refresh = 1 credit.
8. **Migration non appliquee en prod (colonnes absentes).** L'upsert sur colonnes inexistantes throw au runtime malgre un build vert (cf. memoire "Prod schema behind Drizzle"). Le code DOIT degrader : si l'ecriture firmographics echoue, log + persister le reste du brief (try/catch autour du seul payload firmographics, ou feature-flag `BRIEF_FIRMOGRAPHICS` off par defaut tant que migration non appliquee).
9. **Investors array > 20.** Le waterfall cape deja a 20 (`waterfall.ts:124`). `firmographics.investors` herite du cap.
10. **`description` Apollo identique au `websiteSummary` synthetise.** Pas de dedup — ce sont deux champs distincts (firmographic verifie vs synthese LLM). Le LLM de generation voit les deux ; acceptable.
11. **Concurrence : deux builds froids simultanes meme company.** `onConflictDoUpdate` (`build-intelligence-brief.ts:102-105`) sur l'unique index gere la course ; le dernier write gagne, firmographics coherentes.
12. **Geo non-US (.fr/.ch).** Le geo-routing (`waterfall.ts:157-161`) boost SIRENE/Zefix/Datagma avant Apollo ; `firmographics` peut etre source SIRENE et non Apollo. La provenance le reflete fidelement (P1-10 ne force pas Apollo, il branche le waterfall).

## Hors scope

- **[OCEAN A FLAGUER] Exposer apollo-enrich comme tool d'un agent de recherche P1-9.** Aucun agent de recherche P1-9 n'existe (`lib/agents/` = orchestrator/registry generiques). Refactorer le pipeline brief (sources fixes → tools agent-callable) est une reecriture architecturale, pas un lake. A tracker en P1-9 puis P1-10b si l'agent atterrit.
- **People-enrichment (apollo_people_match) dans le brief.** Le contact est deja enrichi ailleurs (`providers/contact-enrichment/apollo-adapter.ts`). Le brief reste company-firmographic. Hors-perimetre.
- **Citations P1-11.** P1-10 PRODUIT la provenance par-champ (la donnee dont P1-11 a besoin) ; le rendu citation dans l'UI/les drafts est P1-11.
- **Nouveau provider / nouvelle cle Apollo dediee.** Cle `APOLLO_API_KEY` existante (`apollo-client.ts:11`). Aucune nouvelle dependance.
- **Modification des criteres a-la-carte** (`criteria.ts`) ou de l'UI accounts. P1-10 ne touche que le brief.
