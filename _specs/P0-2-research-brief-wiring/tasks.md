# Tasks — P0-2 Brancher le brief de recherche

Estimation totale : ~2.0 jours (4 demi-journees).

## T0. Audit lecture (read-only)

- **Action** : relire `route.ts:64-136`, `prospect-context.ts:23-83/275-337`, `sequence-generator.ts:303-347`, `build-intelligence-brief.ts:110-132`, `types.ts:1-23`. Confirmer : aucun test existant (glob `**/*prospect-context*.test.ts`, `**/campaigns/generate/**/*.test.ts` -> 0), tests vivent dans `src/__tests__/` (cf `campaign-prepare.test.ts` pour le pattern de mock `@/db`).
- **Verify** : `rg "researchBrief" app/apps/web/src` renvoie 0 occurrence avant build.
- **Test** : N/A.

## T1. [NEW] Type `ResearchBriefContext` + champ `ProspectContext.researchBrief`

- **Action** : dans `app/apps/web/src/lib/context/prospect-context.ts`, ajouter `export interface ResearchBriefContext` et le champ optionnel `researchBrief?` apres `recentActivities` (`:82`). (Fix 1)
- **Verify** : `pnpm tsc` (depuis `app/apps/web`) passe ; `rg "researchBrief\?" prospect-context.ts` matche.
- **Test** : `app/apps/web/src/__tests__/prospect-context-brief.test.ts` — test de type/forme : un objet `ProspectContext` sans `researchBrief` compile (optionnel), un avec `researchBrief` valide compile.
- **Refs** : R1, AC1.

## T2. [NEW] Helpers `readCachedBrief` + `toResearchBriefContext` + `briefIsEmpty`

- **Action** : dans `app/apps/web/src/lib/campaign-engine/build-intelligence-brief.ts`, exporter `readCachedBrief()` (wrapper de `getCachedBrief`), `toResearchBriefContext(brief)` (slice publicContent a 2, quote tronquee 200), `briefIsEmpty(ctx)`. (Fix 2)
- **Verify** : `pnpm tsc` passe ; aucune des fonctions n'appelle `fetchAllSources`/`synthesizeBrief` (lecture pure) — `rg "fetchAllSources|synthesizeBrief" -A2` autour des nouveaux exports = absent.
- **Test** : `app/apps/web/src/__tests__/intelligence-brief-mappers.test.ts` — (a) `toResearchBriefContext` tronque a 2 publicContent et a 200 car ; (b) `briefIsEmpty` true quand tout vide/null, false des qu'un champ porte une valeur ; (c) `readCachedBrief` mocke `db.select` et n'invoque jamais les sources.
- **Refs** : R2, R4, R14, edge "champs vides", edge "injection prompt".

## T3. [NEW] Peupler `researchBrief` dans `buildProspectContext`

- **Action** : dans `prospect-context.ts:89-270`, apres resolution de `contact.companyId`, lire `readCachedBrief(tenantId, companyId, contactId)`, mapper via `toResearchBriefContext`, ne setter `researchBrief` que si `!briefIsEmpty`. Ajouter au `return` (`:229-269`). (Fix 3)
- **Verify** : `pnpm test prospect-context` vert ; brief en cache -> `ctx.researchBrief` defini ; pas de cache -> `undefined`.
- **Test** : `app/apps/web/src/__tests__/prospect-context-brief.test.ts` (etendre T1) — mock `@/db` + mock `readCachedBrief` : (a) cache hit -> `ctx.researchBrief.bestAngle` egale la valeur mockee, sources jamais appelees (AC2) ; (b) cache miss -> `ctx.researchBrief === undefined` et reste du contexte intact (AC3) ; (c) brief en cache mais tous champs vides -> `researchBrief === undefined`.
- **Refs** : R2, R3, R4, R14, AC2, AC3, edge soft-delete, edge null.

## T4. [NEW] Section `RESEARCH BRIEF` dans `formatContextForPrompt`

- **Action** : dans `prospect-context.ts:275-337`, inserer le bloc `RESEARCH BRIEF` entre `COMPANY` (`:295`) et `BUYING SIGNALS` (`:298`), gardé par `if (ctx.researchBrief)`. (Fix 4)
- **Verify** : appel manuel avec un ctx portant brief -> la string contient `RESEARCH BRIEF (use this angle first):` ; sans brief -> string identique a l'actuelle.
- **Test** : `app/apps/web/src/__tests__/format-context-brief.test.ts` — (a) avec brief : sortie contient `bestAngle`, `painPoints`, au plus 2 quotes (AC4) ; (b) sans brief : `toMatchInlineSnapshot` egal a la sortie firmographique actuelle (AC6, non-regression) ; (c) brief avec quote >200 car -> tronquee dans la sortie.
- **Refs** : R5, R7, AC4, AC6.

## T5. [NEW] `buildPersonalizationBrief` : angle + pains en tete

- **Action** : dans `sequence-generator.ts:303-347`, pousser les lignes `ANGLE`/`PAIN POINTS`/`COMPETITOR` issues de `ctx.researchBrief` AVANT les facts firmographiques (`:306-337`). (Fix 5)
- **Verify** : appel avec `researchBrief.bestAngle="X"` -> `X` apparait avant toute ligne `SIGNAL/FUNDING/TECH` ; sans brief -> sortie identique a l'actuelle.
- **Test** : `app/apps/web/src/__tests__/personalization-brief.test.ts` — (a) `indexOf("ANGLE") < indexOf("SIGNAL TO USE")` (AC5) ; (b) sans brief : snapshot egal a l'actuel (AC6) ; (c) brief partiel (pains sans angle) -> n'emet que la ligne pains. Note : `buildPersonalizationBrief` est privee — exporter sous `__test__` ou tester via la string de `buildGenerationPrompt` (deja indirectement exporte par `generateSequence`). Choisir export nomme `buildPersonalizationBrief` pour testabilite directe.
- **Refs** : R6, R7, AC5, AC6.

## T6. [NEW] Route : `withTimeout` + AWAIT brief fail-open

- **Action** : dans `route.ts:64-69`, remplacer le fire-and-forget par `resolvedBrief = await withTimeout(buildIntelligenceBrief(...), TIMEOUT_BRIEF_MS)`. Ajouter le helper `withTimeout` (local ou `@/lib/utils/with-timeout`) et la const `TIMEOUT_BRIEF_MS = Number(process.env.GENERATE_BRIEF_TIMEOUT_MS ?? 8000)`. (Fix 6)
- **Verify** : brief qui rejette -> route renvoie 201 ; brief qui pend >8s -> reponse <~8.x s (mesure via fake timers en test).
- **Test** : `app/apps/web/src/__tests__/campaigns-generate-brief.test.ts` — mock `buildIntelligenceBrief` : (a) rejette -> POST renvoie 201, `generateSequence` appele (AC7) ; (b) `vi.useFakeTimers` + brief qui ne resout jamais -> `withTimeout` rend `null` apres 8000ms, 201 quand meme (AC11) ; (c) pas de promesse pendante non geree (`process.on('unhandledRejection')` espionne = 0).
- **Refs** : R8, R9, R15, AC7, AC11, edge timeout.

## T7. [NEW] Route : threading chemin template (`minimalCtx`)

- **Action** : dans `route.ts:103-134`, ajouter `researchBrief` au `minimalCtx` depuis `resolvedBrief` (mappe + non vide). (Fix 6, partie template)
- **Verify** : sans contact mais brief company-level en cache -> `minimalCtx.researchBrief` peuple ; sans brief -> `undefined`.
- **Test** : `app/apps/web/src/__tests__/campaigns-generate-brief.test.ts` (etendre T6) — mock : aucun contact resolu + `buildIntelligenceBrief` rend un brief non vide -> capturer l'argument passe a `generateSequence` et asserter `arg.researchBrief.bestAngle` defini (AC9). Verifier que `strategyUsed` reste fourni (AC10).
- **Refs** : R11, R12, AC9, AC10.

## T8. [NEW] Test d'integration chemin contact

- **Action** : aucun code — test bout-en-bout (mocke) du chemin contact (`route.ts:86-89`).
- **Verify** : avec contact + brief en cache, le `ctx` passe a `generateSequence` porte `researchBrief`.
- **Test** : `app/apps/web/src/__tests__/campaigns-generate-brief.test.ts` (etendre) — mock `buildProspectContext` pour renvoyer un ctx avec `researchBrief`, asserter que `generateSequence` le recoit (AC8). Mock alternatif : laisser le vrai `buildProspectContext` avec `readCachedBrief` mocke pour couvrir le wiring reel.
- **Refs** : R10, AC8.

## T9. [NEW] Non-regression snapshots + tsc/lint

- **Action** : verifier qu'aucun comportement firmographique n'a bougé.
- **Verify** : `pnpm tsc` + `pnpm lint` verts depuis `app/apps/web` ; `pnpm test` sur les 5 fichiers de test verts.
- **Test** : couvert par les snapshots `sans brief` de T4 et T5 (AC6). Ajouter dans `campaigns-generate-brief.test.ts` un cas "brief rejette" qui asserte que la sortie de sequence egale le chemin firmographique pur.
- **Refs** : R7, R12, R13, AC6, AC10.

## Ordre d'execution

- T0 (audit) -> T1 (type) bloque T3/T4/T5.
- T2 (helpers) bloque T3, T6, T7.
- T3 -> T4 (formatContext lit `ctx.researchBrief`) ; T3 + T5 independants une fois T1/T2 faits.
- T6 (withTimeout+await) bloque T7, T8.
- T9 en dernier (gate tsc/lint/test global).
- Sequence recommandee : T0 -> T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 -> T9.

## Estimation effort

| Tache | Effort |
|---|---|
| T0 audit | 0.5 demi-jour |
| T1 type | 0.25 |
| T2 helpers + tests | 0.5 |
| T3 buildProspectContext + tests | 0.5 |
| T4 formatContextForPrompt + tests | 0.5 |
| T5 buildPersonalizationBrief + tests | 0.5 |
| T6 route withTimeout + tests | 0.5 |
| T7 route template threading + tests | 0.25 |
| T8 integration chemin contact | 0.25 |
| T9 non-regression gate | 0.25 |
| **Total** | **~4 demi-journees (~2.0 j)** |
