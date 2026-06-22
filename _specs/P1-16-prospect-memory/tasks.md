# Tasks — P1-16 Prospect Memory

Estimation totale : **~3.5 jours-dev** (7 tâches build + audit). MVP boilable ; l'ocean
(backfill rétroactif, re-ranker, panneau NL dédié) est flaggé hors scope.

## T0 — Audit lecture (read-only)

- **Action** : relire `context-graph.ts` (resolveEntity :162-242, ingestEpisode :383-438),
  `enriched-prospect-context.ts` (loadGraphFacts :170-235, formatEnriched :287),
  `sequence-generator.ts` (:68, :216, gate :104-118), `drafts/[id]/context/route.ts`.
  Confirmer : (a) `entityId` jamais écrit par `resolveEntity` ; (b) `eq(tExpired,null)` bug :223 ;
  (c) `buildEnrichedContext` non appelé par aucun chemin de génération ; (d) route sans memoryFacts.
- **Verify** : `grep -n "entityId" lib/ai/context-graph.ts` → 0 écriture ; lire la ligne :223.
- **Test** : N/A.

## T1 — `[NEW]` Résolution CRM `entityId` à l'ingestion (R1)

- **Action** : dans `app/apps/web/src/lib/ai/context-graph.ts`, ajouter `resolveCrmEntityId(candidate, tenantId)`
  (email exact `contacts`/`companies` → nom normalisé `ilike`, tenant-scopé, null si pas de match,
  try/catch fail-open). Brancher dans `resolveEntity` : `entityId: crmId ?? null` à l'INSERT (:225-230)
  et `SET entity_id = COALESCE(entity_id, crmId)` sur les chemins exact-match (:176) et merge (:205-214).
- **Verify** : `pnpm tsc` vert ; ingestion manuelle d'un épisode mentionnant un contact CRM connu
  → `SELECT entity_id FROM context_graph_nodes WHERE name='<contact>'` non null.
- **Test** : `app/apps/web/src/__tests__/context-graph-entity-link.test.ts` (Vitest) — mock DB :
  exact email → entityId posé ; nom normalisé → posé ; pas de match → null (R1.2) ; entityId
  déjà posé → non écrasé (idempotence, edge case 2) ; DB error → fail-open null (R1.3).

## T2 — `[NEW]` Fix bug lecture par contact `tExpired` (R2)

- **Action** : dans `app/apps/web/src/lib/context/enriched-prospect-context.ts`, remplacer :223
  `eq(contextGraphEdges.tExpired, null as unknown as Date)` par `isNull(contextGraphEdges.tExpired)`,
  ajouter `isNull(contextGraphEdges.tInvalid)` (R2.2), importer `isNull` de `drizzle-orm` (:12).
- **Verify** : `pnpm tsc` ; lire la clause corrigée.
- **Test** : `app/apps/web/src/__tests__/enriched-prospect-context.test.ts` (étendre l'existant) —
  arête valide → renvoyée (AC2) ; arête `tInvalid` non null → exclue (AC3) ; aucun nœud → `[]` (R2.3).

## T3 — `[NEW]` Exposer `loadGraphFactsForContact` (support R4)

- **Action** : dans `enriched-prospect-context.ts`, extraire un export public
  `loadGraphFactsForContact(contactId, tenantId)` réutilisant la logique `loadGraphFacts`
  (faits valides, tri confiance desc/date desc, cap 8), sans dupliquer le SQL.
- **Verify** : `pnpm tsc` ; import résolu depuis la route (T6).
- **Test** : `enriched-prospect-context.test.ts` — tri par confiance, cap à 8, exclusion invalidés (R4.2/R4.3).

## T4 — `[NEW]` Brancher la mémoire dans le prompt de génération (R3.2/R3.3)

- **Action** : dans `app/apps/web/src/lib/agents/sequence-generator.ts`, ajouter la garde
  `isEnriched(ctx)` et utiliser `formatEnrichedContextForPrompt` quand enrichi dans
  `buildGenerationPrompt` (:228), sinon `formatContextForPrompt` (fallback). Aucune modif du gate (:104-118).
- **Verify** : `pnpm tsc` ; snapshot du prompt avec un ctx enrichi contenant une objection → bloc
  « KNOWN OBJECTIONS »/« KNOWLEDGE GRAPH FACTS » présent.
- **Test** : `app/apps/web/src/__tests__/sequence-generator-memory-prompt.test.ts` — ctx enrichi
  avec objection conf 0.8 → bloc présent (AC4) ; ctx enrichi vide → prompt identique au base (AC5/R3.3) ;
  ctx de base (non enrichi) → fallback `formatContextForPrompt` sans erreur.

## T5 — `[NEW]` Construire le contexte enrichi côté appelants (R3.1/R3.5)

- **Action** : dans les chemins de génération de séquence (`app/apps/web/src/lib/sequence-drafts/router.ts`,
  `app/apps/web/src/app/api/campaigns/generate/route.ts`, `app/apps/web/src/lib/chat/tools/action.ts`
  — repérer ceux qui appellent `generateSequence`), remplacer `buildProspectContext` par
  `withTimeout(buildEnrichedContext(contactId, tenantId), 4000)` avec fallback `buildProspectContext`
  si null. Préserver le gate P0-3 en aval.
- **Verify** : `grep -n "generateSequence" app/apps/web/src` → chaque call-site construit un contexte ;
  `pnpm test` vert (non-régression du gate AC6).
- **Test** : `app/apps/web/src/__tests__/sequence-generation-enriched-wiring.test.ts` — enriched OK →
  utilisé ; enriched timeout/null → fallback base sans throw (R3.5) ; `sequenceQuality.passed` inchangé (AC6).

## T6 — `[NEW]` `memoryFacts` cités dans « Why this draft » (R4)

- **Action** : dans `app/apps/web/src/app/api/sequences/drafts/[id]/context/route.ts`, après les
  fetches (:125), ajouter `memoryFacts = await loadGraphFactsForContact(draft.contactId, tenantId).catch(()=>[])`
  et l'inclure dans `Response.json` ; conserver tous les champs existants (R4.5).
- **Verify** : `curl` authentifié sur un draft d'un contact à faits → `memoryFacts` peuplé, trié ;
  draft d'un contact sans faits → `memoryFacts: []` ; champs existants présents.
- **Test** : `app/apps/web/src/__tests__/draft-context-memory-facts.test.ts` (Vitest, mock DB) —
  2 valides + 1 invalidé → 2 renvoyés triés (AC7) ; aucun fait → `[]` (R4.4) ; tous champs présents (AC8) ;
  tenant B isolé (AC9/R5.1).

## T7 — `[NEW]` E2E « Why this draft » montre la mémoire (R4)

- **Action** : Playwright — ouvrir un brouillon de séquence dont le contact a une objection connue,
  ouvrir le panneau « Why this draft », vérifier l'affichage du fait cité (fact + date).
- **Verify** : screenshot before/after du panneau ; le fait mémoire est visible.
- **Test** : `app/apps/web/e2e/why-this-draft-memory.spec.ts` (Playwright) — panneau rend ≥ 1 memoryFact.

## Ordre d'exécution

1. **T0** (audit) → 2. **T1** (entityId à l'ingestion — pré-requis du rattachement) →
3. **T2** (fix lecture, débloque toute la mémoire par contact) → 4. **T3** (loader public) →
5. **T4** (prompt) → 6. **T5** (wiring appelants) → 7. **T6** (route) → 8. **T7** (E2E).

T1 et T2 sont indépendants et parallélisables ; T4 dépend de T2 ; T6 dépend de T3.

## Estimation effort (jours)

| Tâche | Jours |
|---|---|
| T0 audit | 0.25 |
| T1 entityId ingestion | 0.75 |
| T2 fix tExpired | 0.25 |
| T3 loader public | 0.25 |
| T4 prompt enrichi | 0.5 |
| T5 wiring appelants | 0.75 |
| T6 route memoryFacts | 0.5 |
| T7 E2E | 0.25 |
| **Total** | **~3.5 j** |