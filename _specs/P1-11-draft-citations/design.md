# Design — P1-11 — Citations phrase-par-phrase + re-vérif à l'approbation

## Composants existants (read-only puis fix ciblé)

| Fichier | Rôle | Status | Ancre |
|---|---|---|---|
| `lib/agents/sequence-generator.ts` | `generatedSequenceSchema` (sortie LLM), `generateSequence`, `personalizeStepEmail` | **FIX** — étendre schéma avec `claims[]` | :37-51, :68-120, :368-440 |
| `inngest/sequence-draft-router.ts` | crée le draft, appelle `personalizeStepEmail`, passe `personalizationSources: []` | **FIX** — dériver + peupler les claims | :207-264 (`[]` à :263) |
| `lib/sequence-drafts/router.ts` | `buildDraftRow` (passe `personalizationSources` au row) | read-only (déjà paramétrique) | :55-89 |
| `lib/sequence-drafts/citations.ts` | `collectCitationUrls`, `decideCitationGate` (purs) | read-only — réutilisés tels quels | :25-69 |
| `inngest/sequence-draft-to-outbound.ts` | gate citations + spam au send | **FIX** — ajouter freshness gate non-URL | :129-209 |
| `app/api/sequences/drafts/[id]/approve/route.ts` | transition approve, advance enrollment, emit | **FIX** — insérer gate citations | :26-179 (gate après :77) |
| `components/sequence-draft-preview.tsx` | panneau "Why this draft?" (dump `<pre>`) | **FIX** — surlignage cité | :339-377 (`<pre>` :357-376) |
| `app/(dashboard)/inbox/_conversation-pane.tsx` | rendu evidence-quote inline | read-only — primitive à extraire/réutiliser | :1033-1041 |
| `lib/signals/url-verifier-cache.ts` | `verifySignalUrlsBatch` (cache 7j) | read-only — réutilisé | :22, :47+ |
| `lib/campaign-engine/build-intelligence-brief.ts` | `getCachedBrief` (TTL via `expiresAt`), `intelligenceBriefs` | read-only — source de la date brief | :111-147 |
| `db/schema/outbound.ts` | colonne `personalizationSources` jsonb | read-only — réutilisée (pas de DDL) | :149-152 |
| `app/api/sequences/drafts/[id]/context/route.ts` | mappe `signalsAtTriggerTime` | read-only | :169 |

## Fixes ciblés

### Fix 1 — Étendre `generatedSequenceSchema` avec `claims[]` (`sequence-generator.ts:37-51`)

```ts
// AJOUT au schéma (signatures réelles, z importé :14)
const claimSchema = z.object({
  sentence: z.string().describe("La phrase EXACTE du body qui s'appuie sur ce fait — copiée verbatim"),
  sourceKind: z.enum(["url", "funding", "headcount", "tech", "signal", "news", "other"]),
  sourceHref: z.string().url().optional().describe("URL http(s) cliquable si le fait vient d'une page web"),
  quote: z.string().max(280).optional().describe("Extrait verbatim de la source qui justifie la phrase"),
});

const generatedSequenceSchema = z.object({
  sequenceName: z.string(),
  sequenceReasoning: z.string(),
  steps: z.array(
    z.object({
      // ... champs existants inchangés (:42-49) ...
      claims: z.array(claimSchema).default([])
        .describe("Pour chaque phrase factuelle du body, la source qui l'ancre"),
    }),
  ),
});
```

Le prompt (`buildGenerationPrompt`, :216-305) gagne un bloc CITATIONS :
```
CITATIONS — Pour CHAQUE affirmation factuelle (funding, signal, tech, news, lien),
renvoie un claim { sentence (verbatim du body), sourceKind, sourceHref?, quote? }.
N'invente jamais de sourceHref : si tu n'as pas d'URL fournie dans le brief, omets-la.
```
Les URLs autorisées proviennent **exclusivement** du `ProspectContext` (brief `publicContent`, signals avec href) — on liste les hrefs disponibles dans le prompt pour borner l'hallucination.

### Fix 2 — Dériver + peupler `personalizationSources` (`sequence-draft-router.ts:247-264`)

`personalizeStepEmail` (:368-440) ne renvoie aujourd'hui que `{subject, body}`. On étend son schéma de sortie pour porter `claims`, OU (préféré, plus sûr) on **dérive les claims côté router depuis le `ProspectContext`** déjà construit (:209), via un helper pur :

```ts
// NOUVEAU — lib/sequence-drafts/claims-from-context.ts
export interface DraftClaim {
  kind: string; label: string; href?: string; quote?: string;
}
/** Map les claims LLM (verbatim sentence-anchored) + le contexte
 *  vers le shape { kind, label, href, quote } persistant. Pur. */
export function claimsToSources(
  llmClaims: Array<{ sentence: string; sourceKind: string; sourceHref?: string; quote?: string }>,
  ctx: ProspectContext,
): DraftClaim[];
```

Au router (:263), remplacer `personalizationSources: []` par `personalizationSources: claimsToSources(personalised.claims ?? [], ctx)`. Fail-open : `?? []` si le LLM n'a rien produit (R1.5).

### Fix 3 — Gate citations à l'approbation (`approve/route.ts`, après :77)

```ts
import { collectCitationUrls, decideCitationGate } from "@/lib/sequence-drafts/citations";
import { verifySignalUrlsBatch } from "@/lib/signals/url-verifier-cache";

// APRÈS le canTransition (:74-77), AVANT l'optimistic update (:93)
const citationUrls = collectCitationUrls(draft.personalizationSources);
if (citationUrls.length > 0) {
  const raw = await verifySignalUrlsBatch(citationUrls);
  const gate = decideCitationGate(
    raw.map((r) => ({ url: r.url, verified: r.status === "verified", reason: r.reason })),
  );
  if (!gate.ok) {
    return Response.json(
      { error: "stale_citation", deadUrls: gate.deadUrls, reviewReason: gate.reviewReason },
      { status: 409 },
    );
  }
}
```
Réutilise les MÊMES helpers que le send (cohérence garantie). Le draft reste `pending_approval` (aucune mutation avant le gate). Cache 7j ⇒ pas de re-HEAD si déjà vérifié.

### Fix 4 — Freshness gate non-URL au send (`sequence-draft-to-outbound.ts`, avant :181 / :216)

```ts
// NOUVEAU — lib/sequence-drafts/freshness-gate.ts (pur)
const FACT_FRESHNESS_TTL_DAYS = 14;
export function decideFreshnessGate(
  sources: Array<Record<string, unknown>>,
  briefGeneratedAt: Date | null,
  now: Date,
): { ok: true } | { ok: false; reviewReason: string; staleKinds: string[] };
```

Dans le bridge, après le gate citations (:174) et AVANT le branch phone (:216) :
```ts
const volatile = (draft.personalizationSources ?? []).filter(
  (s) => s?.kind === "funding" || s?.kind === "headcount",
);
if (volatile.length > 0) {
  const briefAt = await step.run("load-brief-age", () => loadBriefGeneratedAt(tenantId, draft.contactId));
  const fresh = decideFreshnessGate(volatile, briefAt, new Date());
  if (!fresh.ok) { /* recall via canTransition('recall') — même pattern que :149-163 */ }
}
```
`loadBriefGeneratedAt` lit `intelligenceBriefs.generatedAt` (tenant+company+contact scoped). Si pas de brief ⇒ `null` ⇒ `decideFreshnessGate` retourne `ok:true` (R4.3).

### Fix 5 — Rendu cité dans la preview (`sequence-draft-preview.tsx:339-377`)

Extraire une primitive partagée `<CitedBody body={draft.bodyText} sources={context.signalsAtTriggerTime} />` :
- Tokenise le body en segments ; pour chaque source `{kind,label,href,quote}`, trouve la première occurrence de la phrase ancrée (si `sentence`/`quote` matche un substring) et la wrappe `<mark>` + tooltip.
- Tooltip réutilise le motif inbox (`_conversation-pane.tsx:1033-1041`) : icône `Quote`, badge `kind`, texte `quote`, lien `href` (`target=_blank rel=noopener`).
- Supprime le `<pre>{JSON.stringify(context.signalsAtTriggerTime, null, 2)}</pre>` (:365-374).
- Fallback : aucune source ⇒ rend le `<pre>` body nu existant sans la sous-section.

## Data model

**Aucun changement de table.** La colonne `personalizationSources` jsonb existe déjà (`outbound.ts:149-152`) et porte le shape `{kind,label,href,quote}`. On la **peuple** au lieu de la laisser `[]`. Le `kind` étendu (`funding`/`headcount`/`tech`/`signal`/`news`) reste dans le `jsonb` libre — pas de migration enum.

La date brief vient de `intelligenceBriefs.generatedAt` (déjà existant, `build-intelligence-brief.ts`) — lecture seule.

## Flux (ordre des appels + gates)

**Génération → draft :**
1. `route-sequence-step-to-draft` → `buildProspectContext` (:209) → `personalizeStepEmail` (claims) (:222).
2. `claimsToSources(claims, ctx)` → `buildDraftRow({ personalizationSources })` (:252-264).
3. INSERT `sequence_drafts` avec sources peuplées.

**Approbation :**
1. `POST .../approve` → load draft tenant-scoped (:58-67) → `canTransition('approve')` (:74).
2. **[NOUVEAU] gate citations** : `collectCitationUrls` → `verifySignalUrlsBatch` (cache) → `decideCitationGate`. Fail ⇒ 409, pas de mutation.
3. OK ⇒ optimistic update `approved` (:93-110) → advance enrollment (:128-158) → emit `email.send.queued` (:163).

**Send (bridge) :**
1. `decideDispatch` (:116).
2. gate citations URL (existant, :136-174) — désormais avec sources réelles.
3. **[NOUVEAU] freshness gate** funding/headcount vs brief 14j → recall si périmé.
4. spam gate email (existant, :181-209).
5. branch phone_task / insert outbound.

Ordre des gates : citations URL (le plus fort, fail-closed) → freshness (fail-closed) → spam (fail-soft). Un fait faux/mort prime sur un faux positif spam.

## Failure handling / Security

- **Génération (Fix 1/2)** : **fail-open**. Pas de claims ⇒ `[]`, le draft se crée quand même (R1.5). Ne jamais bloquer la production d'un draft sur l'extraction de citations.
- **Approbation (Fix 3)** : **fail-closed**. URL morte ⇒ 409, draft non approuvé. Timeout réseau ⇒ 409 (re-approve re-tente). Cohérent avec la philosophie send.
- **Freshness (Fix 4)** : **fail-closed** sur fait périmé, mais **fail-open** si la date brief est indéterminable (`null` ⇒ pass) — on ne recalle pas sur une donnée non datable (R4.3).
- **Tenant-scoping** : approve charge le draft tenant-scopé (:64) ; le cache URL est global (URL = ressource publique, pas de fuite tenant) ; `loadBriefGeneratedAt` filtre `tenantId` + `companyId` + `contactId`.
- **Idempotence** : le gate approbation est sans effet de bord (lecture seule jusqu'à validation) ; le send conserve son dedup `draft:${draftId}` (`sequence-draft-to-outbound.ts:350`). Le freshness recall réutilise `canTransition('recall')` (idempotent : un draft déjà `pending_approval` ne re-transitionne pas).
- **Budget tokens** : Fix 1 ajoute des `claims` à un appel LLM **déjà émis** (même `tracedGenerateObject`, :90) ⇒ surcoût marginal (tokens de sortie structurés), pas d'appel supplémentaire. Aucun appel LLM dans les gates (vérif URL = HEAD, fraîcheur = comparaison de date).
- **XSS** : tooltips rendus en texte pur (jamais `dangerouslySetInnerHTML`), `href` validé `z.string().url()` à la génération + re-validé par `collectCitationUrls` (`new URL()`).

## Open questions

1. **Claims via `personalizeStepEmail` vs dérivation contexte** : le router utilise `personalizeStepEmail` (pas `generateSequence`). Décision : étendre le schéma de sortie de `personalizeStepEmail` ET fournir `claimsToSources` comme filet de dérivation depuis `ctx` (couvre les deux chemins). À trancher en T2 selon la qualité d'extraction LLM observée.
2. **`generatedAt` vs `createdAt` du brief** pour la fraîcheur : `intelligenceBriefs` a `generated_at`/`created_at` ? Vérifier en T0 la colonne exacte ; utiliser `generatedAt` si présent, sinon `createdAt`.
3. **TTL 14j configurable par tenant ?** Hors scope P1-11 — constante `FACT_FRESHNESS_TTL_DAYS = 14`. Flag tenant = follow-up.
