# Outreach Brief — l'intelligence, pas le mail (delta PRD)

> Delta sur `_reports/signal-agent-prd-2026-06-27.md` (FR-1..FR-13) et `_reports/signal-agent-mcp-2026-06-27.md` (surface MCP §3). Ne réénonce pas l'architecture transport, l'ingestion (FR-1..FR-6), ni les gates déjà spécifiés ; remplace ce qui touche à la rédaction et à l'envoi.

## 0. Le pivot en 5 lignes

1. **Ce qui change** : `draft_outreach` (FR-9 du PRD, `signal-agent-prd-2026-06-27.md:209` — renvoyait `subject`/`body` rédigés) est **supprimé** et remplacé par `get_outreach_brief`, qui n'émet **aucune prose** : seulement de l'intelligence structurée (faits, why-now, angle, contraintes, garde-fous).
2. **Pourquoi c'est plus défendable** : on cesse d'être un *sender* de plus (concurrent d'Instantly/Smartlead/Lemlist) pour devenir la **couche d'intelligence amont** qu'ils consomment — interop, pas concurrence frontale.
3. **On rend l'agent aval meilleur ET sûr** : le brief porte une whitelist de faits citables (`citableFacts[]`) et une denylist (`doNotClaim[]`) — l'agent tiers, même naïf, ne peut ni inventer un chiffre ni contacter un prospect interdit.
4. **L'artefact existe déjà** : `IntelligenceBrief` (`app/apps/web/src/lib/campaign-engine/types.ts:50-75`), construit par `buildIntelligenceBrief` (`.../build-intelligence-brief.ts:26`), caché 14 j (`BRIEF_TTL_DAYS` `:24`), lu read-only via `readCachedBrief` (`:190`). `get_outreach_brief` est un wrapper de **mise en forme**, pas une nouvelle intelligence.
5. **Conséquence anti-risque** : ce chemin ne touche **jamais** `generate-message`/`copy_asset_block` (body vide platform-wide — mémoire `project_copy-quality-eval`). Le défaut « copy vide » sort structurellement du périmètre.

## 1. Le contrat OUTREACH BRIEF

Sortie typée (`structuredContent` MCP), zéro `subject`/`body`. Chaque champ = provenance `file:line` (REUSE) ou **NET-NEW** (assemblage pur). Tous les chemins sont `app/apps/web/src/lib/...`.

### A. `identity` — qui (firmo + provenance par champ)

| Champ | Type | Provenance | Rôle pour l'agent aval |
|---|---|---|---|
| `company.{id,name,domain,industry,description}` | string/null | `IntelligenceBrief.firmographics` + `companies` (`prospect-context.ts:138-150`) | nommer correctement |
| `company.{employeeCount,sizeRange,annualRevenue,revenueRange,foundedYear,location}` | number/string/null | `FirmographicFacts` `types.ts:11-18` | calibrer segment/ton |
| `company.{fundingStage,totalFunding,investors[]}` | string/number/string[] | `FirmographicFacts` `types.ts:19-21` | angle funding, name-drop vérifié |
| `company.technologies[]` | string[] | `FirmographicFacts.technologies` `types.ts:22` | angle tech |
| `firmographicProvenance[]{field,provider,atIso}` | array | `FieldProvenance` `types.ts:26-30`, exposé `types.ts:72` | source par champ — affirmer un chiffre **uniquement** si une provenance le couvre |

### B. `whyNow` — le déclencheur (signaux + scoring)

| Champ | Type | Provenance | Rôle |
|---|---|---|---|
| `topSignal.{type,strength,detectedAt,source}` | string | `SignalEntry` (`signals/record-signal.ts:40-45`) | la clé de l'angle + l'âge concret |
| `topSignal.fresh` | bool | `isSignalFresh` (`signals/freshness.ts:98`), TTL `:31` | garantie anti-fossile (un signal périmé est pire qu'aucun, `freshness.ts:5-8`) |
| `topSignal.ttlDays` | number/null | `ttlDaysFor` (`freshness.ts:88`) | durée de validité de l'angle |
| `topSignal.evidence{url,quote,verified}` | object/null | `recentNews[]` `types.ts:77-83` / `publicContent[]` `types.ts:106-114` | la phrase exacte à citer + le lien |
| `signals[]` | array | `properties.signals[]` filtrés frais (`prospect-context.ts:156-167`) | signaux secondaires (multi-touch) |
| `whyNowSummary` | string/null | **NET-NEW** (1 phrase d'assemblage) | résumé reformulable |
| `priorityScore` | number | `computePriorityScore` (`scoring/priority-score.ts:70`) | l'agent jauge l'effort à investir |
| `priorityFactors{signalMultiplier,fitModulator,accessModulator}` | object | `priority-score.ts:70`, floors `:54-55` | explique *pourquoi* prioritaire |

### C. `messaging` — angle & guidage (PAS de prose)

| Champ | Type | Provenance | Rôle |
|---|---|---|---|
| `bestAngle` | string/null | `IntelligenceBrief.bestAngle` `types.ts:64` | direction n°1 |
| `angleKey` | string/null | `GeneratedOpener.angle` (`scoring/signal-opener.ts:135`) | clé taxonomie (funding/hiring/…) |
| `angleGuidance{angleTemplate,businessImplication,questionSeed}` | object/null | `SIGNAL_ANGLES` (`scoring/outbound-methodologies.ts:159-208`) | structure de l'angle, pas le texte |
| `painPoints[]` | string[] | `IntelligenceBrief.painPoints` `types.ts:63` | sur quoi appuyer |
| `competitorDetected` | string/null | `types.ts:61` | angle displacement |
| `communicationStyle{formality,preferredLength,tone}` | object/null | `CommunicationStyle` `types.ts:116-120` | matcher le style du prospect |
| `methodology{name,structure,maxWords,toneNotes,ctaType}` | object | `getMethodology`→`Methodology` (`outbound-methodologies.ts:12-21,144`) | cadre (BASHO/Challenger…) + plafond de mots, par séniorité |
| `suggestedCta` | string | `Methodology.ctaType` `:18` | type de CTA (question, pas « réunion ») |
| `channel` | `email\|linkedin` | input (défaut `linkedin`) | canal primaire (mémoire `prod-readiness-and-channel`) |
| `timing{sendWindow,recipientTz,signalFreshUntilIso}` | object | `GuardrailsConfig.sendWindow` `types.ts:210-215` + TTL `freshness.ts` | fenêtre 08-18 + péremption de l'angle |

### D. `warmPath` — chemin chaud

| Champ | Type | Provenance | Rôle |
|---|---|---|---|
| `warmthSignals[]{type,detail}` | array | `WarmthSignal` `types.ts:122-125` (`mutual_connection`/`shared_investor`/`alumni`/…) | ouvrir sur la connexion réelle (bat tout angle froid — `pickBestSignal` priorise `common_investor:11`, `outbound-methodologies.ts:217`) |
| `recommendedPerson{contactId,name,title,email?,linkedinUrl?}` | object/null | `personFromSignals` (`record-signal.ts:61`), `SignalPerson` `:30-37` | qui contacter (producteur du signal, pas le défaut top-séniorité) |

### E. `citableFacts` (whitelist) + `doNotClaim` (anti-hallucination) — la valeur du pivot

C'est la **couche anti-hallucination de l'agent aval** : il transpose le gate anti-fabrication d'Elevay (`judgeFabrication`, `guardrails/fabrication-gate.ts:173`) en **données** vers un agent qui n'a pas notre juge.

| Champ | Type | Provenance | Rôle |
|---|---|---|---|
| `citableFacts[]{fact,value,source,url?,quote?,verified:true}` | array | **NET-NEW** : `publicContent.filter(type==="metric")` (`types.ts:109`, cappés 6 `build-intelligence-brief.ts:227-234`) ∪ firmo+provenance (`:238-240`) | la SEULE liste de chiffres/faits que l'agent a le droit d'écrire |
| `doNotClaim[]` | string[] | **NET-NEW** : `GeneratedOpener.guardrails` (`signal-opener.ts:139` = `Methodology.whatNotToDo` `outbound-methodologies.ts:18`) + dérivés (« ne cite aucun chiffre absent de citableFacts », « pas de headcount si `employeeCount=null` ») | borne ce que l'agent ne doit jamais affirmer |
| `groundingNote` | string | **NET-NEW** | « toute affirmation chiffrée vient de citableFacts ; sinon, rester qualitatif » |

**Règle de dérivation `doNotClaim`** : tout champ firmographique `null` OU sans entrée de provenance → `"ne pas affirmer {field}"` ; plus une base constante (`"aucune métrique fabriquée"`, `"pas d'effectif non cité"`). C'est l'analogue agent-natif du commentaire « only cite a number if it appears here » de `formatFirmographicsSection` (`context/prospect-context.ts:358`).

### F. `persona` — le rôle (pilote la méthodo)

`contactId/fullName/title/seniority/departments[]/linkedinUrl` ← `ProspectContext.contact` (`prospect-context.ts:267-279`) ; `reachable{hasEmail,hasPhone,hasLinkedin}` ← `ContactReachability` (`priority-score.ts:85-89`). `seniority` pilote `getMethodology` (`outbound-methodologies.ts:144`).

### G. `meta` — provenance & confiance

| Champ | Type | Provenance |
|---|---|---|
| `sourcesAttempted/sourcesSucceeded` | number | `types.ts:67-68` |
| `sourceErrors[]{source,error,statusCode?}` | array | `SourceError` `types.ts:127-131` |
| `researchedAt/expiresAt` | iso | `types.ts:73-74`, TTL 14 j `build-intelligence-brief.ts:24` |
| `confidence` | `high\|medium\|low` | **NET-NEW** = f(`sourcesSucceeded`, signal frais, présence provenance) |
| `briefCompleteness` | number 0-1 | **NET-NEW** = ¬`briefIsEmpty` (`build-intelligence-brief.ts:245`) |
| `gate{exportable,verdict}` | object | `evaluateSend` (`guardrails/sending-gate.ts:212`) — on ne livre QUE des prospects autorisés (§3) |

## 2. Surface MCP révisée

Delta sur `signal-agent-mcp-2026-06-27.md` §3.3 : `find_prospects`/`get_signals`/`evaluate_send`/`enroll_in_sequence` **inchangés** ; `draft_outreach` **supprimé** ; `send_message` reste mais n'est plus le climax du slice brief (remplacé par `export_to_outbound` pour le scénario handoff).

**`get_outreach_brief`** (remplace `draft_outreach`) — `{readOnlyHint:true, idempotentHint:true, openWorldHint:false}`.
```ts
GetOutreachBriefInput = z.object({
  subjectType: z.enum(["contact","company"]).default("contact"),
  subjectId: z.string(),
  channel: z.enum(["email","linkedin"]).default("linkedin"),
  refresh: z.boolean().default(false),     // → buildIntelligenceBrief forceRefresh (build-intelligence-brief.ts:30)
  gateCheck: z.boolean().default(true),    // embarque le verdict evaluateSend
});
```
Sortie = le schéma §1 (sections A-G), validée par `OutreachBrief` zod (autorité serveur, `lib/mcp/outreach-brief.ts` — NET-NEW).

**`export_to_outbound`** (NET-NEW) — `{readOnlyHint:false, destructiveHint:true, openWorldHint:true}` (écrit dans un système tiers).
```ts
ExportToOutboundInput = z.object({
  prospectIds: z.array(z.string()).min(1).max(1000),  // = plafond bulk Instantly
  destination: z.enum(["instantly","webhook","generic"]),
  campaignId: z.string().optional(), listId: z.string().optional(),  // XOR (refine)
  skipIfInWorkspace: z.boolean().default(true),
  webhookUrl: z.string().url().optional(),
  dryRun: z.boolean().default(false),
}).refine(v => v.destination!=="instantly" || (!!v.campaignId !== !!v.listId),
          "instantly requires exactly one of campaignId | listId");
ExportResult = { destination, exported[]{prospectId,instantlyLeadId}, skipped[]{prospectId,code,reason}, counts{requested,exported,skipped,duplicates} }
```

**Extension `app/apps/web/src/app/api/mcp/route.ts`** (delta sur `signal-agent-mcp-2026-06-27.md` §3.5) :
- `MCP_TOOLS` (`route.ts:19`) : +2 définitions avec `outputSchema`.
- `handleTool` (`route.ts:293`) : +2 cases.
- **Corriger le retour `tools/call`** (`route.ts:953-957`, aujourd'hui `{content:[{type:"text",...}]}` seul) pour ajouter `structuredContent` — sinon l'agent reçoit un blob opaque. Reste le gap P0 du PRD (`signal-agent-prd-2026-06-27.md:265`, FR-12).
- `tenantId` toujours du Bearer `mcp_*` (`authenticateMcpRequest`, `route.ts:230`), jamais un argument.

## 3. Intégration agents outbound

**Contrainte dure (verrou de tout le mapping)** : Instantly V2 `custom_variables` est un **map scalaire plat** — valeurs `string|number|boolean|null` uniquement, objets/arrays interdits ([leads/bulkadd](https://developer.instantly.ai/api/v2/lead/bulkaddleads)) ; les templates consomment `{{key}}` avec correspondance exacte, sensible à la casse ([variables](https://help.instantly.ai/en/articles/6135930-how-to-add-and-use-variables-in-campaigns)). Donc on **n'envoie jamais le brief imbriqué** : on envoie sa **projection scalaire**. Le seam existe déjà : `toInstantlyCustomVariables` (`providers/instantly/send-adapter.ts:19`) coerce en scalaires (objets/arrays droppés).

**Mapping brief → custom variables** (NET-NEW `lib/outbound/instantly-map.ts`, flatten pur) :

| Clé Instantly | Source brief | Flatten |
|---|---|---|
| `email`/`first_name`/`company_name`/`job_title` (natifs, top-level) | persona + identity | as-is ; `email` gaté |
| `personalization` (natif) | `messaging.bestAngle` (`types.ts:64`) | une phrase d'angle |
| `why_now` | `whyNow.whyNowSummary` | string |
| `signal_type` / `signal_strength` | `whyNow.topSignal.{type,strength}` | string |
| `signal_evidence_url` / `signal_evidence_quote` | `topSignal.evidence.{url,quote}` (`types.ts:81,112`) | url ; quote ≤200c |
| `pain_point_1..3` | `messaging.painPoints[]` (`types.ts:63`) | indexé, blank-fill |
| `citable_metric_1..3` | `publicContent type:"metric"` (`types.ts:109`) | `"{quote} [{url}]"` |
| `best_angle` / `cta_type` / `max_words` / `tone` | `messaging.{bestAngle,suggestedCta,methodology.maxWords,communicationStyle.tone}` | scalaires |
| `warm_path` | `warmPath.warmthSignals[0].detail` (`types.ts:122-125`) | `"{type}: {detail}"` |
| `firmo_source` | `firmographicProvenance[]` (`types.ts:26-30,72`) | `"industry:apollo; funding:crunchbase"` |
| `do_not_claim` | `doNotClaim[]` | **string** joint `" | "` (garde-fou aval) |
| `priority_score` | `whyNow.priorityScore` (`priority-score.ts:70`) | number |
| `grounded` / `brief_expires_at` | `meta.{briefCompleteness>0, expiresAt}` | bool / iso |

**Flux d'export — gate d'abord, on n'exporte que les autorisés** :
```
export_to_outbound({prospectIds[], destination:"instantly", campaignId})
  pour chaque prospect (tenant du Bearer):
   1. brief = get_outreach_brief(...)                 // REUSE buildIntelligenceBrief :26 + assemblage §1
   2. GATE = evaluateSend({tenantId, toAddress, companyId, contactId,
                           isCold:true, interactive:false})   // sending-gate.ts:212 (REUSE, inchangé)
        send:false → SKIP + record {code,reason}; PAS d'export
        send:true  → continue
   3. project = toInstantlyCustomVars(brief)          // §3 flatten scalaire, NET-NEW
   4. POST /api/v2/leads {email,...,campaign_id, skip_if_in_workspace:true, custom_variables:project}
        (≥2 → POST /api/v2/leads/list, ≤1000/appel, backoff 429)
  retour {exported[], skipped[]{code,reason}, instantlyLeadIds[]}
```

**Invariant sécurité (conservé en handoff)** : `evaluateSend` tourne **dans** `export_to_outbound`, sur le chemin d'export — l'agent ne peut pas le bypasser via JSON-RPC. `interactive:false` garde la targeting SAFE_MODE active (`sending-gate.ts:296-301`) : un compte fraîchement importé/non-revu n'est **pas** exporté. Gates traversés : opt-out (`:216`), suppression DB (`:240`), email-status (`:258`), lawful-basis (`:270`), deliverability (`:283`), targeting (`:296+`). `catch → exportable:false` (`:339`).

**Directive respectée** : `evaluateSend` est ici un **oracle d'éligibilité** (« ce prospect peut-il être contacté légalement ? »), **pas** un envoi. Elevay n'envoie **jamais** ses colds via Instantly (mémoire `elevay-own-infra-sending` — conflit warmup, creds jamais cédées) ; l'envoi est celui d'Instantly, sur les comptes **du client**. On ne touche ni `sendViaMailbox` ni owner-SMTP sur ce chemin.

**Mode générique** (sans Instantly) : `destination:"generic"` → l'agent appelant (2e Claude, Cursor, MCP du client) reçoit le **brief imbriqué complet** (pas de flatten) + `citableFacts[]`/`doNotClaim[]` en `structuredContent` ; il écrit+envoie sur sa pile, et peut interroger notre verdict via `evaluate_send` (dry-run, `sending-gate.ts:212`). `destination:"webhook"` → POST HMAC-signé d'une enveloppe portant **à la fois** le map plat (moteurs de template) et le `brief` complet (agents IA) — handoff vendor-neutre (Smartlead/Lemlist/maison).

**API Instantly à encoder** : base `https://api.instantly.ai/api/v2`, header `Authorization: Bearer <clé V2>` ; `POST /api/v2/leads` (single) / `/api/v2/leads/list` (bulk ≤1000) ; `campaign_id` XOR `list_id` ([moveleads](https://developer.instantly.ai/api/v2/lead/moveleads)) ; `429` documenté → backoff exponentiel ([campaign API](https://developer.instantly.ai/api/v2/campaign)). Clé per-tenant = `INSTANTLY_API_KEY` sur `TenantSettings` (NET-NEW, 0,5 j-h).

## 4. La démo 2 min révisée

Delta sur `signal-agent-prd-2026-06-27.md` §5 : la table seconde-par-seconde y est ; ici, ce qui change est le **climax**. Le mail n'est plus écrit par Elevay (beats 1:12-1:42 du PRD) mais par un agent tiers à partir de notre brief.

**Le WOW = avant/après sur le même lead** (1:18-1:40) :
- Même modèle, même prompt-cadre, exécuté 2×. **SANS** brief (firmo de base seulement) → prose générique (« I came across Hexa… »). **AVEC** brief (JSON injecté) → cite `whyNow` + `citableFacts[0]` (un `publicContent type:"metric"`, `types.ts:109`).
- La supériorité est **structurelle** : le mail « avec » contient une citation `verified:true` que le « sans » ne peut pas inventer ; `doNotClaim[]` empêche l'hallucination. Argument anti-slop.
- **2e demi-WOW (1:40-1:52)** : `export_to_outbound` sur un compte-piège `unreviewed` → `{exported:false, code:"not_targeted"}`. On ne livre QUE l'autorisé.

**Pré-seed (delta — la dépendance bloquante nouvelle)** : au-delà des pièges du PRD (P1 targeting `TARGETING_GATE_ENABLED=on`, P2 insérer-puis-scorer, fenêtre 08-18, allowlist), **le compte héros DOIT avoir ≥1 `publicContent.type:"metric"` + firmographics+provenance non-vides** (`firmographicsHaveSignal` `build-intelligence-brief.ts:198` vrai), brief **pré-construit la veille** via `buildIntelligenceBrief`. Sans fait citable, « avec brief » ≈ « sans brief » et le WOW meurt.

**Plan B** : agent tiers = Instantly (custom variables visibles à l'écran, interop concrète) ; **fallback = 2e Claude** (contexte vierge + JSON brief, déterministe à câbler). LLM tiers non-déterministe → 2 sorties avant/après **figées la veille**. Tout casse → démo pré-enregistrée 1080p (règle dure mémoire).

**Réel vs net-new** (delta) :

| Beat | RÉEL (file:line) | NET-NEW | j-h |
|---|---|---|---|
| 0:36-0:58 `get_outreach_brief` | brief entier existe (`types.ts:50`, `readCachedBrief :190` 0-LLM, `publicContent type:"metric" :109`, provenance `:72`) | `lib/mcp/outreach-brief.ts` (assemblage + `citableFacts`/`doNotClaim`) + case + schéma | 1,5 |
| 0:58-1:40 agent tiers + WOW | `toInstantlyCustomVariables` scalaire (`send-adapter.ts:19`), `instantly-client.ts` | flatten brief→customVars + harnais avant/après | 1,0 |
| 1:40-1:52 export gaté | `evaluateSend :212`, targeting `:301`, `catch :339` | `lib/mcp/export-to-outbound.ts` (gate-dans-le-wrapper + push) | 1,5 |

## 5. Delta sur le PRD

**FR qui changent** :
- **FR-9** (`signal-agent-prd-2026-06-27.md:209`) : `draft_outreach` (`{subject,body,...}`) → **`get_outreach_brief`** (`{citableFacts[],doNotClaim[],whyNow,messaging,...}`, zéro prose). Effort inchangé ≈ 1,0 j-h (l'assemblage whitelist/denylist remplace le câblage `generateOpener`).
- **Nouvelle FR (FR-14) — `export_to_outbound`** : `prospectIds[] → gate → flatten → POST Instantly | webhook | generic`. ≈ 3,0 j-h (orchestrateur 1,5 + flatten 1,0 + client/dedup/429 0,5). Les gates de FR-10/FR-11 (`evaluateSend`) **s'appliquent à l'export** : `interactive:false` y maintient la targeting SAFE_MODE.
- **FR-11** (`send_message`, `:226`) : conservée mais **hors du slice brief** — le climax devient `export_to_outbound`. Économie nette ≈ 1,5 j-h (pas de chemin owner-SMTP/`sendViaMailbox` à exposer pour ce scénario).
- **FR-12** (annotations + `structuredContent`, `:265`) : inchangée mais **désormais bloquante** — le brief exige `outputSchema`+`structuredContent` (`route.ts:953-957`), pas seulement un blob texte.

**Scope qui bouge** : slice PRD ≈ 9,5 j-h → **slice brief ≈ 8,0 j-h** : on supprime `draft_outreach` prose (−1,0), on retire `send_message` du chemin démo (−2,0) et on ajoute `export_to_outbound` (+3,0 mais 100% REUSE des gates), `get_outreach_brief` réutilisant un brief déjà construit (0 nouvelle intelligence).

**Ce qui devient plus simple** :
1. On **ne gère plus la qualité de prose** (longueur, ton, CTA, anti-template) — c'est le problème de l'agent aval ; on lui donne le cadre (`messaging.methodology`), pas le texte.
2. Le risque « copy vide » (mémoire `project_copy-quality-eval`, `gradeEmail` 0.57) **disparaît** : aucun `generate-message`/`copy_asset_block` sur ce chemin.
3. Pas de gestion d'envoi propre (fenêtre, caps, owner-SMTP) dans le slice : `evaluateSend` sert d'oracle, l'envoi est exporté.

## 6. Positionnement

Elevay = la **couche d'intelligence amont** — brief vérifié, sourcé et gaté — qui rend **n'importe quel agent outbound parfait et sûr**, au lieu d'être un *sender* de plus. Clay enrichit (données brutes, l'agent doit encore décider du quoi/quand) ; Monaco écrit+envoie dans sa propre boucle fermée. Elevay produit l'artefact intermédiaire que ni l'un ni l'autre n'exporte : `whyNow` daté + `citableFacts[]` (ce qu'on peut affirmer) + `doNotClaim[]` (ce qu'on ne doit pas) + le verdict de gate — consommable par Instantly, Clay, ou un agent maison, **sans accès à rien d'autre**.