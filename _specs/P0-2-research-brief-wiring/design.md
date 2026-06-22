# Design — P0-2 Brancher le brief de recherche

## Composants existants (read-only puis fix cible)

| Fichier | Role | Status |
|---|---|---|
| `app/apps/web/src/lib/campaign-engine/build-intelligence-brief.ts:18-108` | Construit/cache le brief; `getCachedBrief` `:110-132` lit le cache TTL-scopé | ✅ correct — reutiliser tel quel, exporter un helper de lecture cache-only |
| `app/apps/web/src/lib/campaign-engine/types.ts:1-23` | Type `IntelligenceBrief` (source des champs) | ✅ correct — read-only |
| `app/apps/web/src/lib/context/prospect-context.ts:23-83` | Interface `ProspectContext` | a modifier — ajouter `researchBrief?` |
| `app/apps/web/src/lib/context/prospect-context.ts:89-270` | `buildProspectContext` | a modifier — peupler `researchBrief` (cache-only) |
| `app/apps/web/src/lib/context/prospect-context.ts:275-337` | `formatContextForPrompt` | a modifier — emettre section `RESEARCH BRIEF` |
| `app/apps/web/src/lib/agents/sequence-generator.ts:303-347` | `buildPersonalizationBrief` | a modifier — angle+pains en tete |
| `app/apps/web/src/lib/agents/sequence-generator.ts:58-116` | `generateSequence` | ✅ correct — consomme `ctx`, rien a changer |
| `app/apps/web/src/app/api/campaigns/generate/route.ts:64-136` | Route generate, 2 chemins | a modifier — AWAIT brief + threading |
| `app/apps/web/src/lib/campaign-engine/select-strategy.ts:10-33` | `selectStrategy` (await, lit le brief pour le `strategyId`) | ✅ correct — non touche |

## Fixes cibles

### Fix 1 — Type `ProspectContext.researchBrief` (`prospect-context.ts`)

Ajouter le champ optionnel apres `recentActivities` (`:77-82`) :

```ts
export interface ResearchBriefContext {
  bestAngle: string | null;
  painPoints: string[];
  competitorDetected: string | null;
  publicContent: Array<{ type: string; title: string; quote: string }>;
  warmthSignals: Array<{ type: string; detail: string }>;
}

export interface ProspectContext {
  // ... champs existants inchanges ...
  recentActivities: Array<{ /* ... */ }>;
  researchBrief?: ResearchBriefContext; // R1
}
```

### Fix 2 — Helper de lecture cache-only (`build-intelligence-brief.ts`)

`getCachedBrief` (`:110-132`) est `private`. Exporter une fonction publique qui ne fait QUE lire le cache (jamais de scrape), reutilisant la meme logique de conditions :

```ts
// build-intelligence-brief.ts — nouvel export, reutilise getCachedBrief
export async function readCachedBrief(
  tenantId: string,
  companyId: string,
  contactId: string | null,
): Promise<IntelligenceBrief | null> {
  return getCachedBrief(tenantId, companyId, contactId); // :110-132, deja TTL+tenant scoped
}
```

Mapping brief -> `ResearchBriefContext` (helper pur, testable) :

```ts
export function toResearchBriefContext(b: IntelligenceBrief): ResearchBriefContext {
  return {
    bestAngle: b.bestAngle,
    painPoints: b.painPoints ?? [],
    competitorDetected: b.competitorDetected,
    publicContent: (b.publicContent ?? []).slice(0, 2).map((p) => ({
      type: p.type, title: p.title, quote: (p.quote ?? "").slice(0, 200),
    })),
    warmthSignals: (b.warmthSignals ?? []).map((w) => ({ type: w.type, detail: w.detail })),
  };
}

// undefined si rien d'exploitable (edge: champs tous vides)
export function briefIsEmpty(c: ResearchBriefContext): boolean {
  return !c.bestAngle && c.painPoints.length === 0
    && !c.competitorDetected && c.publicContent.length === 0
    && c.warmthSignals.length === 0;
}
```

### Fix 3 — Peupler `researchBrief` dans `buildProspectContext` (`prospect-context.ts:89-270`)

Apres avoir resolu `contact.companyId` (`:110`), lire le cache et mapper. Lecture seule, jamais de refresh (R14) :

```ts
let researchBrief: ResearchBriefContext | undefined;
if (contact.companyId) {
  const { readCachedBrief, toResearchBriefContext, briefIsEmpty } =
    await import("@/lib/campaign-engine/build-intelligence-brief");
  const cached = await readCachedBrief(tenantId, contact.companyId, contactId);
  if (cached) {
    const mapped = toResearchBriefContext(cached);
    if (!briefIsEmpty(mapped)) researchBrief = mapped;
  }
}
// ... return { ..., recentActivities, researchBrief };
```

Note : `await import` dynamique pour rester aligne sur le style du fichier (`:167,226`) et eviter un cycle d'import statique `prospect-context <-> build-intelligence-brief` (qui importe `companies/contacts` du schema, sans dependance circulaire connue, mais le dynamic import est sur).

### Fix 4 — Section `RESEARCH BRIEF` dans `formatContextForPrompt` (`prospect-context.ts:275-337`)

Inserer AVANT la section `BUYING SIGNALS` (`:298`), apres `COMPANY` (`:286-295`), pour que le LLM voie la recherche en tete du dossier :

```ts
if (ctx.researchBrief) {
  const b = ctx.researchBrief;
  const lines: string[] = [];
  if (b.bestAngle) lines.push(`- Best angle: ${b.bestAngle}`);
  if (b.painPoints.length) lines.push(`- Pain points: ${b.painPoints.join("; ")}`);
  if (b.competitorDetected) lines.push(`- Competitor in use: ${b.competitorDetected}`);
  for (const p of b.publicContent) lines.push(`- They said publicly (${p.type}): "${p.quote}"`);
  for (const w of b.warmthSignals) lines.push(`- Warm path: ${w.type} — ${w.detail}`);
  if (lines.length) sections.push(`RESEARCH BRIEF (use this angle first):\n${lines.join("\n")}`);
}
```

### Fix 5 — `buildPersonalizationBrief` : angle+pains en tete (`sequence-generator.ts:303-347`)

Construire les lignes du brief de recherche AVANT le bloc signal/funding/tech (`:306-337`) :

```ts
function buildPersonalizationBrief(ctx: ProspectContext): string {
  const facts: string[] = [];

  // R6 — recherche d'abord
  const rb = ctx.researchBrief;
  if (rb?.bestAngle) facts.push(`- ANGLE (from research): ${rb.bestAngle} — lead with this`);
  if (rb?.painPoints?.length) facts.push(`- PAIN POINTS (from research): ${rb.painPoints.join("; ")}`);
  if (rb?.competitorDetected) facts.push(`- COMPETITOR DETECTED: ${rb.competitorDetected} — position against it`);

  // facts firmographiques existants (signal, funding, tech, size, industry, role, ...) inchanges
  if (ctx.bestSignal) facts.push(`- SIGNAL TO USE: ...`); // :307-309
  // ... reste identique :312-337 ...

  if (facts.length === 0) {
    return "PERSONALIZATION BRIEF: Limited data available. ..."; // :340 inchange
  }
  return `PERSONALIZATION BRIEF — Use ALL of these specific facts ...`; // :343-346 inchange
}
```

### Fix 6 — Route : AWAIT borne + threading (`route.ts:64-136`)

Remplacer le fire-and-forget (`:67-69`) par un AWAIT borne par timeout, fail-open :

```ts
// helper local ou util partage
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((res) => { t = setTimeout(() => res(null), ms); });
  try { return await Promise.race([p.catch(() => null), timeout]); }
  finally { if (t) clearTimeout(t); }
}

const TIMEOUT_BRIEF_MS = Number(process.env.GENERATE_BRIEF_TIMEOUT_MS ?? 8000);

let resolvedBrief: IntelligenceBrief | null = null;
if (companyForBrief) {
  resolvedBrief = await withTimeout(
    buildIntelligenceBrief(companyForBrief, authCtx.tenantId, contactForBrief || undefined),
    TIMEOUT_BRIEF_MS,
  ); // R8/R9/R15
}
```

Chemin contact (`:86-89`) — le brief est deja lu par `buildProspectContext` (Fix 3), donc rien a injecter manuellement ; mais si `resolvedBrief` vient d'etre construit a froid, `buildProspectContext` le relira depuis le cache (qui vient d'etre upsert `:98-105`). Idempotent.

Chemin template (`:90-136`) — injecter dans `minimalCtx` :

```ts
const minimalCtx = {
  // ... champs existants :104-133 ...
  researchBrief: resolvedBrief && !briefIsEmpty(toResearchBriefContext(resolvedBrief))
    ? toResearchBriefContext(resolvedBrief)
    : undefined, // R11
};
```

## Data model

Aucun changement de schema. La table `intelligenceBriefs` porte deja tous les champs lus (`build-intelligence-brief.ts:74-95`, `rowToBrief` `:196-220`). Aucune migration, aucun backfill (R13).

## Flux (ordre des appels)

1. `POST /api/campaigns/generate` (`route.ts:16`) — auth (`:17-20`), resout `resolvedContactId` (`:27-61`), resout `companyForBrief` (`:66`).
2. **NOUVEAU** : `resolvedBrief = await withTimeout(buildIntelligenceBrief(...), 8000)` (Fix 6). Cache hit -> instantane ; cache froid -> scrape+LLM borne 8s ; echec/timeout -> `null` (fail-open, R9).
3. `selectStrategy(...)` (`:77`) — inchange, fournit `strategyUsed` (R12).
4. **Chemin contact** (`:86-89`) : `buildProspectContext` (Fix 3) relit le cache (desormais peuple) -> `ctx.researchBrief` -> `generateSequence(ctx)` -> `buildGenerationPrompt` -> `formatContextForPrompt` (Fix 4) + `buildPersonalizationBrief` (Fix 5) injectent le brief dans le prompt.
5. **Chemin template** (`:90-136`) : `minimalCtx.researchBrief` injecte directement (Fix 6) -> meme rendu downstream.
6. Persistance steps (`:139-181`) et reponse 201 (`:183-194`) — inchanges.

Garde clef : le brief n'est JAMAIS bloquant pour la reponse (race + fail-open). Le LLM voit la recherche uniquement si elle est arrivee a temps et non vide.

## Failure handling / Security

- **Fail-open motive** : la generation de copy est la valeur primaire ; un brief manquant degrade la qualite mais ne doit pas faire echouer le send. R9/R15 -> timeout 8s puis flux firmographique. Inverse (fail-closed) bloquerait le founder sur une dependance scraping externe — inacceptable.
- **Tenant-scoping** : toute lecture passe par `readCachedBrief` qui delegue a `getCachedBrief` -> conditions `tenantId` + `companyId` (+`contactId`) (`build-intelligence-brief.ts:115-123`). Aucune lecture cross-tenant possible.
- **Idempotence** : lecture cache idempotente ; upsert brief gere par `onConflictDoUpdate` (`:101-104`) ; regeneration de sequence inchangee (`:141-157`).
- **Pas de fuite d'erreur** : le `catch` global de la route (`:195-204`) renvoie un message generique ; le `withTimeout` avale le rejet du brief avant qu'il n'atteigne ce catch.
- **Prompt safety** : `quote` tronquee a 200 car (Fix 2) ; aucune execution, texte pur dans le prompt.

## Open questions

- **Cycle d'import** : confirmer qu'un import (statique ou dynamique) `prospect-context -> build-intelligence-brief` ne cree pas de cycle via le schema. Mitigation deja choisie : `await import()` dynamique (Fix 3). A verifier au build (`pnpm tsc`).
- **Chemin contact + brief froid** : apres `buildIntelligenceBrief` a froid (`:98-105` upsert), `buildProspectContext` relit le cache — confirmer que l'upsert est visible dans la meme transaction/connexion (Neon/postgres serverless, pas de tx explicite ici -> committed, donc visible). Si flakey en serverless, passer `resolvedBrief` directement au lieu de relire. A verifier en eval live.
- **Valeur du timeout** : 8000 ms par defaut ; confirmer le p95 de `buildIntelligenceBrief` a froid pour calibrer (`sourceErrors`/`sourcesSucceeded` deja traces `:90-92`).
- **`getMethodology` doublon** dans la route (`:99-100` importe et appelle `getMethodology("VP")` mais `methodology` n'est pas utilise dans `minimalCtx`) — hors scope, ne pas toucher.
