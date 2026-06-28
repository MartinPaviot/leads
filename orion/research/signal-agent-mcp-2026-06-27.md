# Signaux agent-natifs — ingestion -> composition -> MCP -> outreach

## 0. Résumé exécutif

La vision : un signal d'achat doit être **agent-natif** de bout en bout. L'entrée est indifférente (un CSV de 1000 lignes OU N providers d'API) ; le système **résout l'identité, compose les champs par précédence multi-source, acquiert les signaux, score**, puis **ressort par MCP** une surface que n'importe quel agent (Claude Desktop, Cursor, in-product) consomme pour faire de l'outreach optimal — sans jamais réécrire de logique métier ni court-circuiter les gates d'envoi.

Ce qui existe **déjà** :
- Un serveur MCP fonctionnel — JSON-RPC 2.0 sur `POST /api/mcp`, 12 outils (`app/apps/web/src/app/api/mcp/route.ts:19`), dispatch (`route.ts:293`), Bearer `mcp_*`, tenant-scope via auth.
- La waterfall d'enrichissement N-providers geo-routée, merge first-non-null (`lib/providers/company-enrichment/waterfall.ts:148`, merge `:77`).
- La résolution d'identité + précédence (`db/canonical/upsert.ts:108`, `identity.ts:67`, `precedence.ts:9` `pickWinner:53`).
- Le sink de signaux (`lib/signals/record-signal.ts:86`), les scorers (`icp/fit-recompute-core.ts:140`, `scoring/priority-score.ts:70`), la génération d'opener grounded (`lib/scoring/signal-opener.ts:79`/`:162`), la stack de gates fail-closed (`lib/guardrails/sending-gate.ts:212`), l'approval HITL (`inngest/signal-to-sequence.ts:248`).
- L'import CSV mappé par Haiku (`app/api/import/smart/route.ts:141`/`:256`).

Ce qui **manque** pour être agent-natif (NET-NEW, tout additif) :
1. Un **adaptateur d'entrée unifié** (`IngestItem`/`IngestSource`) + un **orchestrateur durable** Inngest, pour que CSV et providers convergent vers le même pipeline idempotent. L'import CSV insère aujourd'hui **brut** : pas de dedup, pas d'identité, pas de signaux (`route.ts:57-101`).
2. Les **outils MCP d'ingestion** (`ingest_csv`, `ingest_from_provider`, `get_ingest_job`) et **d'outreach** (`find_prospects`, `get_signals`, `explain_priority`, `draft_outreach`, `evaluate_send`, `send_message`, `enroll_in_sequence`) — des wrappers fins.
3. Les **signaux agent-natifs côté protocole** : `annotations` (readOnly/destructive), `outputSchema` + `structuredContent`, `resources` (le « dossier prospect ») — absents des 12 outils actuels (`route.ts:957` ne renvoie qu'un blob texte).
4. Deux **hookpoints de provenance/signal** post-enrichissement (`inngest/functions.ts:~220`, `agentic-executor.ts:~240`), gap connu (mémoire #455 : « no signals flow on a cold TAM »).

La base d'analyse signal (taxonomie, compound agent, deep-tech) est dans `_reports/signals-world-class-2026-06-27.md`, `_reports/signal-intelligence-design-2026-06-27.md`, `_reports/signal-deep-tech-2026-06-27.md` — non répétée ici. Ce document couvre la **plomberie agent-native** : ingestion -> composition -> MCP -> outreach.

---

## 1. Le pipeline de bout en bout

```
                    SOURCES (interface IngestSource — NET-NEW lib/ingest/types.ts)
   ┌───────────────────────────────────────────────────────────────────────┐
   │  CSV 1000 lignes            API providers (1..N)                        │
   │  csvSource(text)            apolloPeopleSource / apolloOrgsSource /      │
   │                             waterfallSource(seeds)                      │
   └──────────────┬────────────────────────────┬───────────────────────────┘
                  │  pull() paginé → IngestItem[]  (SEUL point spécifique-source)
                  ▼
   ┌── ORCHESTRATEUR DURABLE  inngest/ingest-run.ts (NET-NEW, clone custom-signal-backfill.ts:29) ──┐
   │                                                                                                │
   │  [1] IDENTITY-RESOLVE   upsertAccount/upsertContact   db/canonical/upsert.ts:108 / :223        │
   │      dedup: accountMatchPlan registry→domain→name     db/canonical/identity.ts:67 / :125       │
   │            findAccountMatch (insert-ou-merge)         db/canonical/upsert.ts:60                 │
   │                          │                                                                      │
   │  [2] COMPOSE (firmo)     enrichCompany waterfall       waterfall.ts:148 ; merge first-non-null  │
   │      geo-routing TLD     mergePartial / isSaturated    waterfall.ts:77 / :181                   │
   │      COMPOSE (par champ) account_field_source +        upsert.ts:171 ; recompute :180           │
   │      précédence          PROVIDER_RANK / pickWinner    precedence.ts:9 / :53                     │
   │                          │                                                                      │
   │  [3] ACQUIRE SIGNALS     recordCompanySignal           signals/record-signal.ts:86              │
   │      (rawSignals → JSONB properties.signals[])         SignalEntry record-signal.ts:38          │
   │                          │                                                                      │
   │  [4] SCORE (ciblé)       scoreCompanyBatch (fit ICP)   icp/fit-recompute-core.ts:140            │
   │      signal×fit×access   computePriorityScore          scoring/priority-score.ts:70             │
   │                          bestMultiplierForCompany      cron signal-score-daily.ts:70            │
   └──────────────────────────────────┬─────────────────────────────────────────────────────────┘
                                       ▼
   ┌── SURFACE MCP  app/api/mcp/route.ts ──────────────────────────────────────────────────────────┐
   │  OUTILS (dispatch handleTool :293, retour structuredContent :957)                              │
   │    find_prospects · get_signals · explain_priority · draft_outreach · evaluate_send ·          │
   │    send_message · enroll_in_sequence   (+ ingest_csv · ingest_from_provider · get_ingest_job)   │
   │  RESOURCES (NET-NEW capabilities :926)  crm://company/{id}/dossier · crm://policy/sending-rules │
   └──────────────────────────────────┬─────────────────────────────────────────────────────────┘
                                       ▼
                          AGENT EXTERNE (Claude/Cursor/in-product)
                                       │  enchaîne les outils (action-ready, grounded)
                                       ▼
   ┌── OUTREACH SOUS GATES (chemin d'EXÉCUTION, hors du chemin de décision de l'agent) ─────────────┐
   │  evaluateSend  8 gates fail-closed  sending-gate.ts:212                                        │
   │    opt-out :216 → suppression DB :240 → email-status :258 → lawful-basis :270 →                 │
   │    deliverability :283 → targeting SAFE_MODE :301 → identity/cold/cap :324                       │
   │  enforceAgentApprovalMode (outbound → confirm:always)  signal-to-sequence.ts:248                │
   └────────────────────────────────────────────────────────────────────────────────────────────┘
```

L'invariant structurel : l'agent **pilote quoi tenter** (étapes 1-4 produisent des décisions) ; il ne **décide jamais si ça passe** (les gates sont dans le corps des wrappers, inatteignables depuis le JSON-RPC).

---

## 2. Ingestion + composition

### 2.1 Le contrat unifiant (NET-NEW `lib/ingest/types.ts`)

Le point pivot : **CSV-row et provider-record convergent vers le même tuple `IngestItem`**, qui est exactement la forme consommée par `upsertAccount`/`upsertContact` (`upsert.ts:108`/`:223`). Une source ne sait rien de l'aval ; elle ne fait que produire des `IngestItem` par pages.

```ts
export interface IngestItem {
  kind: "company" | "person";
  identity: {                       // → accountMatchPlan / contactMatchPlan (identity.ts:67/:125)
    domain?; name?; country?; siren?; siret?; uid?;     // account
    email?; linkedinUrl?; firstName?; lastName?; companyRef?;  // person
  };
  fields: Partial<Record<"industry"|"size"|"revenue"|"description"|"title"|"phone", string|null>>;
  vendorIds?: Record<string,string>;  // side-map, JAMAIS dans l'identité (upsert.ts AC4)
  rawSignals?: Array<{ type; detectedAt; strength?; detail? }>;  // → recordCompanySignal
  sourceRef: string;                  // 'row:42' | apollo id → dédup intra-job
  provider: string;                   // 'csv'|'apollo'|'sirene' → précédence (precedence.ts:9)
}
export interface IngestSource {
  name; kind: "file"|"provider"; subjectKind;
  inputFingerprint(): string;         // sha256(entrée) → dédup job-level
  pull(ctx, cursor?): Promise<{ items: IngestItem[]; nextCursor?; total? }>;  // ne throw jamais
}
```

Le contrat en une phrase : **une source = un objet `IngestSource`** ; un fichier CSV en est UN, chaque famille d'API en est UN. L'aval ne voit que `IngestItem[]` — il ne distingue jamais un CSV de 1000 lignes d'un fan-out Apollo de 1000 résultats.

Trois implémentations, même interface (NET-NEW) :
- `csvSource(text, hint)` — réutilise `parseCSVLine`/`mapColumnsWithAI`/`applyMapping` extraits de `import/smart/route.ts:115`/`:141`/`:256` vers `lib/ingest/csv-parse.ts` ; mémoïse le mapping Haiku dans le cursor ; pagine par 200.
- `apolloPeopleSource(query)` / `apolloOrgsSource(query)` — `pull()` appelle le MCP Apollo (`apollo_mixed_people_api_search` / `apollo_mixed_companies_search`, déjà dispo) ; `num_current_job_openings` → `rawSignals:[{type:'hiring'}]`, **pas** un champ.
- `waterfallSource(seeds)` — wrappe `enrichCompany` (`waterfall.ts:148`, 8 providers en cascade interne) ; provider par champ = `provenance[i].provider`.

### 2.2 Le pipeline idempotent (NET-NEW `inngest/ingest-run.ts`)

Clone structurel de `custom-signal-backfill.ts:29` (createFunction 2-arg, `triggers` in config, `concurrency:[{key:'event.data.jobId',limit:1}]`, batch `step.run`). Cinq stages durables : `open-job` → loop `pull/ledger/resolve/signals` par page → `score` → `close-job`. **Dédup à 3 niveaux** :

| Niveau | Mécanisme | Garantie | Ancrage |
|---|---|---|---|
| 1 job | `ingest_jobs` uniqueIndex `(tenantId, fingerprint)`, `onConflictDoUpdate` | re-soumettre le même CSV/requête ne relance pas | NET-NEW table §6 ci-dessous |
| 2 item | `ingest_items` uniqueIndex `(jobId, sourceRef)`, `onConflictDoNothing` | un retry Inngest qui rejoue une page n'insère pas 2× ; resume exact | NET-NEW |
| 3 sujet | `findAccountMatch`/`findContactMatch` → merge sur identityKey/domain/email | « ACME SAS » + « acme.io » fusionnent sur le même `companies.id` | REUSE `upsert.ts:60`/`:192`, `identity.ts:44`/`:103` |

Stage **score ciblé** (`lib/ingest/score-touched.ts`, NET-NEW ~0.5 j-h) : `scoreCompanyBatch(tenantId, touchedIds, icps, customFields)` (`fit-recompute-core.ts:140`) + `bestMultiplierForCompany` → `computePriorityScore` (`priority-score.ts:70`) — ne recompute pas tout le tenant.

`import/smart/route.ts` est **modifié** : l'insert brut `:57-101` devient un producteur d'événement (`openIngestJob` + `inngest.send("ingest/run")`), rétro-compatible avec un mode `sync=true` pour <50 lignes.

### 2.3 CSV de 1000 lignes ET N providers → le MÊME pipeline

Le test décisif : les deux entrées ne diffèrent **que par la `IngestSource` construite** ; tout le reste est partagé byte-pour-byte. Exemple de convergence : ligne CSV `name=ACME,country=FR` (provider `csv`, rank 40) + Apollo `domain=acme.io` (rank 50) + Sirene `siren=552…,industry=…` (rank 80) → `accountMatchPlan` lie les trois sur `fr:552…` ou `d:acme.io` → **un seul `companies.id`**, dont `name` vient du CSV, `domain` d'Apollo, `industry` de Sirene (rank 80 gagne via `pickWinner:53`), chacun tracé dans `account_field_source` — **sans une ligne de code conditionnel**. C'est la composition demandée, déjà implémentée par la précédence.

### 2.4 Champs NATIFS (précédence) vs DÉRIVÉS (signaux)

Distinction déjà matérialisée par deux sinks séparés ; la source ne fait que router chaque attribut :

| | NATIF (la base le fournit) | DÉRIVÉ (on le calcule) |
|---|---|---|
| Exemples | name, domain, industry, size, revenue, description, title, phone ; vendor_ids | signals[] (funding/hiring/tech_change) ; score (fit ICP) ; priorityScore |
| Sink | `account_field_source`/`contact_field_source` | `companies.properties.signals[]` ; `companies.score` ; `companies.priorityScore` |
| Arbitrage | **précédence** PROVIDER_RANK `precedence.ts:9` (manual 100 > sirene/zefix 80 > linkedin 55 > apollo 50 > csv 40 > inferred/llm 20) ; tie → observedAt récent | **calcul** : fit `fit-recompute-core.ts:140` ; multiplier appris `signal-outcomes`; priorité `priority-score.ts:70` |
| Mapping | `IngestItem.fields`/`.identity`/`.vendorIds` → `upsert*` → field_source | `IngestItem.rawSignals` → `recordCompanySignal` `record-signal.ts:86` |
| Invariant | le CSV (40) ne peut **jamais** écraser Sirene (80) | un signal n'entre **jamais** dans field_source ; il ne participe ni à l'identité ni à la composition firmo |

### 2.5 Les outils MCP d'ingestion (NET-NEW, ~0.5 j-h dispatch)

Serveur JSON-RPC synchrone sans SSE (fait établi `route.ts:957`) → mode async = **job-id + poll**, pas de push.

- `ingest_csv` — `inputSchema: { csv_text (≤5MB), entity_type?, acquire_signals?, score? }`. Annotation `{readOnly:false, destructive:false, idempotent:false, openWorld:true}`. Retour `{ job_id, status:"queued", estimated_records, poll:"get_ingest_job" }`.
- `ingest_from_provider` — `inputSchema: { provider: enum[apollo_people|apollo_orgs|waterfall_enrich], query (object), max_records (≤2000), acquire_signals?, score? }`. Même pipeline.
- `get_ingest_job` — `inputSchema: { job_id }`. Annotation `readOnly:true`. Retour `{ status: queued|running|done|error, progress:{pulled,resolved,signals,scored,total}, result:{created,merged,skipped}, error }`.

Câblage : 3 objets dans `MCP_TOOLS:19`, 3 cases dans `handleTool:293`, schémas zod dans `lib/ingest/mcp-handlers.ts`. `tenantId` vient du Bearer (`authenticateMcpRequest`) — **jamais** un argument d'outil (isolation).

### 2.6 Schéma NET-NEW (2 tables additives, `db/schema/ingest.ts`)

`ingest_jobs` (id, tenantId, sourceName, sourceKind, fingerprint, status, totalEstimate, pulled/resolved/created/merged/skipped/signals/scored, options jsonb, error, timestamps) avec `uniqueIndex(tenantId, fingerprint)` = dédup niveau 1. `ingest_items` (id, jobId, tenantId, sourceRef, subjectKind, resolvedId, outcome, error) avec `uniqueIndex(jobId, sourceRef)` = dédup niveau 2 resume-safe. Aucune migration sur `companies`/`contacts`/`account_field_source` — tout existe. Migration additive pure (2 `CREATE TABLE`), idempotente, `db:push` localdev / `db:migrate:apply` prod.

---

## 3. La surface MCP (la meilleure façon agentic)

### 3.1 Verdict transport — JSON-RPC POST suffit-il ?

**Oui pour le chemin synchrone (la grande majorité). Streamable HTTP requis uniquement pour 2 cas.** Le POST→`application/json` actuel (`route.ts`) est un **sous-ensemble valide** de Streamable HTTP — pas faux, incomplet. L'ancien transport HTTP+SSE à deux endpoints est **déprécié**, ne pas l'implémenter.

| Cas | POST suffit ? | Pourquoi |
|---|---|---|
| find_prospects, explain_priority, draft_outreach, evaluate_send, enroll_in_sequence, send_message, get_signals (cached), ingestion (job+poll) | **OUI** | lectures indexées, fonctions pures, ou délégation async (job-id) ; tous < 1s ou hors-requête |
| `get_signals` mode `deep` (fan-out 3-5 sources + Sonnet, 10-40s) | **NON → upgrade SSE** | dépasse le timeout utile Vercel sans `notifications/progress` |
| Élicitation de confirmation native sur send_message/enroll | **NON → upgrade SSE** | requiert un canal serveur→client |

Décision : (a) **bumper `protocolVersion` `2024-11-05`→`2025-06-18`** (`route.ts:921`) pour débrider annotations + structuredContent côté clients ; négocier via le header `MCP-Protocol-Version`. (b) garder le POST synchrone pour tout le reste. (c) ajouter la branche d'upgrade `text/event-stream` (déclenchée par `Accept: text/event-stream`, `route.ts:892`) **seulement** pour `get_signals deep` + l'élicitation — coût ≈ 1.5-2 j-h, **différable** : tant qu'elle n'est pas là, la confirmation reste portée serveur-side par `enforceAgentApprovalMode`.

### 3.2 Pourquoi annotations + resources + outputSchema sont nécessaires

État actuel : **zéro annotation, zéro outputSchema, zéro resource** sur les 12 outils. Conséquences directes de la spec MCP :
- **Annotations absentes** → défaut `destructiveHint:true` : un client conforme traite `get_contact`/`list_deals` (lectures pures) comme destructifs (friction à chaque appel), et le jour où `send_message` arrive, **rien ne le distingue** d'une lecture au niveau protocole. C'est le gap **P0** pour un moteur qui envoie des emails. Les annotations construisent des politiques de confirmation graduées (read-only → auto-approve ; destructif → confirmation obligatoire).
- **outputSchema/structuredContent absents** (`route.ts:957` renvoie `{content:[{text:JSON.stringify(result)}]}`) → l'agent reçoit un **blob texte à re-parser à l'aveugle**, sans contrat de forme. Avec `outputSchema`, un client AI SDK v6 reçoit `structuredContent` **typé** — la différence entre l'agent qui devine et l'agent qui reçoit un objet garanti.
- **0 resource** → reconstituer un « dossier prospect » coûte 4 tool calls (`get_company`→`get_contact`→`list_activities`→`get_signals`) qui brûlent du contexte. Une **resource** adressable par URI est lue une fois, cacheable, contrôlée par l'app.

Garde-fou non-négociable : les annotations sont des **hints non-fiables** (spec MCP) ; elles améliorent l'UX/sûreté de l'agent, elles ne remplacent **jamais** les gates serveur (`evaluateSend`).

### 3.3 Catalogue OUTILS d'outreach (wrappers fins, logique 100% réutilisée)

Chaque sortie est **action-ready + grounded** : citations `{url, quote, verified}` inline, assez de structure pour décider l'étape suivante sans round-trip.

**`find_prospects`** — découverte, `{readOnly:true, idempotent:true, openWorld:false}`.
*in* `{ query?, filter?{industry,sizeRange,geo,stage,signalTypes[]}, minScore?, limit?, cursor? }`.
*out* `{ prospects[]{companyId, companyName, domain, priorityScore, whyNow, topSignal{type,strength,detectedAt,source,citation}, personToContact{contactId,name,title,email,reachable}, suggestedNextTool}, nextCursor }`.
REUSE : tri `priority_score DESC` (`fit-recompute-core` idx), NL→sémantique `searchSimilar` (`route.ts:848`), person `personFromSignals` (`record-signal.ts:60`). NET-NEW : `lib/mcp/find-prospects.ts` (whyNow+citation assembly). **1 j-h.**

**`get_signals`** — découverte ; cached `{readOnly:true, openWorld:false}`, deep `{openWorld:true}`.
*in* `{ subjectType, subjectId, mode: cached|deep }`. *out* `{ subjectId, whyNow, compositeStrength, signals[]{type, polarity, strength, detectedAt, source, evidence{url,quote,verified}}, multiplier, suggestedAngle }`.
REUSE : lecture `properties.signals[]` (`record-signal.ts:86`), multiplier appris (`signal-outcomes.ts:150`), vérif citation (`verify-source.ts:26`). NET-NEW : mode deep = porté par le chantier compound (rapport signal-intelligence §3.3). **0.5 j-h (cached).** Prérequis dur pour `polarity`/canonicalisation : `taxonomy.ts` (rapport §4.1) — sinon multipliers au plancher 1.0.

**`explain_priority`** — découverte, `{readOnly:true, idempotent:true}`.
*in* `{ companyId }`. *out* `{ priorityScore, factors{signalMultiplier{value,drivenBy,reason}, fitModulator{value,icpScore,reason}, accessModulator{value,bestContactReach,reason}}, bandNote }`.
REUSE : `computePriorityScore` (`priority-score.ts:70`, floors `:54-55`), `scoreSignals` (`score-with-signals.ts:33`). NET-NEW : `lib/mcp/explain-priority.ts` (~40 lignes pures). **0.5 j-h.**

**`draft_outreach`** — action **non-destructive** (ne fait qu'écrire un brouillon), `{readOnly:false, destructive:false, idempotent:true, openWorld:false}`.
*in* `{ subjectType, subjectId, channel: email|linkedin, product?, icpIndustry? }`.
*out* `{ signalUsed, angle, methodology, subject, body, businessImplication, cta, guardrails[], citations[]{claim,url,quote,verified}, recipient{contactId,email}, readyToSend }`.
REUSE : signal→angle `tamSignalsToAngleSignals` (`signal-opener.ts:79`), opener `generateOpener` (`:162`), méthodo `getMethodology`/`pickBestSignal`/`SIGNAL_ANGLES` (`outbound-methodologies.ts:144`/`:210`/`:159`), citations vérifiées `runResearchAgent` (`research-agent.ts:104`), anti-fabrication `judgeFabrication` (`fabrication-gate.ts:173`). NET-NEW : `lib/mcp/draft-outreach.ts`. **1 j-h.**

**`evaluate_send`** — dry-run du gate, `{readOnly:true, idempotent:true}`.
*in* `{ toAddress, isCold?, sentTodayFromPrimary, companyId?, contactId?, interactive? }` (PAS de tenantId — Bearer).
*out* mirror exact de `SendingGateOutcome` : `{send:true, reason}` OU `{send:false, code, reason}`. L'agent **lit la règle avant d'agir** au lieu d'apprendre par un refus. **1 j-h.**

**`enroll_in_sequence`** — action **destructive** + openWorld ; `idempotent:true` car `guardEnrollment` rend le re-call sûr (`signal-to-sequence.ts:283`).
*in* `{ companyId, companyName, signalType (enum 9 types canoniques triggers.ts:27), signalTitle, sequenceId? }`.
*out* `{ enrolled, sequenceId, sequenceName, dealId, status: enrolled|deferred|skipped, deferred, reason }`.
REUSE : `signalAutoEnroll` (`signal-to-sequence.ts:42`), `pickSequenceForSignal` (`triggers.ts:143`), HITL `enforceAgentApprovalMode` (`:248`). NET-NEW : `inngest.send("signal/auto-enroll")` + lecture retour. **0.5 j-h.**

**`send_message`** — le plus destructif, openWorld.
*in* `{ toAddress, channel, subject?, body, companyId?, contactId?, isCold?, interactive? }`.
*out* `{sent:true, messageId, via, reason}` OU `{sent:false, code, gate, reason}` (gate nommé, pas un 200/500 muet).
REUSE : `evaluateSend` 8 gates (`sending-gate.ts:212`), transport owner-SMTP `sendViaMailbox` (#375). NET-NEW : `lib/mcp/send-message.ts` + résolution serveur-side de `sentTodayFromPrimary` et re-résolution de `isCold` via `isColdRecipient` (`:87`) — l'agent ne peut pas mentir sur la coldness. **1 j-h** (+1.5 si élicitation SSE).

### 3.4 Catalogue RESOURCES (le « dossier prospect »)

Templates (NET-NEW `capabilities.resources` `route.ts:926` + `resources/list|read|templates`) :
- `crm://company/{id}/dossier` — firmo + signaux+sources+angle + contacts + deals + warm-path, agrégé : `{company{id,name,domain,industry,priorityScore}, whyNow, signals[]{type,strength,source,evidence{url,quote,verified}}, suggestedAngle, contacts[]{id,name,title,email,reachable}, recommendedPerson, openDeals[], warmPath{degree,via,strength}}`. REUSE `handleGetCompany` (`route.ts:475`) à agréger ; warm-path différable (`findWarmPathsKHop`, deep-tech §6).
- `crm://policy/sending-rules` — lawful basis tenant, fenêtre 08-18, cold policy, caps — l'agent **lit les règles** avant de proposer un envoi. Dérive de `TenantSettings`.

**1.5 j-h** (3 templates + handlers, warm-path exclu).

### 3.5 Extension exacte de `api/mcp/route.ts`

| Point | Modif | Ligne |
|---|---|---|
| `MCP_TOOLS` | +7 outils outreach +3 ingestion ; ajouter `annotations`+`outputSchema` aux 12 existants ET aux nouveaux | `:19` |
| `handleTool` switch | +10 cases (wrappers minces 10-40 lignes → `lib/mcp/*`, `lib/ingest/*`) | `:293` |
| retour `tools/call` | renvoyer `content`(rétro-compat) **+** `structuredContent: result` | `:957` |
| `initialize` | `protocolVersion:"2025-06-18"` ; `capabilities:{tools,resources}` | `:921`/`:926` |
| routeur méthodes | +`resources/list|read|templates` → `handleResource*` | `:917` |
| `POST` (conditionnel) | branche upgrade `text/event-stream` pour get_signals deep + élicitation | `:892` |

---

## 4. La boucle outreach agentic

### 4.1 Scénario A — tenant peuplé : pseudo-trace MCP

L'agent reçoit `tenantId` via le Bearer (`authenticateMcpRequest`). Il n'orchestre **rien de métier** — il enchaîne 5 outils.

**1. `find_prospects`** `{limit:10, minScore:60}` → `{prospects:[{companyId:"c_812", companyName:"Hexa", priorityScore:86, whyNow:"hiring_signal:high — 4 GTM roles opened 6d ago", topSignal{type:"hiring_signal"}, personToContact{contactId:"p_5501", title:"Head of Revenue"}, suggestedNextTool:"draft_outreach"}]}`. Suffisant car `priorityScore = signal×fit×access` est déjà calculé serveur-side (mémoire #455) ; l'agent ne recompose pas le classement.

**2. `get_signals`** `{subjectType:"company", subjectId:"c_812"}` → `{signals:[{type:"hiring_signal", strength:"high", source:"apollo", evidence{url,quote,verified}}, {type:"post_funding", strength:"medium", source:"crunchbase"}], whyNow, suggestedAngle, multiplier}`. Les signaux sont déjà la forme qu'attend l'opener ; `source`+`evidence` = la provenance qui devient citation.

**3. `draft_outreach`** `{subjectId:"c_812", channel:"email"}` → `{signalUsed:"hiring", angle:"hiring", methodology:"Challenger", subject, body:"…ready-to-edit…", citations:[{claim:"4 GTM roles opened", url, quote, verified:true}], guardrails:["don't claim to know headcount","no fabricated metrics"], readyToSend:true}`. Rien n'est écrit ni envoyé. Le `body` est *ready-to-send*, `citations[]` = faits réellement cités.

**4. `evaluate_send`** `{toAddress:"rev@hexa.io", companyId:"c_812", contactId:"p_5501", sentTodayFromPrimary:7}` → `{send:true, reason:"primary-with-caps — warm, under cap (7/20)"}` OU `{send:false, code:"not_targeted", reason:"Account unreviewed; SAFE_MODE allows only targeted."}`. L'agent lit la règle **avant** d'agir : si `send:false`, il n'appelle jamais `send_message`, il remonte `reason` à l'humain.

**5. `send_message`** → (si SSE) **élicitation** `elicitation/create {message:"Envoyer ce cold email à rev@hexa.io ?", requestedSchema}` → humain `{approve:true}` → `{sent:true, messageId, via, gate:"primary-with-caps"}`. L'élicitation est ici car `email-send`/`sequence-enrollment` sont `outbound:true` → `decideAction` retourne **`confirm` sous TOUS les modes**, même `auto-high-confidence` (`decide-action.ts:128-136`). Refus → `recordAgentAction(awaitingApproval:true)` → `{sent:false, deferred:true}`.

### 4.2 Grounding — chaque claim lié à une source

La frontière de vérité n'est **pas** le LLM, c'est la liste d'evidence (commentaire `db-evidence.ts:6`). Chaîne REUSE, non contournable par l'agent car filtrée **dans** `draft_outreach** :
1. Evidence = faits vérifiés uniquement — `prospectContextToEvidence` (`db-evidence.ts:29`) mappe le contexte réel (signaux `record-signal`, firmo waterfall) en `Citation[]`.
2. Floor de confiance — `evidence.filter(c => c.confidence >= MIN_CONFIDENCE)` (`generate-message.ts:185`).
3. Pas d'evidence groundable → **pas de personnalisation** — fallback flaggé `["no-evidence"]` (`:204`), jamais une invention.
4. Anti-fabrication — `personalizationViolations` rejette si le LLM cite un id absent de la liste usable (`:158`/`:167`) → fallback (`:222`).
5. Exposé à l'agent : `message.evidence` = seulement les citations survivantes (`:236`) ; `flags` non-vide = aveu honnête de non-grounding.

### 4.3 Gates non-contournables même piloté par un agent EXTERNE

Principe : **l'agent appelle une fonction ; la fonction appelle le gate.** Le gate n'est pas un paramètre fourni par l'agent — il est codé dans le corps du wrapper, inatteignable depuis le JSON-RPC.

`evaluateSend` (`sending-gate.ts:212-346`), 8 gates fail-closed, ordre fixe : opt-out `:216` → account ctx `:227` (null→unreviewed) → suppression DB `:240` → email-status `:258` → lawful-basis `:270` (block-by-default) → deliverability `:283` → SAFE_MODE targeting `:301` (unreviewed→deny) → identity/cold/cap `:324`. **Zéro chemin fail-open** : `catch` final → `{send:false}` (`:339-345`) ; `settings:null` → `DEFAULTS` protecteurs. Omettre `companyId` n'échappe pas au targeting (force unreviewed=deny). `interactive:true` n'esquive **que** le gate 7 ; les 7 autres tiennent.

Approval-mode : `email-send`/`sequence-enrollment` sont `outbound:true` câblés → `confirm:"always"` (`approval-mode.ts:149`/`:155`) ; le `mode` est lu serveur-side (`getTenantSettings`), **pas** un argument d'outil — l'agent ne peut pas se déclarer `auto`. Un Bearer mappé à `viewer` ne peut **aucune** action outbound (`decide-action.ts:80`).

### 4.4 Scénario B — l'agent ingère un CSV puis fait l'outreach dessus

Le CSV brut n'arrive **pas** dans l'état d'un TAM mûr — il faut traverser résolution + acquisition de signaux avant que A ne devienne possible.

```
1. ingest_csv {csv_text}            → {job_id, status:"queued"}
2. get_ingest_job (poll)            → identité résolue : upsertAccount, merge via accountMatchPlan
                                       (identity.ts:67) → 0 doublon (upsert.ts:60)
3. enrichissement déclenché         → waterfall 8 providers, firmo composée (waterfall.ts:77)
                                       NET-NEW gap: writeFieldSource provenance (functions.ts:~220)
4. acquisition de signaux           → recordCompanySignal (record-signal.ts:86) → properties.signals[]
                                       NET-NEW gap: hookpoint signal post-import (agentic-executor.ts:~240)
5+. DÈS QUE signals[] existe        → SCÉNARIO A à l'identique
```

**Sûreté** : un CSV fraîchement importé a `targeting_status = unreviewed` → **gate 7 SAFE_MODE le bloque** (`sending-gate.ts:301`). Importer puis spammer en un souffle est **impossible** : l'agent doit obtenir un review (targeting→targeted) avant qu'`evaluate_send` ne retourne `send:true`. Pas de lawful-basis enregistré → gate 5 bloque si le flag est on. L'ingestion CSV ne crée **aucune** dérogation aux gates.

**Le gap honnête** : étapes 3-4 (provenance `writeFieldSource` + déclenchement signal post-enrichissement) sont les hookpoints **NET-NEW** du seam compose-identity. Sans eux, `find_prospects` sur un tenant 100%-CSV retourne `priorityScore` plancher (pas de signal) — l'outreach « marche » mais sans why-now. Même gap que mémoire #455.

---

## 5. Carte de branchement

| Composant nouveau | Couture existante (file:line) | Statut |
|---|---|---|
| `lib/ingest/types.ts` (IngestItem/IngestSource) | — | NET-NEW |
| `lib/ingest/csv-parse.ts` (parse/map/apply extraits) | `import/smart/route.ts:115`/`:141`/`:256` | NET-NEW (extraction de REUSE) |
| `lib/ingest/sources/{csv,apollo,waterfall}-source.ts` | `waterfall.ts:148` (enrichCompany), MCP Apollo | NET-NEW sur REUSE |
| `inngest/ingest-run.ts` (5 stages durables) | pattern `custom-signal-backfill.ts:29` ; `upsert.ts:108`/`:223` ; `record-signal.ts:86` | NET-NEW sur pattern REUSE |
| `lib/ingest/score-touched.ts` | `fit-recompute-core.ts:140` ; `priority-score.ts:70` | NET-NEW sur REUSE |
| tables `ingest_jobs`/`ingest_items` (`db/schema/ingest.ts`) | — | NET-NEW additif |
| `import/smart/route.ts` insert brut → enrôlement job | `route.ts:57-101` | MODIFIÉ (mode sync compat) |
| outils MCP `ingest_csv`/`ingest_from_provider`/`get_ingest_job` | `MCP_TOOLS:19` + `handleTool:293` | NET-NEW (cases) |
| `lib/mcp/find-prospects.ts` | tri priority_score idx ; `searchSimilar route.ts:848` ; `record-signal.ts:60` | NET-NEW sur REUSE |
| `lib/mcp/explain-priority.ts` | `priority-score.ts:70`/`:105` ; `score-with-signals.ts:33` | NET-NEW sur REUSE |
| `lib/mcp/draft-outreach.ts` | `signal-opener.ts:79`/`:162` ; `research-agent.ts:104` ; `fabrication-gate.ts:173` | NET-NEW sur REUSE |
| `lib/mcp/send-message.ts` + arg-resolution | `evaluateSend sending-gate.ts:212` ; `isColdRecipient :87` ; `sendViaMailbox` #375 | NET-NEW sur REUSE |
| wrapper `get_signals` (cached) / `enroll_in_sequence` | `record-signal.ts:86` ; `signal-to-sequence.ts:42`/`:248` ; `triggers.ts:143` | NET-NEW sur REUSE |
| annotations (12+nouveaux) + outputSchema + structuredContent | `MCP_TOOLS:19` ; `route.ts:957` | NET-NEW (P0/P1) |
| `protocolVersion` bump + négociation | `route.ts:921` | NET-NEW (P0) |
| resources `list/read/templates` + 2-3 templates | `route.ts:917`/`:926` ; `handleGetCompany route.ts:475` | NET-NEW (P1) |
| upgrade SSE + élicitation | `route.ts:892` POST | NET-NEW (P2, différable) |
| hookpoint provenance `writeFieldSource` | `inngest/functions.ts:~220` | NET-NEW (gap connu) |
| hookpoint signal post-import | `agentic-executor.ts:~240` | NET-NEW (gap connu) |

**Preuve de plug-sans-rewrite** : on ne réécrit ni le resolver (`upsert.ts`), ni la précédence (`precedence.ts`), ni la waterfall (`waterfall.ts`), ni le sink signaux (`record-signal.ts`), ni les scorers (`fit-recompute-core.ts`/`priority-score.ts`), ni les gates (`sending-gate.ts`), ni le dispatch MCP (`route.ts`). Tout le NET-NEW est un **adaptateur d'entrée + orchestrateur + couche d'exposition MCP + 2 hookpoints déjà identifiés**.

---

## 6. MVP + séquençage

### 6.1 Le plus petit slice agent-natif de bout-en-bout

**Objectif MVP** : prouver « CSV in → 3 outils MCP (`find_prospects`/`get_signals`/`draft_outreach`) → outreach gated » sur un tenant réel, sans SSE, sans resources, sans mode deep. C'est la démonstration complète de la thèse agent-native avec le minimum de surface.

| # | Chantier | Plug point | Effort j-h | Inclus MVP |
|---|---|---|---|---|
| 1 | `IngestItem`/`IngestSource` + extraction csv-parse | `lib/ingest/` ← `import/smart/route.ts:141`/`:256` | 1.0 | OUI |
| 2 | `csv-source.ts` (mémoïse mapping, pagine 200) | `lib/ingest/sources/` ← `route.ts:256` | 0.5 | OUI |
| 3 | `inngest/ingest-run.ts` (resolve+compose ; signaux/score en option) | clone `custom-signal-backfill.ts:29` ; `upsert.ts:108` | 2.0 | OUI |
| 4 | tables `ingest_jobs`/`ingest_items` + openIngestJob/getJob | `db/schema/ingest.ts` | 1.0 | OUI |
| 5 | outils `ingest_csv` + `get_ingest_job` | `MCP_TOOLS:19` + `handleTool:293` | 0.5 | OUI |
| 6 | `find_prospects` (rank + whyNow) | `lib/mcp/` ← priority_score idx, `route.ts:848` | 1.0 | OUI |
| 7 | `get_signals` cached | ← `record-signal.ts:86` | 0.5 | OUI |
| 8 | `draft_outreach` (opener + grounded message) | ← `signal-opener.ts:162`, `fabrication-gate.ts:173` | 1.0 | OUI |
| 9 | `evaluate_send` + `send_message` (gated, sans élicitation native) | ← `evaluateSend sending-gate.ts:212` ; confirm via `approval-mode.ts:248` | 2.0 | OUI (gate = la barrière) |
| 10 | annotations + outputSchema + structuredContent + protocolVersion bump | `route.ts:921`/`:957` | 1.0 | OUI (P0) |
| 11 | hookpoints provenance + signal post-import | `functions.ts:~220`, `agentic-executor.ts:~240` | 1.0 | OUI (sinon CSV→outreach sans why-now) |
| | **Sous-total MVP** | | **≈ 11.5 j-h** | |

### 6.2 Le reste (additif, post-MVP, ne touche pas le tronc)

| Chantier | Plug point | Effort j-h | Priorité |
|---|---|---|---|
| `apollo-source.ts` + `waterfall-source.ts` + `ingest_from_provider` | `lib/ingest/sources/` ← `waterfall.ts:148` | 1.5 | P1 (multi-provider) |
| Câblage signaux dans le pipeline (rawSignals→recordCompanySignal) + score-touched | ← `record-signal.ts:86`, `fit-recompute-core.ts:140` | 1.0 | P1 |
| `explain_priority` + `enroll_in_sequence` | `lib/mcp/` ← `priority-score.ts:70`, `signal-to-sequence.ts:42` | 1.0 | P1 |
| resources (`dossier` + `policy/sending-rules`) | `route.ts:917`/`:926` ← `route.ts:475` | 1.5 | P1 |
| `get_signals` mode `deep` | chantier compound (rapport signal-intelligence §3.3/§7) | (porté ailleurs) | P2 |
| upgrade SSE + élicitation native (confirme destructifs) | `route.ts:892` | 2.0 | P2 |
| warm-path dans le dossier | `findWarmPathsKHop` (deep-tech §6) | 4-6 | P3 |
| tests Vitest (dédup 3 niveaux, idempotence re-run, précédence CSV<Sirene, CSV↔Apollo merge, async poll, gates fail-closed) | — | 2.0 | accompagne chaque lot |

### 6.3 Recommandation

Livrer le **MVP ≈ 11.5 j-h** d'abord : il démontre la chaîne complète (CSV → résolution → composition → signal → 3 outils MCP action-ready → outreach gaté) sur un tenant réel, avec les annotations P0 et le bump de protocole qui débrident les clients. Les **hookpoints provenance/signal (#11)** sont **dans** le MVP, non en option : sans eux un tenant 100%-CSV produit un `priorityScore` plancher et `find_prospects` n'a pas de why-now — l'outreach marche mais perd sa valeur (mémoire #455). 

Le **prérequis dur non chiffré ici** reste `taxonomy.ts` (rapport signal-intelligence §4.1) : tant qu'il n'est pas là, `get_signals.polarity` et les multipliers restent dégradés (plancher 1.0). À cadencer **avant** d'annoncer le contrat de sortie canonique des outils signal.

100% de la logique métier (scoring, grounding, gates, identité, précédence, waterfall) est **réutilisée**. Le NET-NEW est exclusivement : un adaptateur d'entrée, un orchestrateur durable, la couche d'exposition MCP (annotations/outputSchema/resources), et deux hookpoints déjà identifiés. Aucun rewrite.