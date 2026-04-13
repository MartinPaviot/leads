# Audit approfondi — Accounts

Portee : IntelligenceBrief, enrichissement Apollo, scoring fit+engagement, detection de signaux, semantic search. Lecture directe du code, toutes citations exactes.

---

## UI Accounts

Fichier : `app/apps/web/src/app/(dashboard)/accounts/page.tsx` (916 lignes, composant unique `AccountsPage`).

### Architecture generale

| Zone | Lignes | Notes |
|---|---|---|
| State accounts + pagination | 45-87 | `useState<Account[]>`, `useCallback fetchAccounts` |
| Handlers CRUD + bulk | 102-166 | create, enrichSingle, enrichAll, scoreAll, detectSignals, semanticSearch |
| Helpers pur (timeAgo, isEnriched, isTAM, getSignals) | 173-253 | derives depuis `account.properties` |
| PageHeader + boutons bulk | 256-306 | Signals / Score / Enrich / Create |
| FilterBar (tabs + search input) | 309-346 | 3 tabs + input semantique |
| Modal creation | 349-387 | name + domain uniquement |
| Table + skeleton + empty | 388-814 | gros bloc monolithique (table, popovers, sub-rows) |
| SlideOver detail | 817-912 | IntelligenceBrief + PropertyRow + custom fields |

### Chargement / pagination — `fetchAccounts` (68-85)

Strategie `while(hasMore)` avec `pageSize=200` coté client, termine quand le batch < 200 ou total atteint :

```ts
const res = await fetch(`/api/accounts?pageSize=200&page=${page}`);
...
hasMore = batch.length === 200 && allAccounts.length < (data.pagination?.total || Infinity);
```

Probleme : charge TOUS les comptes cote client en boucle sequentielle avant d'afficher quoi que ce soit (ligne 74-82). Pour un tenant avec 5k comptes = 25 appels serie, le tableau reste en Skeleton pendant 5-10s. Pas de virtualisation non plus (ligne 405 `<table>` avec `filteredAccounts.map` brut).

### Filtres (230-241)

Trois niveaux combines dans `.filter(...)` :
- `filter === "tam" | "manual" | "all"` via `isTAM(a)` = `properties.source === "tam"` (ligne 186).
- Si `searchQuery` renseigne mais pas encore de `searchResults`, fallback string-match local `name/domain/industry` (234-237).
- Si `searchResults` present (ids retournes par `/api/search/tam`), inner-join par inclusion + tri par l'ordre de similarite retourne.

Bug subtil : quand `searchResults` est defini mais vide (`length === 0`), aucun resultat n'est affiche, mais l'UI ne distingue pas "aucun match semantique" d'"empty state initial" — le `EmptyState` (396-403) n'est declenche que si `accounts.length === 0`.

### Bulk actions

| Action | Handler | Endpoint | Payload | Verrou |
|---|---|---|---|---|
| Enrich All | `enrichAll` 125-137 | `POST /api/enrich` | `{ companyIds: unenriched.map(a.id) }` | `enrichAllRunning` |
| Score All | `scoreAll` 139-147 | `POST /api/score` | `{ companyIds: accounts.filter(score==null).map(id) }` | `scoreAllRunning` |
| Detect Signals | `detectSignals` 149-157 | `POST /api/signals` | `{ companyIds: accounts.filter(isEnriched).map(id) }` | `detectingSignals` |
| Semantic Search | `handleSemanticSearch` 159-166 | `POST /api/search/tam` | `{ query, entityType: "company", limit: 20 }` | `searching` |

Les 3 bulks envoient TOUS les ids dans un seul POST. Cote serveur le plafond est `companyIds.slice(0, 20)` (enrich route.ts:45, signals route.ts:54) — donc un bouton "Enrich 100 accounts" enrichit silencieusement seulement les 20 premiers. **Aucun feedback dans l'UI** que le batch a ete tronque. Bug de produit majeur.

`scoreAll` (route `/api/score`) n'a pas de slice — iteration sur tout `companyIds` (score/route.ts:152), mais en serie, sans parallelisation. Pour 100 comptes = 100 × `calculateEngagementScore` = 100 × 5 requetes DB serie = ~500 requetes.

### Semantic search UX

Ligne 328-334 (Input) + 159-166 (handler). Enter = search, effacement du query = reset via `onChange` : `if (!e.target.value.trim()) setSearchResults(null)`.

Pas de debounce, pas de loading skeleton dans le tableau (seul `searching` controle le spinner du bouton, qui n'existe pas — le bouton n'est jamais rendu, c'est juste `onKeyDown`).

Absence critique : aucune indication visuelle que le tableau affiche des resultats semantiques (pas de badge "Semantic results", pas de score de similarite affiche). L'utilisateur tape "fintech startups" et voit juste ses comptes reordonnes sans comprendre pourquoi.

### Selection multiple (62, 409-421, 457-470)

`selectedRows: Set<string>` avec checkbox maitre + ligne. **Aucune action n'est branchee sur `selectedRows`** — pas de bouton "Score selected", "Delete", "Assign owner". State mort qui coute du render mais ne sert a rien.

### Ligne expandable contacts (474-495, 774-808)

Click sur chevron → `fetch('/api/accounts/${id}/contacts')` (route ci-dessous), state separe `expandedAccountId` + `expandedContacts`. Un seul compte expandable a la fois. OK fonctionnellement mais `loadingContacts` global = si on change de compte rapidement le precedent flush n'est pas annule (race condition possible).

Badge "Suggested" (ligne 798) affiche sur TOUS les contacts expanded — pas seulement les suggestions Apollo. Copie trompeuse : les contacts venant de la DB reelle sont aussi etiquetes "Suggested". Bug.

### Signal popover (659-732, G27)

Colonnes signaux generees dynamiquement a partir de `signalTypeColumns` (247-249), cappe a 5 types. Popover avec tabs Reasoning/Sources, close-on-outside-click via `signalPopoverRef` + listener (90-100).

Rendu du favicon source : `https://logo.clearbit.com/${new URL(src.url).hostname}` (712) — dependance externe Clearbit non documentee, silencieuse si echec (onError hide).

### Custom fields (66, 199-228, 433-447, 752-757, 880-892)

Via `useCustomFields("company")` + `getCustomFieldValue` / `formatFieldValue`. Trois types rendus : `single_select`/`multi_select` → PropertyBadge, `url` → `<a>` avec logo.clearbit, autres → span formatte. Legacy `customBoolColumns = ["Common Investor?", "Sales-led?"]` (193) hardcodes et marques "Kept for backward compatibility" — dette a purger.

### Etats vides / loading

- Accounts loading : `TableSkeleton` 8 rows × `8 + signalTypeColumns.length + customBoolColumns.length + customFields.length` cols (391-394). OK.
- Accounts empty : `EmptyState` avec CTA Create (396-403).
- Slide-over empty state aucun : si `a.lastInteraction`, `a.scoreReasons`, `a.description` manquent, sections cachees sans substitut.
- Signal popover : pas de loading (synchro via props).

### Gestion d'erreurs

Toutes les fetch sont en `try/catch` vides (`catch { /* */ }` 84, 113, 122, 135-136, 146, 156, 165). **Aucun toast, aucun feedback d'erreur a l'utilisateur.** Silencieux partout.

---

## Composant IntelligenceBrief

Fichier : `app/apps/web/src/components/intelligence-brief.tsx` (103 lignes).

### Flux

1. `useEffect` sur `accountId` (21-29) → `fetch('/api/accounts/${accountId}/intelligence')`.
2. `.then(r => r.ok ? r.json() : null)` puis `setData(d)`. `.catch(() => setData(null))`.
3. `finally { setLoading(false) }`.

Interface `BriefData` (11-15) : `{ brief: string; keyRelationships: string[]; suggestedAction: string }`. Aucune section "signals", "activity summary", "key contacts" — le composant est **beaucoup plus leger** que ce que le nom suggere. C'est un seul paragraphe + liste de pastilles + une action recommandee.

### Etats de rendu

| Etat | Lignes | Comportement |
|---|---|---|
| Loading | 31-48 | 3 Skeleton lines, header "AI Intelligence" |
| Empty ("Not enough data") | 50-67 | Background gris, message "Connect your email or add activities" |
| Rendu normal | 69-101 | Background accent-soft, brief + pills keyRelationships + suggestedAction |

Le declencheur empty se base sur `!data || !data.brief || data.brief.includes("Not enough data")` — string-match fragile, couple a la reponse serveur `accounts/[id]/intelligence/route.ts:100` qui retourne exactement `"Not enough data yet. Connect your email or add activities to generate insights."`.

### Interactions

**Aucune.** Pas de click actions sur pills, pas de "regenerate", pas de lien depuis `suggestedAction` vers une action concrete (compose email, book meeting). Composant strictement lecture.

### Performance

Pas de cache cote client, re-fetch a chaque changement de `accountId`. Cote serveur un cache en-memoire 1h existe (route.ts:17, 142). Si la fenetre slide-over s'ouvre/ferme 5× sur le meme compte = 5 fetches reseau inutiles (5 × TTFB), mais le serveur repond depuis son `Map`.

---

## Enrichment

Endpoint : `app/apps/web/src/app/api/enrich/route.ts` (154 lignes).

### Provider

**Apollo uniquement.** Pas de fallback LLM malgre l'import de `anthropic` + `openai` + schema Zod `llmFallbackSchema` (lignes 6-23) — code mort. Commentaire ligne 124 : "No LLM fallback — mark as unavailable instead of hallucinating". Le `llmFallbackSchema` devrait etre supprime.

Client : `app/apps/web/src/lib/apollo-client.ts`, endpoint `/v1/organizations/enrich?domain=...` (apollo-client.ts:66-73).

### Fields popules (68-97)

| Champ companies.* | Source Apollo |
|---|---|
| industry | `org.industry` |
| description | `org.description` |
| size | `employeeCountToRange(org.estimated_num_employees)` |
| revenue | `revenueToRange(org.annual_revenue)` |

### Fields popules dans `properties` (78-98)

`enrichment_source: "apollo"`, `apollo_id`, `linkedin_url`, `website_url`, `founded_year`, `technologies`, `total_funding`, `total_funding_printed`, `latest_funding_stage`, `employee_count`, `annual_revenue`, `annual_revenue_printed`, `city`, `state`, `country`, `keywords`, `enriched_at`.

### Batch size / timeout / retry

- Batch : `companyIds.slice(0, 20)` (45). **Silencieux** — client peut envoyer 500 ids, seuls 20 traites.
- Boucle serie (`for const id of ...`), pas de `Promise.all`, pas de concurrence controlee. Pour 20 comptes × ~800ms/call Apollo = ~16s de latence.
- **Aucun retry** sur echec Apollo. Catch ligne 118 → "Fall through to LLM fallback" (commentaire menteur, il n'y a plus de fallback) → branche `enrichment_source: "unavailable"` (128-140).
- **Aucun timeout** sur le `fetch` vers Apollo (apollo-client.ts:29). Si Apollo pend 30s, le request de l'utilisateur pend aussi.
- Rate limit : `checkRateLimit("enrich", userId)` = 30 req/min/user (rate-limit.ts:51, 56).

### Skip si deja enrichi (59-63)

```ts
if (props.enrichment_source === "apollo" && company.industry && company.description) {
  enriched++;
  continue;
}
```

Pas de re-enrichissement meme apres des semaines — ignore la fraicheur (`enriched_at`). Pour un compte qui a leve une serie B 2 mois apres l'enrichissement, l'info ne sera jamais mise a jour sauf intervention manuelle (pas de UI pour ca).

### Re-embedding post-enrich (103-113)

Apres update DB, recompute l'embedding avec `companyToText(...)` → `embedEntity(...)`. Bon pour la freshness de la semantic search. `.catch(console.warn)` = best-effort non bloquant.

### Cout estime

Apollo facture par credit, 1 credit = 1 org enrich. Pas de tracking cote code (`_reports/spending.md` existe mais non alimente par cette route). Pour 1000 comptes enrichis = 1000 credits, plan Basic Apollo = 120$/mois pour 1200 credits = ~0.10 $/compte.

Pas de cache applicatif — chaque `POST /api/enrich` avec le meme id refait l'appel Apollo si `enrichment_source !== "apollo"`.

---

## Scoring

Endpoint : `app/apps/web/src/app/api/score/route.ts` (211 lignes). Formules pures : `app/apps/web/src/lib/scoring.ts`.

### Algorithme

**Score final** (score/route.ts:172-175) :

```ts
const hasEngagement = engagement.score > 0;
const fitWeight = hasEngagement ? 0.6 : 1.0;
const engWeight = hasEngagement ? 0.4 : 0.0;
const totalScore = Math.round(fit.score * fitWeight + engagement.score * engWeight);
```

**Adaptive weighting** : si aucune activite → fit 100%. Sinon → 60% fit + 40% engagement. Transition binaire (des la premiere activite on bascule a 60/40) — pas lissee, pas progressive. Un compte TAM froid qui recoit UN email automatique passerait d'un score 80 (fit pur) a ~48 (80 × 0.6 + 0 × 0.4) si l'engagement calcule est nul. En pratique `engagement.score > 0` necessite au moins 1 email in 30d, donc pas exactement ca, mais le cliff existe.

### Fit score — scoring.ts:62-158

Decoupage 100 pts :

| Dimension | Points | Condition | Ligne |
|---|---|---|---|
| Industry match | 30 | `targetIndustries.some(t => industry.includes(t))` case-insensitive | 71-82 |
| Industry (pas de prefs) | 15 | moderate credit si industry definie | 81 |
| Size match | 25 | `employee_count in [min, max]` | 90-95 |
| Size adjacent | 12 | `[min * 0.5, max * 2]` | 96-98 |
| Size (pas de prefs) | 12 | si employeeCount defini | 104 |
| Geography match | 20 | substring match city/country | 111-115 |
| Geography (pas de prefs) | 10 | si localisation connue | 120 |
| Funding ≥ $10M | 10 | | 126-127 |
| Funding ≥ $1M | 7 | | 127 |
| Funding > 0 | 3 | | 127 |
| Revenue in icp range | 10 | | 135-139 |
| Revenue adjacent (≥ min/2) | 5 | | 140-142 |
| Revenue (pas de prefs) ≥10M | 8 | | 143-144 |
| Data quality | 0-5 | +1 par champ present (industry/size/desc/linkedin/apollo) | 149-155 |

**Total theorique max** : 30+25+20+10+10+5 = 100. OK.

Probleme : si le tenant n'a PAS configure `targetIndustries` + `sizeRange` + `geographies` (ICP vide), le score max tombe a 15+12+10+10+8+5 = 60 pts → tous les comptes cappent en grade B. Pas d'amorce claire au produit pour dire "configurez votre ICP" dans la UI scoring.

### Engagement score — score/route.ts:9-117

5 composantes, window 30 jours :

| Composante | Points | Lignes |
|---|---|---|
| Email activities >10 | +25 | 32 |
| Email activities >5 | +15 | 33 |
| Email activities >0 | +8 | 34 |
| Meetings | `min(25, meetings * 12)` | 52-54 |
| Recency ≤3j | +20 | 72 |
| Recency ≤7j | +15 | 73 |
| Recency ≤14j | +10 | 74 |
| Recency ≤30j | +5 | 75 |
| Positive replies | `min(15, positives * 8)` | 92-94 |
| Multi-thread (distinct actorIds) | `min(15, threads * 5)` | 110-114 |

**Total max** : 25+25+20+15+15 = 100. Capped via `Math.min(100, score)` ligne 116.

Mais l'activites `entityType` filtre est hardcode `"company"` (ligne 25, 41, 63, 85, 101) — **les activites liees aux contacts de ce compte ne comptent pas**. Si tous les emails sont loggees avec `entityType: "contact"`, le score engagement d'un compte reste a 0 alors que des echanges ont lieu. Bug majeur : l'UI `/api/accounts/[id]` merge pourtant bien `company` + activites des `contacts` (accounts/[id]/route.ts:65-90), donc il y a incoherence entre ce que l'utilisateur voit (timeline riche) et ce qui est score (rien).

Autre bug : `eq(activities.actorType, "contact")` ligne 107 pour detecter multi-thread, mais `actor_id` est probablement l'ID du contact (pas confirme sans lire schema) — si les emails inbound ont actorType="contact", OK. Si ce sont `user`/`external`, le count retombe a 0.

### Reasons retournes (176)

`allReasons = [...fit.reasons, ...engagement.reasons]` → stocke dans `companies.scoreReasons` (text[]) + affiche dans le slide-over (accounts/page.tsx:899-907) et en `title` du score cell (ligne 602).

### Grade — scoring.ts:9-34

Thresholds A+ (≥90), A (≥80), B (≥60), C (≥40), D (≥20), F (≥0). Source partagee front + back.

### Persistence (181-197)

Update : `score`, `scoreReasons`, + `properties.score_grade`, `score_fit`, `score_engagement`, `score_fit_reasons`, `score_engagement_reasons`, `scored_at`. Duplication cote `scoreReasons` + `properties.score_*_reasons` — possible desync, mais utile pour reconstituer la decomposition fit/engagement.

### Performance

Boucle serie sur `companyIds`. Chaque compte = ~5 requetes SQL + 0 LLM = 100 comptes → ~500 SQL en serie. Pas de batch INSERT/UPDATE. Pour 1000 comptes = latence > 2 min.

**Aucun slice/cap** cote route (contrairement a enrich/signals). Un bouton "Score All" sur 10k comptes cloue le serveur.

---

## Signals

Endpoint : `app/apps/web/src/app/api/signals/route.ts` (163 lignes).

### Types detectes (11-22)

Zod enum : `"hiring" | "funding" | "tech_change" | "news" | "expansion" | "leadership_change"`.

### Sources

**Apollo facts uniquement** — lignes 67-82. Agregats :
- `total_funding` + `latest_funding_stage`
- `technologies` (array)
- `employee_count`, `founded_year`
- `city`/`state`/`country`
- `keywords` (top 10)
- `industry`/`size`/`revenue`

Gate ligne 90-92 : `if (props.enrichment_source !== "apollo") continue;` — **aucun signal sur comptes non-enrichis Apollo**. Cohérent mais cassant : si Apollo fail (plan gratuit, quota), zero signal genere jamais.

**Pas de sources news/jobs/scraping.** Le champ `dataSource` dans la reponse (20) est en fait la string du fact Apollo d'origine, pas un lien externe. Les "sources" affichees dans le popover UI (accounts/page.tsx:707-717) — `signal.sources: Array<{url, title}>` (interface 189) — ne sont JAMAIS populees par ce endpoint. Code mort cote UI, ou attend un autre chemin non-implemente.

### Modele LLM

Ligne 33-37 : `anthropic("claude-sonnet-4-6")` en priorite, fallback `openai("gpt-4o-mini")`.

Extended thinking ACTIF (127-130) :
```ts
providerOptions: {
  anthropic: {
    thinking: { type: "enabled", budgetTokens: 3000 },
    cacheControl: { type: "ephemeral" },
  },
}
```

Temperature 0.2. Prompt few-shot avec 2 examples (104-116). Tracing via `tracedGenerateObject` + `_trace`.

### Frequence

**On-demand uniquement.** Bouton "Detect Signals" (accounts/page.tsx:149-157). Pas de cron, pas d'auto-detection apres enrich. Signaux statiques apres detection — pas de refresh temporel (un "Recent Series A" reste "Recent" indefiniment).

Recherche dans `_specs/P6-realtime-meeting-extraction/` et autres dossiers cron n'a pas ete effectuee ici mais les imports Inngest sont absents de cette route.

### Batch / perf

- `companyIds.slice(0, 20)` (54). Meme probleme silencieux que enrich.
- Iteration serie, 1 appel LLM/compte. Avec thinking budget 3000 tokens + Sonnet 4.6 = ~3-5s/compte. 20 comptes = ~60-100s.
- Rate limit `llm` : 20 req/min/user (rate-limit.ts:51).
- Cout estime : Sonnet 4.6 avec thinking 3000 + prompt ~500 + output ~500 = ~4000 tokens ≈ 0.02 $/compte. 1000 comptes = 20 $.

### Persistence (136-149)

Ecrase `properties.signals` entierement a chaque run (pas de merge, pas d'historique). `detectedAt` + `source: "apollo_enrichment"` attache a chaque signal. Pas de TTL, pas d'invalidation.

### Reasoning + sources retournes

`signal.reasoning` (string) → affichable dans le popover tab "Reasoning" (OK, cable ligne 705).
`signal.sources` : **non genere** par le prompt ni par le schema Zod (11-22, pas de `sources` field). L'UI affiche l'onglet "Sources" seulement si `signal.sources?.length > 0` donc onglet jamais visible.

---

## Semantic Search

Endpoint : `app/apps/web/src/app/api/search/tam/route.ts` (83 lignes). Lib : `app/apps/web/src/lib/embeddings.ts` (238 lignes).

### Embeddings

Provider : **OpenAI `text-embedding-3-small`** (embeddings.ts:12). Dimension implicite 1536.

Gate (embeddings.ts:8-10) : throw si pas de `OPENAI_API_KEY`. Pas de fallback local (sentence-transformers, etc.).

### Backend

**pgvector** + **HNSW**. Fichier index : `app/apps/web/src/db/ensure-vector-index.ts:46-58`.

Params : `WITH (m = 16, ef_construction = 64)` avec `vector_cosine_ops`. Auto-migre depuis IVFFlat si present (lignes 30-43).

`ef_search` : default pgvector = 40, commentaire embeddings.ts:57 `"sufficient for datasets under 100K rows"`. Pas de `SET` applicatif.

### Stockage

Table `embeddings` avec UNIQUE(tenant_id, entity_type, entity_id) (commentaire embeddings.ts:22). Pattern upsert = DELETE puis INSERT (37-44). Troncature a 6000 chars = ~1500 tokens (embeddings.ts:31).

### Query flow (search/tam/route.ts)

1. `searchSimilar(query, limit, tenantId)` (26) — pgvector `ORDER BY embedding <=> $vector LIMIT`.
2. Filter par `entityType` cote JS (30-32) — **inefficace** : pgvector retourne les `limit` top-K sans egard au type, puis on filtre. Pour `entityType: "company"` sur un tenant ou la majorite des embeddings sont des activites, les resultats company sont dilues. Devrait etre filtre au niveau SQL avec `WHERE entity_type = $x`.
3. Batch hydrate par type via `Promise.all` + `inArray` (38-48) — correct, pas de N+1.
4. Mappage en `results: [{entityType, entityId, content, similarity, entity}]`.

### Latence typique

- Embed query (OpenAI) : ~100-300ms.
- pgvector HNSW query : ~10-50ms pour <100k rows.
- Hydrate : ~20ms.
- Total : ~200-400ms.

### Fallback

**Aucun.** Si OpenAI down → throw (embeddings.ts:8-10) → 500 cote client. Cote UI (accounts/page.tsx:164), `if (res.ok)` — en cas d'echec, `setSearchResults` n'est pas appele, donc le tableau fallback sur le filtre string-match local (234-237). Silencieux.

### Verrouillage tenant

`WHERE tenant_id = $tenantId` dans le SQL (embeddings.ts:76). OK. Mais la branche sans tenantId (82-90) expose potentiellement tous les embeddings — non atteignable depuis cette route (tenantId toujours passe) mais code dangeureux s'il est appele sans argument ailleurs.

---

## Account Intelligence

Endpoint : `app/apps/web/src/app/api/accounts/[id]/intelligence/route.ts` (152 lignes).

### Genere

`briefSchema` (10-14) :
- `brief` : 3-sentence intelligence brief
- `keyRelationships` : array of strings (people/entities)
- `suggestedAction` : one next action

### Flux

1. Cache `Map<string, {data, expiresAt}>` en-memoire, TTL 1h (17, 142). **Pas de cache multi-process** — chaque instance serveur a son propre Map, invalide lors d'un cold start.
2. Fetch account (37-45).
3. Fetch recent activities : top 10 par `occurredAt desc` WHERE `entityType='company'` (48-64). **Meme bug que scoring** — ignore activites des contacts du compte.
4. Fetch contacts at account (67-71), limit 10.
5. Fetch deals (74-78), limit 5.
6. **Context graph** — `exploreGraphAroundEntity(account.name, tenantId, 1)` (83) — depth 1. Extract nodes + valid edges (top 5 par fact). Si exception → silencieux, graphContext reste `""` (93-95).
7. Fallback empty : si aucune activite+contact+deal+graph → cache + retourne `{brief: "Not enough data yet...", keyRelationships: [], suggestedAction: "Enrich..."}` (98-106).
8. Sinon appel LLM `claude-haiku-4-5-20251001` avec `tracedGenerateObject`, `maxTokens: 250`.

### Cout

Haiku 4.5 : ~0.80 $/M input + 4 $/M output. Prompt ~300 tok + output 250 max → ~3000-4000 tok/call = ~0.003-0.005 $/call. Avec cache 1h = cher si le slide-over est ouvert rarement mais OK.

### Key relationships — d'ou vient-il ?

Entierement infere par le LLM depuis le prompt (contactsSummary + graphContext + activitiesSummary). Pas de garantie que les strings retournes soient des entites reelles dans la DB. Haiku peut hallucinee des noms.

### Suggested action

Aussi inference LLM. Pas de hook vers une action concrete (pas de `actionType: "send_email" | "book_meeting"`), juste prose.

### Click actions dans IntelligenceBrief ?

Aucune (voir section component ci-dessus). `suggestedAction` est affiche en accent color mais n'est pas un `<a>` ni `<button>`. Opportunite produit : rendre actionable (CTA "Draft email", "Add to sequence").

---

## Gaps critiques

### Haute priorite

| Gap | Impact | Mitigation |
|---|---|---|
| **Bulks tronques silencieusement a 20** (enrich ligne 45, signals ligne 54) | User clique "Enrich 500", seulement 20 enrichis, aucun message | Retourner `{enriched, failed, skipped: total - 20}` + toast UI + boucle cote client en batchs de 20 |
| **Engagement score ignore activites des contacts** (score/route.ts:25, 41, etc.) | Score engagement reste a 0 meme si le compte a 30 emails via ses contacts. Fait passer des comptes chauds pour froids | Etendre la query : `activities WHERE (entityType='company' AND entityId=$id) OR (entityType='contact' AND entityId IN (contacts of $id))` |
| **Aucun feedback d'erreur dans l'UI** (page.tsx: 84, 113, 122, 135, 146, 156, 165 tous `catch{}`) | Les fetches echouent en silence, l'utilisateur croit que l'action a marche | Toast/banner systematique, meme log d'erreur minimal |
| **Pagination UI charge tout en serie** (page.tsx:68-85) | Pour 5k comptes = 25 fetch serie avant 1er render. TTI > 10s | Pagination serveur + virtualisation (react-virtual) ou infinite scroll reel |
| **Signal popover "Sources" tab jamais remplie** (route.ts schema, page.tsx:707) | Tab visible mais vide, crée confusion | Soit supprimer la tab, soit ajouter une vraie recherche news (Tavily, Exa) dans le prompt |
| **scoreAll non cappe** (route.ts:152) | Bouton "Score All" sur 10k comptes cloue le serveur (50k requetes SQL serie) | Slice + batch UI en chunks de 50 avec progress bar |
| **Re-enrichissement jamais declenche** (enrich route.ts:59-63) | Info Apollo vieillit indefiniment | Cron + TTL sur `enriched_at`, ou invalidation manuelle UI |

### Moyenne priorite

| Gap | Impact | Mitigation |
|---|---|---|
| **Cache intelligence in-memory** (route.ts:17) | Perdu au redeploy, divergence entre instances | Redis ou DB cache, ou accepter TTL court (1h actuellement) |
| **Filter entityType JS post-query** (search/tam/route.ts:30-32) | Resultats company dilues sur tenants riches en activites | `WHERE entity_type = $x` dans `searchSimilar` |
| **isEnriched UI heuristic** (page.tsx:185) = `industry && description` | Un compte enrichi sans description est compte comme "non enrichi" | Utiliser `properties.enrichment_source === "apollo"` |
| **Selection multiple morte** (page.tsx:62, 409-421) | Feature visible mais sans action | Brancher "Score selected" / "Detect signals selected" / "Delete" |
| **Badge "Suggested" sur contacts reels** (page.tsx:798) | Copie trompeuse | Distinguer suggestions Apollo vs contacts DB |
| **Legacy customBoolColumns hardcodes** (page.tsx:193) | Dette | Purger une fois qu'aucune donnee ne les reference |
| **Cliff fit/engagement 100/0 → 60/40** (score/route.ts:173) | Premiere activite fait chuter brutalement | Lissage sigmoide : `engWeight = 0.4 * sigmoid(engagement.score)` |
| **IntelligenceBrief sans action** (intelligence-brief.tsx:96-100) | CTA texte sans hook | Parser `suggestedAction` en intent + rendre button |
| **Apollo sans timeout** (apollo-client.ts:29) | Requete pendante = UI bloquee | `AbortController` + 10s timeout |
| **Signals ecrase tout a chaque run** (signals route.ts:139-146) | Historique perdu, impossible de voir "nouveaux signaux depuis..." | Append + dedup par `{type, title}` + `detectedAt` |

### Basse priorite

| Gap | Impact | Mitigation |
|---|---|---|
| `llmFallbackSchema` mort (enrich route.ts:18-23) | Code confusant | Supprimer |
| Apollo `searchLimit` cap a 50 (search/tam:25) non documente UI | - | Ajouter "Showing top 50" |
| Popover Clearbit logo sans fallback (page.tsx:712) | Logos casses si Clearbit down | Fallback favicon navigateur |
| `loadingContacts` global page.tsx:65 | Race si utilisateur spamme | Cancel precedent fetch (AbortController) |

---

## Points forts

| Point | Ou |
|---|---|
| **Separation fit/engagement avec raisons detaillees** | scoring.ts:62-158, persistes dans `properties.score_*_reasons` |
| **Extended thinking sur Signals** avec prompt few-shot rigoureux | signals/route.ts:104-125 |
| **Guard anti-hallucination** : signals uniquement si `enrichment_source === "apollo"` + `dataSource` requis dans schema | signals/route.ts:90-92, 19-20 |
| **Re-embedding automatique post-enrich** | enrich/route.ts:103-113 |
| **HNSW auto-setup avec migration IVFFlat → HNSW** | ensure-vector-index.ts:30-58 |
| **Adaptive weighting fit/engagement** (concept, malgre le cliff) | score/route.ts:172-175 |
| **Apollo-first, pas de LLM hallucinant des industries** | enrich/route.ts:124 |
| **Context graph integre dans IntelligenceBrief** | intelligence/route.ts:81-95 |
| **Thresholds de grade centralises** utilises front+back | scoring.ts:9-34 |
| **ICP typee depuis tenant settings** (industries + sizeRange + geographies) | score/route.ts:137-148 |
| **Cache 1h sur intelligence brief** evite d'appeler Haiku a chaque slide-over | intelligence/route.ts:30-33, 142 |
| **Rate-limit par tier** (llm 20/min, enrich 30/min) | rate-limit.ts:51-56 |
| **Tracing LLM avec `tracedGenerateObject` + `_trace`** | intelligence/route.ts:138, signals/route.ts:132 |
| **Pagination serveur** (pageSize + total) meme si UI l'ignore | api/accounts/route.ts:15-17, 85 |
| **Helpers pur testables** (`calculateFitScore`, `getGrade`) sans I/O | scoring.ts commentaire ligne 1-3 |

Rapport écrit dans _reports/audit-deep/03c-accounts.md

