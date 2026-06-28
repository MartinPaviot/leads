# LOT 3 — `brief-mcp` · BRIEF DE LOT AUTO-SUFFISANT

> **Pour la session Claude qui exécute ce lot.** Tu n'as QUE ce fichier + les docs pointées.
> N'invente rien, ne redérive rien : tout ce dont tu as besoin (contrat A–G, signatures,
> `file:line` REUSE **vérifiés**, patchs route, tests) est ici. Branche `feat/orion-pack3`.
> Décisions DB du founder = **autoritaires** (rappel §0 ci-dessous). Convention de chemins : Orion est
> un **repo SÉPARÉ** (app Next/pnpm autonome, package `@orion/web`), ses fichiers vivent sous **`src/`**.
> Tout `file:line` REUSE non préfixé désigne la **SOURCE Elevay À COPIER** (la provenance), relative à
> **`C:/Users/ombel/leads/app/apps/web/src/`** (le repo Elevay d'où l'on **copie** le module) ; le module
> copié vit sous le même chemin relatif dans `src/`. Les modules Elevay sont **vendorés (copiés)**, **PAS**
> importés via workspace (décision founder).

---

## 0. RAPPEL DÉCISIONS DB (priment sur tout langage antérieur)

- **DB = celle du repo `leads`** (Supabase Postgres d'Elevay), **PARTAGÉE** via `DATABASE_URL`.
  PAS de DB séparée, PAS de Convex. Schéma Orion = **additif**.
- **SCOPE = tenant `elevay` UNIQUEMENT.** Isolation RLS : runtime en rôle restreint **`elevay_app`**
  + **`withTenantTx(elevayTenantId, fn)`** (`db/rls.ts:44-54`). PIÈGE Supavisor :
  `set_config(..., true)` = **TRANSACTION-LOCAL** ; **JAMAIS** `set_config(..., false)`. **Jamais**
  d'écriture via le rôle owner au runtime (owner = migrations one-shot).
- **Modules Elevay COPIÉS (vendorés) dans Orion** (même schéma, même DB partagée), **non importés via
  workspace** ; copie fidèle depuis leurs `file:line` sources Elevay, jamais réécrite.
- **`tenantId` vient TOUJOURS du Bearer `mcp_*`** (`authenticateMcpRequest`, `route.ts:230`),
  résolu serveur → tenant `elevay`. **JAMAIS** un argument d'outil (tripwire `no-tenant-arg`).
- **Brief ZÉRO prose** : `citableFacts[]`/`doNotClaim[]`, why-now daté/sourcé, verdict gate comme
  donnée. **Aucun `subject`, aucun `body`.** Le gate `evaluateSend` est l'oracle d'éligibilité
  **non-contournable** (vit DANS le wrapper d'export — pack4, pas ici).

---

## 1. OBJECTIF + PÉRIMÈTRE

### 1.1 Objectif

Exposer l'**intelligence prospect** comme surface MCP agent-native, propre et sûre, par-dessus
l'`IntelligenceBrief` Elevay déjà construit (REUSE) — **sans nouvelle intelligence, sans prose**.

Quatre livrables :

1. **`get_outreach_brief`** — wrapper de **mise en forme** au-dessus de `buildIntelligenceBrief`
   (REUSE `build-intelligence-brief.ts:26`). Assemble les **7 sections A–G** + `citableFacts[]`
   (whitelist) / `doNotClaim[]` (denylist). **Zéro `subject`/`body`.** (T-28)
2. **Durcissement protocole MCP** — patch `app/api/mcp/route.ts` : `structuredContent` (**P0**) +
   `outputSchema` + `annotations` (`readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`)
   par outil + **bump `protocolVersion` `"2024-11-05"`→`"2025-06-18"`** + `capabilities:{tools,
   resources}`. (T-29)
3. **`evaluate_send`** (dry-run, lecture de règle) + **resources** (`crm://company/{id}/dossier`,
   `crm://policy/sending-rules`). (T-31 ; T-30 `[P1]`)
4. **Outils de découverte read-only** (demande founder, portés dans ce lot) : **`find_prospects`**,
   **`get_signals`** (mode `cached` uniquement — `deep`/SSE = P2, hors lot), **`explain_priority`**.

### 1.2 IN (ce lot crée/édite)

- Assembleur du brief + dérivation `citableFacts`/`doNotClaim`.
- Wrappers MCP fins (10–40 lignes chacun) : `get_outreach_brief`, `evaluate_send`,
  `find_prospects`, `get_signals` (cached), `explain_priority`.
- Module registre `brief-tools.ts` (un `McpToolModule` agrégeant ces outils + handlers).
- Patch **dans les balises** de `route.ts` (proto bump + `structuredContent` + `outputSchema`/
  `annotations` câblés par le dispatch).
- Resources MCP (`resources.ts`, `[P1]`).

### 1.3 OUT (possédé par d'autres lots — NE PAS TOUCHER)

| Hors-périmètre | Propriétaire | Détail |
|---|---|---|
| `evaluateSend` (corps du gate) | Elevay (REUSE) + **pack1** | `sending-gate.ts:212-346` — **copié depuis Elevay tel quel**, jamais édité. |
| `buildIntelligenceBrief`, `IntelligenceBrief` | Elevay (REUSE) | `build-intelligence-brief.ts:26`, `types.ts:50` — importés, jamais édités. |
| zod `OutreachBrief` (le **schéma** de validation) | **pack1** | `lib/mcp/contracts/outreach-brief.schema.ts` — **importé** ici, pas défini ici. |
| Squelette route MCP + registre + types | **pack0** | `app/api/mcp/route.ts` (base), `lib/mcp/registry.ts`, `lib/mcp/types.ts` — pack3 patche **uniquement** dans les balises `<<< ORION:* >>>`. |
| Auth Bearer MCP (`authenticateMcpRequest`) | **pack0** (REUSE Elevay) | `route.ts:230,249,264`. |
| Tables `ingest_*`/`integration_credentials`/`export_*`/`signal_snapshots` | **pack1** | additives. |
| `export_to_outbound` + destinations + gate-dans-le-wrapper + flatten Instantly | **pack4** | `lib/mcp/export-to-outbound.ts`, `lib/outbound/*`. **C'est pack4 qui appelle le gate avant push, pas pack3.** |
| Ingestion (`ingest_csv`/`ingest_from_provider`/`get_ingest_job`) + `mcp-handlers` | **pack2** | `lib/ingest/*`. |
| `enroll_in_sequence`, `send_message` | hors slice MVP | non livrés ici. |
| Sources Tier 2 / velocity | **pack5** `[P1]` | — |
| UI 4 écrans | **pack6** | — |

> **Ne crée jamais** `lib/mcp/export-to-outbound.ts`, `lib/mcp/outbound-tools.ts`,
> `lib/ingest/mcp-handlers.ts` : ce sont les fichiers de pack4/pack2. Collision = échec du lot.

---

## 2. PRÉREQUIS

### 2.1 Lots à finir avant (durs)

- **pack0** mergé : la coquille boote (`pnpm install --frozen-lockfile` + `pnpm tsc` verts), et
  fournit :
  - `app/api/mcp/route.ts` (squelette) avec auth Bearer (`authenticateMcpRequest`), envelope
    JSON-RPC, `initialize`/`tools/list`/`tools/call`, et les **balises** `// <<< ORION:MCP-INIT >>>`
    et `// <<< ORION:MCP-MODULES >>>`.
  - `lib/mcp/registry.ts` (agrégateur `MCP_MODULES`, append-only) + `lib/mcp/types.ts`
    (`McpToolModule = { tools: ToolDef[]; handlers: Record<string, Handler> }`, `ToolDef`,
    `Handler`).
  - AI provider tracé (`lib/ai/ai-provider.ts`, `traced-ai.ts`) — **non utilisé par ce lot**
    (brief = 0-LLM via cache), mais présent.
- **pack1** mergé : fournit
  - le **zod `OutreachBrief`** : `lib/mcp/contracts/outreach-brief.schema.ts` (autorité serveur de
    la forme A–G — **tu valides contre lui**).
  - les wrappers d'import (si présents) `lib/campaign-engine/brief.ts` (réexport
    `buildIntelligenceBrief`) et `lib/guardrails/sending-gate.ts` (réexport `evaluateSend`).
    **Si ces réexports existent, importe-les ; sinon importe directement les modules copiés d'Elevay
    (vivant sous `src/` dans Orion).**
  - la taxonomie `lib/signals/taxonomy.ts` (DÉP-1) — requise pour que `get_signals.polarity` et les
    multipliers ne tombent pas au **plancher 1.0×** (bug `signals-world-class`).

### 2.2 Cartes nécessaires de `00-PREREQUISITES.md`

- **DÉP-3 (T-29, P0 bloquant)** : `tools/call` renvoie aujourd'hui `{content:[{text:JSON}]}`
  (blob opaque, vérifié `route.ts` ~951-960). Sans `structuredContent` + `outputSchema`, le brief
  structuré est inexploitable par l'agent. **C'est le cœur de ce lot.**
- **Piège #11 (Next page-export build gap)** : sans objet `(orion)` page ici, non concerné — mais si
  tu touches un `page.tsx`/`layout.tsx`, exports nommés → siblings `_`. (Ce lot ne crée pas de page.)
- **Tenant `elevay` doit exister** (DB7/G2) : sinon `authenticateMcpRequest` → 401 et
  `get_outreach_brief`/`find_prospects` n'ont pas de tenant à interroger. Vérif opérateur (SELECT
  §1.2 de `00-PREREQUISITES.md`). **Tu codes contre fixtures ; l'intégration live est pack7.**
- **Hero pré-seedé** (DÉP-4, T-42, pack7) : pour la VERIFY live, un sujet avec ≥1
  `publicContent.type:"metric"` + firmo/provenance non-vides + brief pré-construit (cache 14 j). En
  dev, **monte tes propres fixtures** (§4.7) ; ne dépends pas du seed pack7 pour tes tests unitaires.
- **Invariants transverses** (`00-EXECUTION-GUIDE §4`) : `tenantId` jamais argument ; annotations =
  hints non-fiables (ne remplacent **jamais** `evaluateSend`) ; `tsc`+`vitest` verts ; un changement
  logique par commit ; pathspecs scopés (jamais `git add -A`).

### 2.3 À lire avant de coder (et rien de plus)

- `research/signal-outreach-brief-2026-06-27.md` §1 (contrat A–G complet, provenance par champ) +
  §2 (surface MCP révisée) + §3 (grounding).
- `research/signal-agent-mcp-2026-06-27.md` §3.2/§3.3/§3.5 (annotations/outputSchema/resources,
  catalogue outils, extension exacte de `route.ts`).
- `design.md §7` (PIPELINE BRIEF — 7.1 contrat, 7.2 input, 7.3 delta route).
- `tasks.md` T-28/T-29/T-30/T-31 (verify + tests imposés).

---

## 3. FICHIERS POSSÉDÉS PAR CE LOT (création/édition exclusives)

`src/` (repo Orion) sauf mention. **REUSE** = module Elevay **copié depuis** sa source (file:line
provenance, jamais édité après copie). **NET-NEW** = fichier créé par ce lot.

| Fichier | Statut | Rôle |
|---|---|---|
| `lib/mcp/outreach-brief.ts` | **NET-NEW** (create) | Assembleur A–G + dérivation `citableFacts`/`doNotClaim` ; handler `get_outreach_brief`. |
| `lib/mcp/evaluate-send.ts` | **NET-NEW** (create) | Wrapper dry-run miroir de `SendingGateOutcome` ; handler `evaluate_send`. |
| `lib/mcp/find-prospects.ts` | **NET-NEW** (create) | Découverte rankée (priority_score DESC) + whyNow ; handler `find_prospects`. |
| `lib/mcp/get-signals.ts` | **NET-NEW** (create) | Lecture `properties.signals[]` (mode `cached`) + multiplier + suggestedAngle ; handler `get_signals`. |
| `lib/mcp/explain-priority.ts` | **NET-NEW** (create) | Décompose `computePriorityScore` (factors) ; handler `explain_priority`. |
| `lib/mcp/brief-tools.ts` | **NET-NEW** (create) | **Module registre** : agrège les 5 outils ci-dessus (+ resources) en un `McpToolModule` (`{tools, handlers}`) avec `outputSchema`/`annotations`. C'est CE module que `registry.ts` importe. |
| `lib/mcp/resources.ts` | **NET-NEW** (create) `[P1]` | `crm://company/{id}/dossier` + `crm://policy/sending-rules` ; handlers `resources/list\|read\|templates`. |
| `app/api/mcp/route.ts` | **MODIF** (balises uniquement) | T-29 : dans `// <<< ORION:MCP-INIT >>>` → proto `2025-06-18`, `capabilities:{tools:{},resources:{}}` ; dans `tools/call` → ajouter `structuredContent: result` ; router `resources/*`. **Ne réécris rien hors balises.** |
| `lib/mcp/registry.ts` | **MODIF** (1 ligne append-only) | Ajouter `import { briefTools } from "@/lib/mcp/brief-tools";` dans `// <<< ORION:MCP-MODULES >>>` + `briefTools` dans `MCP_MODULES[]`. |
| `__tests__/outreach-brief.test.ts` | **NET-NEW** | T-28. |
| `__tests__/mcp-protocol.test.ts` | **NET-NEW** | T-29. |
| `__tests__/evaluate-send.test.ts` | **NET-NEW** | T-31. |
| `__tests__/find-prospects.test.ts` | **NET-NEW** | découverte. |
| `__tests__/explain-priority.test.ts` | **NET-NEW** | découverte. |
| `__tests__/mcp-resources.test.ts` | **NET-NEW** `[P1]` | T-30. |

> **Anti-collision :** `route.ts` et `registry.ts` sont partagés (registre append-only) — touche
> **uniquement** tes balises/ta ligne. Si pack2/pack4 ajoutent leurs lignes en parallèle et que ça
> conflit → **garder les deux** (additif). Si tu veux zéro contention, livre `brief-tools.ts` et
> **délègue le câblage du registre à pack7** (note-le dans la PR).

### 3.1 Carte REUSE (modules Elevay COPIÉS depuis ces `file:line` — provenance vérifiée, JAMAIS édités après copie)

| Module (copié depuis Elevay) | `file:line` source Elevay | Usage dans ce lot |
|---|---|---|
| `buildIntelligenceBrief` | `lib/campaign-engine/build-intelligence-brief.ts:26` | source du brief (`refresh` → `forceRefresh`, option `:30`). |
| `readCachedBrief` | `build-intelligence-brief.ts:190` | lecture **0-LLM** quand `refresh:false`. |
| cap metric + `briefIsEmpty` | `build-intelligence-brief.ts:227-234,245` | base de `citableFacts` + `briefCompleteness`. |
| `IntelligenceBrief` + `FieldProvenance`/`FirmographicFacts`/`PublicContentPiece`/`WarmthSignal`/`CommunicationStyle`/`SourceError` | `lib/campaign-engine/types.ts:50-75` (firmo `:11-22`, provenance `:26-30`, publicContent `:106-114`, warmth `:122-125`, comm-style `:116-120`, sourceError `:127-131`) | formes d'entrée. |
| `SignalEntry` / `personFromSignals` | `lib/signals/record-signal.ts:40-45` / `:61` (`SignalPerson :30-37`) | topSignal + `recommendedPerson`. |
| `isSignalFresh` / `ttlDaysFor` | `lib/signals/freshness.ts:98` / `:88` (TTL `:31` ; « périmé pire qu'aucun » `:5-8`) | `whyNow.topSignal.fresh`/`ttlDays`. |
| `computePriorityScore` + floors | `lib/scoring/priority-score.ts:70` (floors `:54-55`, `ContactReachability :85-89`) | `priorityScore`+`priorityFactors` + `persona.reachable`. |
| `GeneratedOpener.angle`/`.guardrails` | `lib/scoring/signal-opener.ts:135` / `:139` | `angleKey` + base de `doNotClaim`. |
| `getMethodology` / `SIGNAL_ANGLES` / `pickBestSignal` | `lib/scoring/outbound-methodologies.ts:144` / `:159-208` / `:217` (`Methodology.whatNotToDo :18`) | `methodology`/`angleGuidance` + priorité warm-path. |
| `ProspectContext` (contact, firmo, signaux frais) | `context/prospect-context.ts:138-167,267-279` (commentaire grounding `:358`) | persona + firmo + signaux. |
| `judgeFabrication` (réf. conceptuelle) | `lib/guardrails/fabrication-gate.ts:173` | l'analogue transposé en **donnée** (`doNotClaim`). |
| grounding (réf.) | `lib/campaign-engine/db-evidence.ts:6,29`, `generate-message.ts:158,167,185,204,236` | la frontière de vérité = liste d'evidence, **pas** le LLM. |
| `evaluateSend` + `SendingGateOutcome` | `lib/guardrails/sending-gate.ts:212-346` (catch `:339`) | `meta.gate` + `evaluate_send`. |
| `authenticateMcpRequest` (via pack0) | `app/api/mcp/route.ts:230,249,264` | `tenantId` serveur. |
| `handleGetCompany` (resources `[P1]`) | `app/api/mcp/route.ts:475` | dossier prospect. |

> **Préférence d'import (local, dans Orion) :** ces modules sont **copiés** d'Elevay et vivent sous
> `src/` du repo Orion ; tu les importes en **local** (`@/…`). Si pack1 a publié les seams
> `lib/campaign-engine/brief.ts` (réexport `buildIntelligenceBrief`) et `lib/guardrails/sending-gate.ts`
> (réexport `evaluateSend`), importe **ces seams** ; sinon importe les modules copiés ci-dessus. Le
> comportement est identique (même DB partagée, même code copié).

---

## 4. ÉTAPES ORDONNÉES

> Discipline par tâche : **code → TEST écrit → VERIFY exécuté soi-même (preuve : log) → commit
> unique**. Re-vérifie `git rev-parse --abbrev-ref HEAD == feat/orion-pack3` avant chaque commit.
> Trailer obligatoire (cf. `00-EXECUTION-GUIDE §4`).

### Étape 1 — Démarrage & contrats importés

**Action.** `git fetch origin && git checkout main && git pull` ; `git checkout -b feat/orion-pack3`
(ou checkout existant) ; `git rebase origin/main` (récupère pack0+pack1) ; `cd app && pnpm install
--frozen-lockfile && pnpm --filter @orion/web tsc`. Ouvre et lis le **zod `OutreachBrief`** de
pack1 (`lib/mcp/contracts/outreach-brief.schema.ts`) — c'est l'autorité de forme contre laquelle tu
codes. Note les noms de champs exacts (A–G). Vérifie la présence des balises pack0 dans `route.ts`
(`<<< ORION:MCP-INIT >>>`) et `registry.ts` (`<<< ORION:MCP-MODULES >>>`) + le type `McpToolModule`
(`lib/mcp/types.ts`).

**VERIFY.** `pnpm --filter @orion/web tsc` vert sur l'install propre ; `grep -n "ORION:MCP-INIT"
src/app/api/mcp/route.ts` (repo Orion) renvoie une ligne ; le zod `OutreachBrief` exporte bien les 7
sections.

**TEST.** — (étape de cadrage, pas de test).

---

### Étape 2 — T-29 : durcissement protocole (P0, fait EN PREMIER car les autres outils en dépendent)

**Action.** Patch `app/api/mcp/route.ts`, **dans les balises uniquement** :

1. `initialize` (`route.ts:~919-930`, actuel `protocolVersion:"2024-11-05"`, `capabilities:{tools:{}}`)
   → dans `// <<< ORION:MCP-INIT >>>` : `protocolVersion: "2025-06-18"` +
   `capabilities: { tools: {}, resources: {} }`. Négocie via le header `MCP-Protocol-Version` si pack0
   l'expose.
2. `tools/call` (`route.ts:~951-960`, actuel renvoie `content`-seul) → après calcul de `result`,
   renvoyer **les deux** (rétro-compat) :
   ```ts
   return jsonRpcSuccess(id, {
     content: [{ type: "text", text: JSON.stringify(result, null, 2) }], // rétro-compat
     structuredContent: result,                                          // P0 — objet typé
   });
   ```
3. `tools/list` : aucun changement de code requis si chaque `ToolDef` (fourni par les modules du
   registre) porte déjà `annotations` + `outputSchema` (c'est toi qui les poses dans `brief-tools.ts`,
   étape 4). `route.ts` itère `MCP_MODULES` → les annotations/outputSchema **remontent
   automatiquement** dans `tools/list`.
4. Router `resources/list|read|templates` vers tes handlers (étape 8, `[P1]`) — laisse le `case` en
   place mais branché sur `resources.ts` (peut renvoyer liste vide tant que P1 non livré).

**Signature clé (annotation MCP — rappel des hints).**
```ts
type ToolAnnotations = {
  readOnlyHint?: boolean; destructiveHint?: boolean;
  idempotentHint?: boolean; openWorldHint?: boolean;
};
// défaut absent = destructiveHint:true → TOUTE lecture pure DOIT être annotée readOnly.
```

**VERIFY (exécuté soi-même).** Lance le serveur dev (`pnpm dev`) ou un test d'intégration ;
`curl -s -X POST .../api/mcp -H "Authorization: Bearer mcp_…" -d '{"jsonrpc":"2.0","id":1,
"method":"initialize"}'` → `result.protocolVersion == "2025-06-18"` et `capabilities.resources`
présent. Un `tools/call` quelconque → la réponse contient **`structuredContent`** ET `content`.

**TEST — `__tests__/mcp-protocol.test.ts`.** (a) `initialize` annonce `"2025-06-18"` +
`capabilities.resources` ; (b) `tools/call` renvoie `structuredContent` non-vide ET typé (parse-free) ;
(c) le `ToolDef` `get_outreach_brief` porte `annotations.readOnlyHint === true`, et (une fois pack4
câblé en pack7) `export_to_outbound` porte `destructiveHint === true` — ici asserte au moins que
**toute** lecture pure de `briefTools` est `readOnlyHint:true` ; (d) chaque `ToolDef` a un
`outputSchema`.

---

### Étape 3 — T-28 : `get_outreach_brief` + assembleur A–G (zéro prose)

**Action.** Crée `lib/mcp/outreach-brief.ts`. Input zod (autorité serveur) :
```ts
export const GetOutreachBriefInput = z.object({
  subjectType: z.enum(["contact", "company"]).default("contact"),
  subjectId:   z.string(),
  channel:     z.enum(["email", "linkedin"]).default("linkedin"),
  refresh:     z.boolean().default(false),   // → buildIntelligenceBrief forceRefresh (build-intelligence-brief.ts:30)
  gateCheck:   z.boolean().default(true),    // embarque le verdict evaluateSend dans meta.gate
});
```
Annotation outil : `{ readOnlyHint:true, idempotentHint:true, openWorldHint:false }`.

Pipeline du handler (`tenantId` = argument serveur, **pas** d'`inputSchema`) :
1. Résoudre `companyId`/`contactId` depuis `subjectType`/`subjectId` (si `contact` → lire la company
   liée via `ProspectContext`/`contacts`).
2. `brief = refresh ? await buildIntelligenceBrief(companyId, tenantId, contactId, {forceRefresh:true})
   : await readCachedBrief(tenantId, companyId)` (fallback `buildIntelligenceBrief` si cache miss).
3. Assembler les **7 sections** (cf. §5 — contrat exact). **Aucun `subject`/`body`.**
4. Si `gateCheck` → `meta.gate = { exportable, verdict }` via `evaluateSend({ tenantId, toAddress,
   companyId, contactId, isCold:true, interactive:false })` (REUSE `sending-gate.ts:212`). On **ne
   livre** PAS le mail, on livre le **verdict** comme donnée.
5. **Valider la sortie contre le zod `OutreachBrief` de pack1** avant de la retourner (autorité
   serveur ; jette si non conforme → bug d'assemblage, pas un retour silencieux).

**Règle de dérivation `citableFacts` / `doNotClaim` (NET-NEW — LA valeur du pivot) :**
- `citableFacts[] = publicContent.filter(p => p.type === "metric")` (déjà cappés 6,
  `build-intelligence-brief.ts:227-234`) **∪** firmo+provenance (`:238-240`), chacun
  `{ fact, value, source, url?, quote?, verified: true }`.
- `doNotClaim[] =` `GeneratedOpener.guardrails` (`signal-opener.ts:139` = `Methodology.whatNotToDo`)
  **+ dérivés** : pour **chaque** champ firmo `null` OU sans entrée `firmographicProvenance` →
  `"ne pas affirmer {field}"` ; **+** base constante : `"aucune métrique fabriquée"`,
  `"pas d'effectif non cité"`, `"toute affirmation chiffrée doit venir de citableFacts"`.
- `groundingNote` (NET-NEW) : `"toute affirmation chiffrée vient de citableFacts ; sinon rester
  qualitatif."`

**VERIFY (soi-même).** Sur une fixture avec ≥1 metric → `citableFacts` non-vide, chaque entrée
`verified:true`. Sur une fixture avec `employeeCount:null` → `doNotClaim` contient
`"ne pas affirmer employeeCount"`. `JSON.stringify(brief)` ne contient **ni** `"subject"` **ni**
`"body"` (grep la sortie).

**TEST — `__tests__/outreach-brief.test.ts`.** (a) sortie valide le zod `OutreachBrief` ;
(b) `citableFacts` dérivé d'un `publicContent type:"metric"` avec `verified:true` ; (c) un champ firmo
`null`/sans provenance → entrée `doNotClaim` correspondante ; (d) **aucune** clé `subject`/`body`
nulle part dans l'objet ; (e) `channel` par défaut `"linkedin"` ; (f) `gateCheck:true` → `meta.gate`
présent ; (g) signal périmé → `whyNow.topSignal.fresh === false`.

---

### Étape 4 — Module registre `brief-tools.ts` (câblage des outils)

**Action.** Crée `lib/mcp/brief-tools.ts` qui exporte un `McpToolModule` (`{ tools, handlers }`,
type pack0 `lib/mcp/types.ts`) agrégeant **tous** les outils de ce lot, chacun avec `inputSchema`
(JSON-Schema dérivé du zod), `outputSchema`, `annotations`, `description` :
```ts
import type { McpToolModule } from "./types";
export const briefTools: McpToolModule = {
  tools: [
    { name: "get_outreach_brief", description: "...", inputSchema, outputSchema: outreachBriefJsonSchema,
      annotations: { readOnlyHint: true,  idempotentHint: true,  openWorldHint: false } },
    { name: "evaluate_send",      description: "...", inputSchema, outputSchema,
      annotations: { readOnlyHint: true,  idempotentHint: true,  openWorldHint: false } },
    { name: "find_prospects",     description: "...", inputSchema, outputSchema,
      annotations: { readOnlyHint: true,  idempotentHint: true,  openWorldHint: false } },
    { name: "get_signals",        description: "...", inputSchema, outputSchema,
      annotations: { readOnlyHint: true,  openWorldHint: false } }, // cached only; deep=P2
    { name: "explain_priority",   description: "...", inputSchema, outputSchema,
      annotations: { readOnlyHint: true,  idempotentHint: true,  openWorldHint: false } },
  ],
  handlers: {
    get_outreach_brief: getOutreachBriefHandler,
    evaluate_send:      evaluateSendHandler,
    find_prospects:     findProspectsHandler,
    get_signals:        getSignalsHandler,
    explain_priority:   explainPriorityHandler,
  },
};
```
Puis **MODIF `lib/mcp/registry.ts`** (1 ligne dans chaque balise) :
```ts
// <<< ORION:MCP-MODULES (append-only — une ligne par pack) >>>
import { briefTools } from "@/lib/mcp/brief-tools";   // pack3
// <<< /ORION:MCP-MODULES >>>
export const MCP_MODULES: McpToolModule[] = [ briefTools /*, ...autres packs */ ];
```

**VERIFY.** `tools/list` (via curl ou test) liste les 5 outils, chacun avec `annotations` +
`outputSchema`. `tsc` vert.

**TEST.** Couvert par `mcp-protocol.test.ts` (étape 2) : itère `briefTools.tools`, asserte
annotations+outputSchema présents sur chacun.

---

### Étape 5 — T-31 : `evaluate_send` (dry-run, lecture de règle)

**Action.** Crée `lib/mcp/evaluate-send.ts`. Input zod (**PAS** de `tenantId`) :
```ts
export const EvaluateSendInput = z.object({
  toAddress: z.string(),
  isCold: z.boolean().optional(),
  sentTodayFromPrimary: z.number().default(0),
  companyId: z.string().optional(),   // omis → targeting force unreviewed = deny
  contactId: z.string().optional(),
  interactive: z.boolean().optional(),// n'esquive QUE le gate 7 ; les 7 autres tiennent
});
```
Handler = appel direct `evaluateSend({ tenantId, ...input })` (REUSE `sending-gate.ts:212`), sortie =
**miroir exact** de `SendingGateOutcome` : `{ send:true, reason }` OU `{ send:false, code, reason }`.
Aucune transformation. Un Bearer `viewer` ne peut **aucune** action outbound (`decide-action.ts:80`).

**VERIFY (soi-même).** `evaluate_send` sur un opt-out → `{ send:false, code:"opt_out" }`. Sur un
compte `unreviewed` avec `TARGETING_GATE_ENABLED=on` et `companyId` omis → `{ send:false,
code:"not_targeted" }`.

**TEST — `__tests__/evaluate-send.test.ts`.** (a) opt-out → `code:"opt_out"` ;
(b) unreviewed + SAFE_MODE → `code:"not_targeted"` ; (c) `tenantId` **absent** de l'`inputSchema`
(tripwire) ; (d) `companyId` omis ne contourne pas le targeting.

---

### Étape 6 — `find_prospects` (découverte rankée + whyNow)

**Action.** Crée `lib/mcp/find-prospects.ts`. Input zod :
```ts
export const FindProspectsInput = z.object({
  query: z.string().optional(),
  filter: z.object({
    industry: z.string().optional(), sizeRange: z.string().optional(), geo: z.string().optional(),
    stage: z.string().optional(), signalTypes: z.array(z.string()).optional(),
  }).optional(),
  minScore: z.number().optional(),
  limit: z.number().max(100).default(20),
  cursor: z.string().optional(),
});
```
Handler (tout sous `withTenantTx(elevayTenantId)`) : lecture `companies` triées
`priority_score DESC` (REUSE l'index `fit-recompute-core`), filtres optionnels, `query` NL →
`searchSimilar` (REUSE `route.ts:848` si exposé par pack0). Pour chaque prospect, assemble
`{ companyId, companyName, domain, priorityScore, whyNow, topSignal{type,strength,detectedAt,source,
citation}, personToContact{contactId,name,title,email,reachable}, suggestedNextTool:"get_outreach_brief"
}` + `nextCursor`. `whyNow`/citation depuis `properties.signals[]` frais + `personFromSignals`
(`record-signal.ts:61`). Annotation `{readOnlyHint:true, idempotentHint:true, openWorldHint:false}`.

**VERIFY.** Sur un tenant fixture peuplé → liste triée décroissante par `priorityScore`, chaque entrée
porte un `whyNow` non-vide quand un signal frais existe, `suggestedNextTool:"get_outreach_brief"`.

**TEST — `__tests__/find-prospects.test.ts`.** (a) tri `priorityScore` décroissant ;
(b) `minScore` filtre ; (c) pagination `cursor`/`nextCursor` ; (d) pas de `tenantId` en input.

---

### Étape 7 — `get_signals` (cached) + `explain_priority`

**Action — `lib/mcp/get-signals.ts`.** Input `{ subjectType:enum[contact,company], subjectId,
mode:enum[cached,deep].default("cached") }`. **Mode `deep` → renvoyer une erreur explicite
`"deep mode requires SSE (P2, not in this lot)"`** (ne l'implémente pas). Mode `cached` : lecture
`properties.signals[]` (REUSE `record-signal.ts:94`), multiplier appris via la **taxonomie pack1**
(`taxonomy.ts` — sinon plancher 1.0×), `suggestedAngle`. Sortie `{ subjectId, whyNow,
compositeStrength, signals[]{type,polarity,strength,detectedAt,source,evidence{url,quote,verified}},
multiplier, suggestedAngle }`. Annotation `{readOnlyHint:true, openWorldHint:false}`.

**Action — `lib/mcp/explain-priority.ts`.** Input `{ companyId }`. Handler = décompose
`computePriorityScore` (REUSE `priority-score.ts:70`, floors `:54-55`) : sortie `{ priorityScore,
factors{ signalMultiplier{value,drivenBy,reason}, fitModulator{value,icpScore,reason},
accessModulator{value,bestContactReach,reason} }, bandNote }` (~40 lignes pures). Annotation
`{readOnlyHint:true, idempotentHint:true}`.

**VERIFY.** `get_signals(mode:"cached")` sur un sujet à signaux → `signals[]` avec `polarity` non
plancher (preuve que la taxonomie pack1 mappe) ; `get_signals(mode:"deep")` → erreur explicite.
`explain_priority` → `factors` cohérents avec `priorityScore` (produit signal×fit×access).

**TEST — `__tests__/explain-priority.test.ts`.** (a) `factors.signalMultiplier × fitModulator ×
accessModulator` cohérent avec `priorityScore` ; (b) floors respectés (jamais 0). *(get_signals :
au moins un cas cached + un cas deep→erreur, dans ce fichier ou un voisin.)*

---

### Étape 8 — T-30 `[P1]` : resources MCP (dossier prospect + policy)

**Action.** Crée `lib/mcp/resources.ts` : templates `crm://company/{id}/dossier` (agrège
`handleGetCompany` `route.ts:475` + signaux+evidence + angle + contacts + deals + warm-path
différable) et `crm://policy/sending-rules` (lawful basis, fenêtre 08-18, cold policy, caps depuis
`TenantSettings`). Branche `resources/list|read|templates` dans le routeur `route.ts:917` (balises).
Différable : ne bloque pas le MVP ; si le temps manque, livre `resources.ts` non-câblé + flag dans la PR.

**VERIFY.** `resources/read crm://company/{id}/dossier` → dossier complet (1 lecture cacheable au
lieu de 4 tool calls).

**TEST — `__tests__/mcp-resources.test.ts`.** `resources/list` + `read` dossier + `read` policy.

---

## 5. CONTRAT `OutreachBrief` — LES 7 SECTIONS A–G (référence d'assemblage, zéro prose)

> Forme exacte = le zod pack1 (`lib/mcp/contracts/outreach-brief.schema.ts`). Provenance par champ
> ci-dessous (REUSE `file:line` ou **NET-NEW** = assemblage pur). **Aucun `subject`/`body` nulle part.**

**A. `identity`** — `company.{id,name,domain,industry,description,employeeCount,sizeRange,
annualRevenue,revenueRange,foundedYear,location,fundingStage,totalFunding,investors[],technologies[]}`
(REUSE `FirmographicFacts types.ts:11-22` + `companies` via `prospect-context.ts:138-150`) +
`firmographicProvenance[]{field,provider,atIso}` (`types.ts:26-30,72`). **Règle : un chiffre n'est
affirmable que si une provenance le couvre.**

**B. `whyNow`** — `topSignal{type,strength,detectedAt,source,fresh,ttlDays,evidence{url,quote,
verified}}` (REUSE `SignalEntry record-signal.ts:40-45` ; `fresh`←`isSignalFresh freshness.ts:98` ;
`ttlDays`←`ttlDaysFor :88`) ; `signals[]` (frais, `prospect-context.ts:156-167`) ; `whyNowSummary`
(**NET-NEW**, 1 phrase) ; `priorityScore` (`priority-score.ts:70`) ; `priorityFactors{signalMultiplier,
fitModulator,accessModulator}` (floors `:54-55`).

**C. `messaging`** (PAS de prose) — `bestAngle` (`types.ts:64`) ; `angleKey` (`signal-opener.ts:135`) ;
`angleGuidance{angleTemplate,businessImplication,questionSeed}` (`SIGNAL_ANGLES
outbound-methodologies.ts:159-208`) ; `painPoints[]` (`types.ts:63`) ; `competitorDetected`
(`types.ts:61`) ; `communicationStyle{formality,preferredLength,tone}` (`types.ts:116-120`) ;
`methodology{name,structure,maxWords,toneNotes,ctaType}` (`getMethodology :144`) ; `suggestedCta`
(`Methodology.ctaType :18`) ; `channel` (input, défaut **linkedin**) ; `timing{sendWindow,recipientTz,
signalFreshUntilIso}` (`GuardrailsConfig.sendWindow types.ts:210-215` + TTL).

**D. `warmPath`** — `warmthSignals[]{type,detail}` (`WarmthSignal types.ts:122-125`) ;
`recommendedPerson{contactId,name,title,email?,linkedinUrl?}` (`personFromSignals record-signal.ts:61`,
`SignalPerson :30-37` — **le producteur du signal, pas le top-séniorité par défaut**).

**E. `citableFacts[]` (whitelist) + `doNotClaim[]` (denylist) + `groundingNote`** — **LA valeur du
pivot.** Dérivation : §4 étape 3. `citableFacts[]{fact,value,source,url?,quote?,verified:true}`
(**NET-NEW** depuis `publicContent type:"metric"` ∪ firmo+provenance). `doNotClaim[]` (**NET-NEW**
depuis `signal-opener.ts:139` + dérivés des firmo `null`). Analogue agent-natif de `judgeFabrication`
(`fabrication-gate.ts:173`) transposé en **donnée**.

**F. `persona`** — `contactId/fullName/title/seniority/departments[]/linkedinUrl`
(`prospect-context.ts:267-279`) + `reachable{hasEmail,hasPhone,hasLinkedin}`
(`ContactReachability priority-score.ts:85-89`). `seniority` pilote `getMethodology`.

**G. `meta`** — `sourcesAttempted/sourcesSucceeded` (`types.ts:67-68`) ; `sourceErrors[]{source,error,
statusCode?}` (`SourceError types.ts:127-131`) ; `researchedAt/expiresAt` (`types.ts:73-74`, TTL 14 j) ;
`confidence:high|medium|low` (**NET-NEW** = f(`sourcesSucceeded`, signal frais, présence provenance)) ;
`briefCompleteness:0..1` (**NET-NEW** = ¬`briefIsEmpty build-intelligence-brief.ts:245`) ;
`gate{exportable,verdict}` (`evaluateSend sending-gate.ts:212` quand `gateCheck:true`).

---

## 6. CRITÈRES D'ACCEPTATION (testables)

1. **`tools/call` renvoie `structuredContent`** (objet typé) **+** `content` (rétro-compat) ;
   `initialize` annonce `protocolVersion "2025-06-18"` + `capabilities.resources`. *(mcp-protocol.test)*
2. **Chaque outil de `briefTools`** porte `annotations` (lectures pures = `readOnlyHint:true`) **et**
   `outputSchema`. *(mcp-protocol.test)*
3. **`get_outreach_brief`** : sortie valide le zod `OutreachBrief` pack1 ; **0** occurrence de
   `subject`/`body` ; sujet à metric → `citableFacts` non-vide `verified:true` ; firmo `null` →
   entrée `doNotClaim` ; signal périmé → `topSignal.fresh:false` ; `channel` défaut `linkedin`.
   *(outreach-brief.test)*
4. **`evaluate_send`** : opt-out → `{send:false, code:"opt_out"}` ; unreviewed+SAFE_MODE →
   `code:"not_targeted"` ; **pas** de `tenantId` en input. *(evaluate-send.test)*
5. **`find_prospects`** : tri `priorityScore` décroissant, `minScore` filtre, pagination cursor,
   `suggestedNextTool:"get_outreach_brief"`, pas de `tenantId` en input. *(find-prospects.test)*
6. **`explain_priority`** : `factors` cohérents (signal×fit×access = `priorityScore`), floors
   respectés. *(explain-priority.test)*
7. **`get_signals`** : `mode:"cached"` renvoie `signals[]` (polarity non-plancher si taxonomie pack1
   en place) ; `mode:"deep"` → erreur explicite (P2 hors lot).
8. **`tenantId` jamais argument** d'aucun `inputSchema` (tripwire global respecté).
9. **Aucun fichier hors ownership §3 modifié** (`git diff --stat` scopé) ; `route.ts`/`registry.ts`
   touchés **uniquement** dans les balises / la ligne append-only.
10. **`[P1]`** : `resources/read crm://company/{id}/dossier` → dossier agrégé. *(mcp-resources.test)*

---

## 7. DEFINITION OF DONE

- `pnpm --filter @orion/web tsc` **vert** sur `pnpm install --frozen-lockfile` **propre** (pas de
  `node_modules` junctionné — divergence CI connue).
- `pnpm --filter @orion/web test` **vert** ; tous les tests §4/§6 écrits et passants.
- Tous les T-* du lot (T-28, T-29, T-31, +découverte ; T-30 `[P1]`) ont **code + TEST + VERIFY**
  exécuté soi-même (preuve : log/`curl` collé dans la PR).
- `git diff --stat` **scopé** aux fichiers §3 ; balises `route.ts`/ligne `registry.ts` seulement.
- Un commit logique par tâche, trailer présent. Branche `feat/orion-pack3` re-vérifiée avant
  chaque commit.
- PR ouverte, **CI pleine verte** (gitleaks + tsc/vitest + Vercel) → `/evaluate` → merge squash +
  delete-branch → surveiller le push CI de `main`.
- Aucun secret en clair (clés sink jamais en env/`src` — non concernées par ce lot, mais le hook
  secret-scan veille).

---

## 8. PIÈGES SPÉCIFIQUES À CE LOT

1. **`structuredContent` est P0, pas cosmétique.** Sans lui, le brief A–G arrive en blob texte
   `JSON.stringify` (`route.ts` actuel ~951-960) → l'agent aval le re-parse à l'aveugle. **C'est la
   raison d'être du lot** ; fais T-29 **en premier**.
2. **Annotations ≠ gates.** Les hints (`readOnlyHint`/`destructiveHint`) sont **non-fiables** (spec
   MCP) : ils améliorent l'UX de confirmation, ne remplacent **jamais** `evaluateSend`. Ne déduis
   aucune sécurité d'une annotation.
3. **Défaut d'annotation = `destructiveHint:true`.** Toute lecture pure non annotée est traitée
   comme destructive par un client conforme (friction). **Annoter explicitement** chaque outil
   read-only.
4. **Brief = ZÉRO prose.** Pas de `subject`/`body`, jamais. Tu ne touches **pas** `generate-message`/
   `copy_asset_block` (body vide platform-wide — mémoire `project_copy-quality-eval`). Si tu te
   surprends à générer du texte de mail, tu es hors-périmètre.
5. **Le gate dans `get_outreach_brief` est un ORACLE, pas un envoi.** `meta.gate` = `evaluateSend`
   avec `interactive:false` (garde SAFE_MODE targeting actif, `sending-gate.ts:296-301`). On livre le
   **verdict**, jamais un POST. **L'export gaté (push) est pack4**, pas ici.
6. **`tenantId` jamais dans un `inputSchema`.** Il vient du Bearer (`authenticateMcpRequest`). Un
   `tenantId` accepté en argument = faille d'isolation + échec tripwire `no-tenant-arg`.
7. **`get_signals deep` = piège de scope.** Le mode `deep` (fan-out + Sonnet 10-40s) exige SSE/
   `notifications/progress` (P2). **Ne l'implémente pas** ; renvoie une erreur explicite. Seul
   `cached` est dans ce lot.
8. **Taxonomie pack1 = prérequis dur du `polarity`/multiplier.** Sans `lib/signals/taxonomy.ts`
   (DÉP-1), `get_signals`/`explain_priority` retournent un multiplier au **plancher 1.0×** (bug
   `signals-world-class`, `signal-score-daily.ts:87`). Si pack1 ne l'a pas livré, **bloque et
   signale** — ne maquille pas.
9. **Signal périmé est PIRE qu'aucun.** `whyNow.topSignal.fresh` doit refléter `isSignalFresh`
   (`freshness.ts:98`, « périmé pire qu'aucun » `:5-8`). Ne livre jamais un signal fossile comme
   why-now.
10. **`refresh:true` coûte un build (LLM/scrape).** Par défaut `refresh:false` → `readCachedBrief`
    (`:190`, **0-LLM**). Ne force pas `forceRefresh` en démo (latence + coût). Le hero est
    pré-construit la veille (pack7).
11. **Registre append-only — collision triviale.** N'édite que TA ligne dans
    `<<< ORION:MCP-MODULES >>>`. Conflit avec pack2/pack4 → **garder les deux lignes** (additif). Au
    besoin, délègue le câblage du registre à pack7.
12. **Ne crée pas les fichiers des autres packs** : `export-to-outbound.ts`/`outbound-tools.ts`
    (pack4), `mcp-handlers.ts` (pack2), `outreach-brief.schema.ts` (pack1, tu l'**importes**).
13. **Valide la sortie contre le zod pack1** avant retour. Un brief non conforme = bug d'assemblage
    à faire échouer bruyamment, pas un `structuredContent` malformé silencieux.

---

## 9. RÉSUMÉ

- **Titre :** LOT 3 `brief-mcp` — `get_outreach_brief` (A–G, zéro prose) + durcissement protocole MCP
  (`structuredContent`/`outputSchema`/annotations/proto `2025-06-18`/resources) +
  `evaluate_send`/`find_prospects`/`get_signals` (cached)/`explain_priority`.
- **Dépendances :** pack0 (route+registry+types MCP, auth Bearer, AI) · pack1 (zod `OutreachBrief`,
  re-exports gate/brief, taxonomie). Soft : pack4 (consomme le brief au runtime, intégré pack7).
- **Étapes :** 8 (T-29 d'abord [P0], puis T-28, registre, T-31, find_prospects, get_signals+
  explain_priority, resources [P1]).
- **Fichiers possédés :** 7 NET-NEW (`lib/mcp/outreach-brief.ts`, `evaluate-send.ts`,
  `find-prospects.ts`, `get-signals.ts`, `explain-priority.ts`, `brief-tools.ts`, `resources.ts[P1]`)
  + 2 MODIF balisés (`app/api/mcp/route.ts`, `lib/mcp/registry.ts`) + 6 tests.
- **Effort :** cœur ≈ **3,5 j-h** (T-28 1,5 + T-29 1,0 + T-31 0,5 + T-30 0,5[P1]) ; +découverte
  `find_prospects` (1,0) + `get_signals` cached (0,5) + `explain_priority` (0,5) ≈ **+2,0 j-h** →
  **≈ 5,5 j-h** au total (dont ~1,0 j-h `[P1]` différable : T-30 resources).
