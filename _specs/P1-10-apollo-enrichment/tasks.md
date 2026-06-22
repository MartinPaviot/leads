# Tasks — P1-10 Apollo firmographic/funding enrichment

Estimation totale : **~2,5 jours-dev** (lake boilable ; l'agent-tool P1-9 est l'ocean flague, hors de ce decompte).

## T0 — Audit lecture (read-only)

- **Action** : relire `build-intelligence-brief.ts:186-235` (fetchAllSources), `waterfall.ts:148-192` (enrichCompany + provenance), `types.ts:11-33,103-116`, `prospect-context.ts:27-33,310-384`, `campaign.ts:22-53`. Confirmer : Apollo deja palier 10, provenance deja produite, brief n'appelle PAS le waterfall, schema sans colonnes firmographics.
- **Verify** : `grep -rn "enrichCompany\|waterfall" app/apps/web/src/lib/campaign-engine/` → 0 resultat (confirme le gap).
- **Test** : N/A.

## T1 — Types `FirmographicFacts` + `FieldProvenance` [0,25 j]

- **Action** : declarer `FirmographicFacts` et `FieldProvenance` dans `app/apps/web/src/lib/campaign-engine/types.ts` ; etendre `IntelligenceBrief` (`types.ts:1-23`) de `firmographics: FirmographicFacts | null` et `firmographicProvenance: FieldProvenance[]`. Exporter une const `EMPTY_FIRMOGRAPHICS` (toutes clefs → null/[]).
- **Verify** : `pnpm tsc` (depuis `app/`) — 0 erreur.
- **Test** : `app/apps/web/src/__tests__/firmographics-types.test.ts` — assert `EMPTY_FIRMOGRAPHICS` couvre exactement les 14 clefs de `FirmographicFacts` (garde-fou contre drift R3).
- **Refs** : R3, R10.

## T2 — Migration schema (+2 colonnes jsonb) [0,25 j]

- **Action** : ajouter `firmographics: jsonb("firmographics")` et `firmographicProvenance: jsonb("firmographic_provenance").default([])` a `intelligenceBriefs` (`db/schema/campaign.ts:22-53`) ; ecrire le SQL ALTER idempotent (`ADD COLUMN IF NOT EXISTS`) dans le dossier migrations.
- **Verify** : `pnpm db:push` sur `leadsens-localdev` puis `\d intelligence_briefs` montre les 2 colonnes ; `db:migrate:apply` pour la prod-runner.
- **Test** : `app/apps/web/src/__tests__/intelligence-briefs-schema.test.ts` — `$inferSelect` expose `firmographics` + `firmographicProvenance` (compile-time + assert sur les clefs du type).
- **Refs** : R7.

## T3 — `fetchFirmographics` + branchement dans `fetchAllSources` [0,75 j]

- **Action** : dans `build-intelligence-brief.ts`, ajouter `fetchFirmographics(domain, name, tenantId)` (waterfall `enrichCompany` borne par `withTimeout` 6000ms, soft-fail), `pickFirmographics(EnrichedCompany)` → `FirmographicFacts`, filtrage provenance aux champs firmographic ; threader `tenantId` dans `fetchAllSources` (`:186`) et ajouter la 6e tache au `Promise.allSettled` (`:211`) avec push `{ source: "firmographics", error }` (`:191`).
- **Verify** : test unitaire mockant `enrichCompany` (succes/throw/timeout) ; `pnpm test firmographics-fetch`.
- **Test** : `app/apps/web/src/__tests__/firmographics-fetch.test.ts` — (a) domaine null → facts null, 0 appel waterfall (R2/AC2) ; (b) waterfall remplit industry+funding → facts + provenance par-champ (R3/R4/AC3) ; (c) throw → error capturee, facts null (R5/AC4) ; (d) timeout > 6000ms → soft-fail (R6/AC5) ; (e) `enriched=false` → facts null (R5).
- **Refs** : R1, R2, R3, R4, R5, R6.

## T4 — Persistance dans l'upsert + `rowToBrief` [0,25 j]

- **Action** : ajouter `firmographics` + `firmographicProvenance` au `briefData` (`build-intelligence-brief.ts:75-96`) et au `set` de `onConflictDoUpdate` (`:102-105`) ; les mapper dans `rowToBrief` (`:237-261`). Try/catch isolant l'ecriture firmographics (garde migration prod, edge case 8).
- **Verify** : build froid sur dev → row `intelligence_briefs.firmographics` peuple (`db:studio`).
- **Test** : `app/apps/web/src/__tests__/build-brief-firmographics.test.ts` — mock db insert ; assert que `values`/`set` portent `firmographics` + `firmographicProvenance` ; assert idempotence (cache-hit → `enrichCompany` jamais appele, R14/AC9).
- **Refs** : R8, R10, R14.

## T5 — `toResearchBriefContext` + `ResearchBriefContext` (sans raw) [0,25 j]

- **Action** : etendre `ResearchBriefContext` (`prospect-context.ts:27-33`) de `firmographics?` ; peupler dans `toResearchBriefContext` (`build-intelligence-brief.ts:150-162`) sans jamais copier `raw` ; garantir `briefIsEmpty` (`:165-173`) inchange (firmographics seules ne rendent pas un brief "non vide" cote angle/pains — decision : firmographics presentes => brief utile, ajouter au predicat).
- **Verify** : `pnpm tsc` ; inspection manuelle de l'objet mappe.
- **Test** : `app/apps/web/src/__tests__/research-brief-context-firmographics.test.ts` — brief avec firmographics → `ctx.firmographics.facts` peuple, `provenance` present, AUCUNE clef `raw` (R11/R17/AC11).
- **Refs** : R11, R17.

## T6 — Rendu `FIRMOGRAPHICS (verified)` dans `formatContextForPrompt` [0,25 j]

- **Action** : ajouter la section conditionnelle apres RESEARCH BRIEF (`prospect-context.ts:332-342`) ; lignes par champ non-nul avec `[source: <provider>]` derive de la provenance ; helper `printMoney`.
- **Verify** : snapshot manuel sur un ctx avec/sans firmographics.
- **Test** : `app/apps/web/src/__tests__/format-context-firmographics.test.ts` — (a) firmographics avec funding apollo → sortie contient `FIRMOGRAPHICS (verified)` + `Funding: ... [source: apollo]` (R12/AC7) ; (b) `firmographics` undefined → sortie byte-identique au snapshot post-P0-2 (R13/AC8) ; (c) seul `description` rempli → une seule ligne, pas de "null" textuel (edge case 3/5).
- **Refs** : R12, R13.

## T7 — Non-regression + edge integration [0,5 j]

- **Action** : tests d'integration garantissant (a) `buildProspectContext` ne declenche AUCUN waterfall (R16/AC10), (b) cache-hit = 0 credit (R14/AC9), (c) geo .fr → provenance peut etre SIRENE (edge case 12), (d) migration absente → try/catch degrade sans 500 (edge case 8).
- **Verify** : `pnpm test` (suite complete) vert ; `pnpm lint` ; `pnpm tsc`.
- **Test** : `app/apps/web/src/__tests__/firmographics-noregression.test.ts` — mock spies sur `enrichCompany` : assert 0 appel depuis `buildProspectContext`/`readCachedBrief` ; assert soft-fail sur erreur d'ecriture colonne.
- **Refs** : R5, R14, R15, R16.

## Ordre d'execution

T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7. T2 (migration) doit etre appliquee sur dev AVANT T4 (sinon les tests d'ecriture echouent ou doivent mocker). T5/T6 dependent de T1 (types) et T3 (donnee produite).

## Estimation effort (jours)

| Task | Jours |
|---|---|
| T1 types | 0,25 |
| T2 migration | 0,25 |
| T3 fetchFirmographics + branchement | 0,75 |
| T4 persistance + rowToBrief | 0,25 |
| T5 toResearchBriefContext | 0,25 |
| T6 rendu prompt | 0,25 |
| T7 non-regression | 0,5 |
| **Total** | **~2,5 j** |

Ocean flague (hors decompte) : refactor pipeline brief → tools agent-callable P1-9.
