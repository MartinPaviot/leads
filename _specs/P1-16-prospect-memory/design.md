# Design — P1-16 Prospect Memory

## Composants existants (read-only, puis fix ciblé)

| Fichier | Rôle | Statut | Réf |
|---|---|---|---|
| `lib/ai/context-graph.ts` | Pipeline Mem0 : extract + dédup entité/arête + invalidation + retrieval | EXISTE — fix `entityId` (R1) | :46-242, :246-327, :461-644 |
| `db/schema/intelligence.ts` | Schéma `contextGraphNodes` (`entityId` nullable) + `contextGraphEdges` (bi-temporel + provenance) | EXISTE — read-only | :129-147, :242-270 |
| `db/ensure-vector-index.ts` | Table `embeddings vector(1536)` + index HNSW (pgvector) | EXISTE — read-only `[LOCKED]` | :17-58 |
| `lib/ai/embeddings.ts` | `embedText` (text-embedding-3-small) + `searchHybrid` (RRF) | EXISTE — read-only | :7-16, :236-304 |
| `lib/context/enriched-prospect-context.ts` | `buildEnrichedContext` + `loadGraphFacts` + `formatEnrichedContextForPrompt` | EXISTE — fix bug `tExpired` (R2) + brancher | :57, :170-235, :287 |
| `lib/context/prospect-context.ts` | `buildProspectContext` + `formatContextForPrompt` (base firmo+brief) | EXISTE — read-only | :104, :310 |
| `lib/agents/sequence-generator.ts` | `generateSequence` (consomme `ProspectContext`) + gate P0-3 | EXISTE — brancher enriched (R3) | :68, :104-118 |
| `lib/evals/sequence-quality.ts` | `gradeSequenceQuality` gate qualité | EXISTE — read-only (ne pas toucher) | :68-97 |
| `api/sequences/drafts/[id]/context/route.ts` | « Why this draft » bundle | EXISTE — ajouter `memoryFacts` (R4) | :30-171 |
| `inngest/calls-post-process.ts` / `api/email/sync/route.ts` / … | 6 call-sites `ingestEpisode` | EXISTE — read-only (bénéficient de R1 sans changement) | calls:385, email/sync:277 |
| `lib/utils/with-timeout.ts` | `withTimeout` fail-open → null | EXISTE (P0) — réutiliser (R3.5) | :6-16 |

## Fixes ciblés

### Fix 1 — `resolveEntity` renseigne `entityId` CRM (R1)

Ajout d'une résolution CRM dans `resolveEntity` (signature inchangée). Nouvelle fonction
interne `resolveCrmEntityId`, et `entityId` posé à la création ET sur mise à jour si encore null.

```ts
// lib/ai/context-graph.ts — signature existante inchangée
export async function resolveEntity(
  candidate: ExtractedEntity,
  tenantId: string,
): Promise<string>

// NOUVELLE interne — exact email d'abord, puis nom normalisé tenant-scopé.
// Retourne null si pas de match (R1.2). Fail-open en cas d'erreur (R1.3).
async function resolveCrmEntityId(
  candidate: ExtractedEntity,
  tenantId: string,
): Promise<string | null>
```

Règles d'écriture :
- Création de nœud (`context-graph.ts` :225) : passer `entityId: crmId ?? null`.
- Exact-match existant (:167-176) et fuzzy/embedding-merge (:205-214) : `UPDATE … SET entity_id = COALESCE(entity_id, crmId)` — **ne jamais écraser** un `entityId` déjà posé (idempotence, edge case 2).
- `resolveCrmEntityId` n'appelle aucun LLM ni embedding obligatoire : email exact → nom normalisé `ilike(lower(...))` sur `contacts`/`companies`, tenant-scopé.

### Fix 2 — bug `tExpired` (R2)

```ts
// lib/context/enriched-prospect-context.ts:223 — AVANT (toujours faux)
eq(contextGraphEdges.tExpired, null as unknown as Date),
// APRÈS
isNull(contextGraphEdges.tExpired),
```
Et ajouter `isNull(contextGraphEdges.tInvalid)` à la clause (R2.2). `isNull` est déjà importé
ailleurs dans le repo (`drizzle-orm`) — ajouter à l'import ligne :12.

### Fix 3 — brancher la mémoire dans la génération (R3)

Le générateur consomme un `ProspectContext`. On lui fournit l'`EnrichedProspectContext` et on
remplace le formateur de contexte. Deux options :

- **Option A (retenue)** — `generateSequence` accepte un contexte déjà enrichi : le ou les
  appelants (`api/campaigns/generate/route.ts`, `lib/sequence-drafts/router.ts`,
  `lib/chat/tools/action.ts`) construisent via `buildEnrichedContext` et le formateur de
  prompt détecte le type enrichi. Cohérent avec l'existant (`EnrichedProspectContext extends
  ProspectContext` :44), zéro changement de signature publique.
- **Option B (rejetée)** — extraction mémoire synchrone dans `generateSequence`. Rejetée :
  viole R5.2 (coût/latence LLM dans le hot path) ; la mémoire est déjà ingérée hors-ligne.

Implémentation Option A — dans `buildGenerationPrompt` (`sequence-generator.ts` :216), le bloc
contexte utilise `formatEnrichedContextForPrompt` quand le contexte est enrichi, sinon
`formatContextForPrompt` (fallback) :

```ts
// sequence-generator.ts — garde de type, additif
import { formatEnrichedContextForPrompt, type EnrichedProspectContext } from "@/lib/context/enriched-prospect-context";

function isEnriched(c: ProspectContext): c is EnrichedProspectContext {
  return "graphFacts" in c && "extractedSignals" in c;
}
// dans buildGenerationPrompt:
const contextBlock = isEnriched(ctx)
  ? formatEnrichedContextForPrompt(ctx)
  : formatContextForPrompt(ctx);
```

Côté appelants : envelopper la construction de contexte dans `withTimeout(buildEnrichedContext(...), 4000)`
et retomber sur `buildProspectContext` si null (R3.5). Le gate P0-3 (:104-118) reste strictement inchangé.

### Fix 4 — `memoryFacts` cités dans « Why this draft » (R4)

Ajout d'un bloc dans la route de contexte (additif, après les fetches existants :105-125) :

```ts
// api/sequences/drafts/[id]/context/route.ts — réutilise le loader corrigé (Fix 2)
import { loadGraphFactsForContact } from "@/lib/context/enriched-prospect-context";

// loadGraphFactsForContact = export d'un wrapper read-only autour de la logique
// loadGraphFacts (R4.3 : tInvalid IS NULL && tExpired IS NULL), trié conf desc/date desc, cap 8.
const memoryFacts = draft.contactId
  ? await loadGraphFactsForContact(draft.contactId, authCtx.tenantId).catch(() => [])
  : [];
// … ajouté au Response.json existant, tous les autres champs conservés (R4.5).
```

`loadGraphFacts` est aujourd'hui privée (`enriched-prospect-context.ts` :170). On l'expose via
un wrapper nommé `loadGraphFactsForContact(contactId, tenantId)` (R4.1/R4.2/R4.3) — pas de
duplication de logique.

## Data model

**Aucun changement de schéma.** Les tables `context_graph_nodes` (colonne `entity_id`
nullable déjà présente, `intelligence.ts` :135), `context_graph_edges`, et `embeddings`
(`ensure-vector-index.ts`) existent. Fix 1 ne fait qu'écrire dans une colonne déjà nullable.

Backfill optionnel (hors MVP, déploiement) — re-link des nœuds orphelins :
```sql
-- idempotent, tenant par tenant : pose entity_id sur les nœuds person/company
-- dont le name matche un contact/company existant (exact, normalisé).
UPDATE context_graph_nodes n SET entity_id = c.id
FROM contacts c
WHERE n.entity_id IS NULL AND n.entity_type = 'person'
  AND n.tenant_id = c.tenant_id
  AND lower(trim(n.name)) = lower(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')))
  AND c.deleted_at IS NULL;
```

## Flux (ordre des appels + gates)

**Ingestion (déjà câblée, R1 s'y greffe) :**
1. Capture (email sync / meeting / note / call) → `ingestEpisode(tenantId, content, sourceType, sourceId)` (non-bloquant, `.catch`).
2. `extractEntitiesAndFacts` (LLM) → `resolveEntity` **[Fix 1 : pose `entityId` CRM]** → `resolveEdge` (dédup/invalidation, inchangé).

**Génération de séquence (R3) :**
1. Appelant → `withTimeout(buildEnrichedContext(contactId, tenantId), 4000)` ; fallback `buildProspectContext` si null (gate fail-open R3.5).
2. `buildEnrichedContext` → `loadGraphFacts` **[Fix 2 : isNull(tExpired)/isNull(tInvalid)]** (R2).
3. `generateSequence(ctx)` → `buildGenerationPrompt` **[Fix 3 : formatEnrichedContextForPrompt si enrichi]** (R3.2).
4. Boucle évaluateur-optimiseur → `gradeSequenceQuality` (gate P0-3, **inchangé**, R3.4) → draft.

**Why this draft (R4) :**
1. `GET /api/sequences/drafts/[id]/context` → fetches existants (contact/account/deal/activities/sources).
2. + `loadGraphFactsForContact(draft.contactId, tenantId)` **[Fix 4]** (R4.1, faits valides seulement R4.3, cap 8 R4.2).
3. Réponse JSON additive (R4.5).

## Failure handling / Security

- **Fail-open (ingestion & génération)** : R1.3, R3.5 — une capture ou une génération ne doit
  JAMAIS échouer sur la mémoire (cohérent avec les `.catch()` des 6 call-sites et `withTimeout`
  fail-open → null). Motivé : la mémoire est un enrichissement, pas une dépendance critique.
- **Fail-closed (citation send-time)** : hors périmètre P1-16 — déjà géré par
  `decideCitationGate` (`lib/sequence-drafts/citations.ts` :56) pour les URLs ; les
  `memoryFacts` sont des faits internes (pas des URLs cliquables), donc pas de gate send-time.
- **Tenant-scoping** : R5.1 — `resolveCrmEntityId` filtre `tenants` ; `loadGraphFacts`/
  `loadGraphFactsForContact` filtrent `tenantId` (déjà :195) ; la route lit le `tenantId` de
  `getAuthContext` (:34, :47).
- **Idempotence** : R1.1 utilise `COALESCE(entity_id, crmId)` — re-ingérer un épisode ne crée
  pas de doublon (la dédup d'entité/arête existante est préservée) et n'écrase pas un lien posé.
- **Budget tokens** : R5.2 — aucun nouvel appel LLM dans le hot path de génération ; `resolveCrmEntityId`
  est purement SQL (pas d'embedding obligatoire). L'extraction reste sur le job Inngest existant.

## Open questions

1. **Seuil de confiance d'injection (0.6)** — repris de `formatEnrichedContextForPrompt` :325.
   À calibrer si le founder remonte du bruit ; configurable en `[CFG]` ultérieur, pas en MVP.
2. **Re-link des orphelins** — backfill SQL ci-dessus suffisant pour la démo, ou faut-il un
   job Inngest récurrent ? MVP : script one-shot manuel (déploiement). Décision déléguée build.
3. **Cap 8 vs 5 dans « Why this draft »** — aligné sur le budget UI des autres panneaux ;
   à ajuster au design-review si la liste déborde.