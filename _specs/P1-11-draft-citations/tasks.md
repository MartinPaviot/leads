# Tasks — P1-11 — Citations phrase-par-phrase + re-vérif à l'approbation

Estimation totale : **~4,5 jours-dev** (9 demi-journées). MVP boilable ; aucun océan dans le scope.

## T0 — Audit lecture (read-only)

**Action** : Confirmer en live (post-P0) : (a) `generatedSequenceSchema` sans `claims` (`sequence-generator.ts:37-51`) ; (b) `personalizationSources: []` codé en dur (`sequence-draft-router.ts:263`) ; (c) gate approve sans vérif (`approve/route.ts:26-179`) ; (d) colonne exacte de date sur `intelligenceBriefs` (`generated_at` vs `created_at`, `db/schema/outbound.ts` ou schema briefs) ; (e) shape du rendu evidence-quote inbox (`_conversation-pane.tsx:1033-1041`).
**Verify** : grep des 5 ancres confirmé.
**Test** : N/A.
**Estimation** : 0,5 demi-journée.

## T1 — Schéma `claims[]` à la génération [NEW] (R1.1, R1.2, R1.3)

**Action** : Étendre `generatedSequenceSchema` (`lib/agents/sequence-generator.ts:37-51`) avec `claims: z.array(claimSchema).default([])` ; ajouter le bloc CITATIONS au prompt (`buildGenerationPrompt:216-305`) bornant `sourceHref` aux URLs présentes dans le `ProspectContext`.
**Verify** : `pnpm tsc` vert ; un appel de génération en dev produit `steps[].claims` non vide sur un contexte avec brief.
**Test** : `app/apps/web/src/lib/agents/__tests__/sequence-generator-claims.test.ts` — schéma parse un objet avec `claims` ; rejette `sourceHref` non-URL ; `default([])` quand omis.
**Estimation** : 1 demi-journée.

## T2 — Dérivation + persistance `personalizationSources` [NEW] (R1.4, R1.5)

**Action** : Créer `lib/sequence-drafts/claims-from-context.ts` avec `claimsToSources(llmClaims, ctx): DraftClaim[]` (pur) ; étendre le schéma de sortie de `personalizeStepEmail` (`sequence-generator.ts:368-440`) pour porter `claims` ; au router (`inngest/sequence-draft-router.ts:263`) remplacer `personalizationSources: []` par `claimsToSources(personalised.claims ?? [], ctx)`.
**Verify** : en dev, un draft créé via le router a `personalizationSources` non vide avec `{kind,label,href,quote}` ; fail-open si le LLM threw (`[]`).
**Test** : `app/apps/web/src/lib/sequence-drafts/__tests__/claims-from-context.test.ts` — map URL→`{kind:'url',href}` ; drop href malformé ; funding→`{kind:'funding'}` sans href ; `[]` en entrée vide.
**Estimation** : 1 demi-journée.

## T3 — Gate citations à l'approbation [NEW] (R3.1, R3.2, R3.3, R3.4, R3.5)

**Action** : Dans `app/api/sequences/drafts/[id]/approve/route.ts`, après `canTransition` (:77) et avant l'update (:93), insérer le gate `collectCitationUrls` → `verifySignalUrlsBatch` → `decideCitationGate` ; 409 `{deadUrls, reviewReason}` si fail, sans muter le draft.
**Verify** : `curl` POST approve sur un draft à URL morte ⇒ 409 + statut inchangé ; URL vivante ⇒ 200 + `approved`.
**Test** : `app/apps/web/src/app/api/sequences/drafts/__tests__/approve-citation-gate.test.ts` (mock `verifySignalUrlsBatch`) — URL morte→409 + pas d'update ; URL vivante→200 ; `personalizationSources=[]`→pas de vérif réseau (no-op) ; cache hit→pas de HEAD.
**Estimation** : 1 demi-journée.

## T4 — Freshness gate non-URL au send [NEW] (R4.1, R4.2, R4.3, R4.4)

**Action** : Créer `lib/sequence-drafts/freshness-gate.ts` avec `decideFreshnessGate(sources, briefGeneratedAt, now)` (pur, TTL 14j) ; ajouter `loadBriefGeneratedAt(tenantId, contactId)` (lecture `intelligenceBriefs`, tenant-scopée) ; câbler dans `inngest/sequence-draft-to-outbound.ts` après le gate citations (:174) et avant le branch phone (:216), recall via `canTransition('recall')` (même pattern :149-163).
**Verify** : un draft à claim `funding` + brief 20j ⇒ recall ; brief 3j ⇒ pass ; pas de brief ⇒ pass.
**Test** : `app/apps/web/src/lib/sequence-drafts/__tests__/freshness-gate.test.ts` — 20j→stale ; 13j→fresh ; `briefGeneratedAt=null`→ok ; sources sans funding/headcount→ok. Intégration : `app/apps/web/src/__tests__/sequence-draft-to-outbound-freshness.test.ts` — recall émis sur brief périmé.
**Estimation** : 1 demi-journée.

## T5 — Primitive `<CitedBody>` + refonte "Why this draft?" [NEW] (R2.1, R2.2, R2.3, R2.4, R2.5)

**Action** : Extraire `components/cited-body.tsx` (`<CitedBody body sources />`) réutilisant le motif evidence-quote inbox (`_conversation-pane.tsx:1033-1041`) : surlignage `<mark>` de la première occurrence de chaque `sentence`/`quote`, tooltip `{label, quote, href}` (lien `target=_blank rel=noopener`), texte pur (no `dangerouslySetInnerHTML`) ; remplacer le `<pre>{JSON.stringify(...)}` (`sequence-draft-preview.tsx:357-376`) par `<CitedBody>` ; fallback corps nu si aucune source.
**Verify** : `/sequences/review` (dev) — draft cité montre phrases surlignées + tooltip ; draft sans source montre corps nu, zéro JSON dump.
**Test** : `app/apps/web/src/components/__tests__/cited-body.test.tsx` (Testing Library) — surligne la phrase ancrée ; lien cliquable si href ; aucun `<pre>` JSON ; phrase manquante→pas d'erreur ; phrase répétée→1 seule occurrence surlignée. E2E `app/apps/web/e2e/draft-citations.spec.ts` — preview rend mark + tooltip, pas de JSON brut.
**Estimation** : 1 demi-journée.

## T6 — Régression + non-régression des gates existants (R3, R4, AC8, AC9)

**Action** : Vérifier que peupler `personalizationSources` ne casse pas le gate citations send existant (`sequence-draft-to-outbound.ts:129-174`) ni le spam gate ; ajouter test de régression couvrant l'ordre des gates (citations→freshness→spam).
**Verify** : `pnpm test` vert sur la suite drafts ; `pnpm tsc` + `pnpm lint` verts.
**Test** : `app/apps/web/src/__tests__/sequence-draft-to-outbound-gate-order.test.ts` — URL morte recall AVANT freshness ; URL vivante + funding périmé→freshness recall ; tout frais→passe au spam gate.
**Estimation** : 0,5 demi-journée.

## Ordre d'exécution

T0 → T1 → T2 (dépend de T1 pour le schéma claims) → T3 (indépendant de T2, peut paralléliser) → T4 → T5 (dépend de T2 pour des sources réelles à rendre) → T6 (dernier, valide tout).

Chemin critique : T0→T1→T2→T5. T3 et T4 parallélisables après T0.

## Estimation effort

9 demi-journées = **~4,5 jours-dev**. Chaque task a un test écrit (Vitest ou Playwright). Zéro DDL ⇒ pas de risque migration.
