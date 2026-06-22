# Tasks — P0-4 (pre-send spam-check)

Estimation totale : **~1.5 jour** (3 demi-journées). Chaque task a un test écrit.

## T0. Audit lecture (read-only)
- **Action** : lire `edit/route.ts` (ligne du `.set`), reconfirmer `email-spam-check.ts:103-216`,
  `sequence-draft-to-outbound.ts:127-172`, `router.ts:75-90`, `state-machine.ts:117-130`,
  `outbound.ts:128-195`, `context/route.ts:127-133`, `sequence-draft-preview.tsx:339-377`.
- **Verify** : `grep -rn checkSpamSignals app/apps/web/src` → 2 fichiers (module+test) avant fix.
- **Test** : N/A.

## T1. [NEW] Helper pur `decideSpamGate`
- **Action** : créer `app/apps/web/src/lib/sequence-drafts/spam-gate.ts` (Fix 1).
- **Verify** : `pnpm tsc` vert ; import de `SpamCheckResult` résout.
- **Test** : `app/apps/web/src/__tests__/spam-gate.test.ts` — `ok:true` pour clean/low/medium ;
  `ok:false` + `reviewReason` contenant "High spam risk" + `codes` non vide pour high ;
  frontière score 49 (medium, ok) vs 50 (high, blocked).

## T2. [NEW] Schéma : 3 colonnes spam sur `sequenceDrafts`
- **Action** : ajouter `spamScore`/`spamSeverity`/`spamWarnings` (`outbound.ts:128-195`,
  Data model) ; générer la migration drizzle.
- **Verify** : `pnpm db:push` (dev `leadsens-localdev`) ; `pnpm db:studio` → colonnes
  présentes, nullables. Ne PAS toucher la prod.
- **Test** : `app/apps/web/src/__tests__/schema-sequence-drafts-spam.test.ts` — `sequenceDrafts.$inferInsert`
  accepte les 3 champs optionnels (assert de type via `expectTypeOf` ou simple build assert).

## T3. [NEW] `buildDraftRow` calcule + peuple le score (génération-time)
- **Action** : modifier `router.ts:75-90` + types `DraftRowInsert` (`:60-73`) (Fix 3).
- **Verify** : `pnpm tsc` ; l'insert dans `sequence-draft-router.ts:266-272` compile sans
  changement (la row porte les nouveaux champs).
- **Test** : étendre `app/apps/web/src/__tests__/sequence-draft-router.test.ts` (ou créer
  `router-spam.test.ts`) — `buildDraftRow({subject:"WINNER!!!", bodyText:"..."})` renvoie
  `spamSeverity:"high"` ; subject/body propres → `spamSeverity:"clean"`, `spamScore:0`.

## T4. [NEW] Spam gate send-time dans le bridge
- **Action** : insérer le bloc Fix 2 dans `sequence-draft-to-outbound.ts` après `:172`,
  avant `:179` ; ajouter les imports.
- **Verify** : `pnpm tsc` ; relecture : le `return` ne se déclenche que sur high+recallable ;
  le cas `ok` tombe vers le code phone/email existant inchangé.
- **Test** : `app/apps/web/src/__tests__/sequence-draft-to-outbound-spam.test.ts` (mock `db`
  + `step`, calque le test du citation gate s'il existe) :
  (a) draft `approved` email spammy high → pas d'insert `outboundEmails`, update status
  `pending_approval` + `reviewReason` + `spamSeverity:"high"`, retour `{skipped:"spam_high"}` ;
  (b) draft propre → fall-through, insert appelé ;
  (c) severity medium → fall-through (pas de recall) ;
  (d) `canTransition` non allowed (status non `approved`) → `{skipped:"spam_high_not_recallable"}`, no update.

## T5. [NEW] Recalcul spam à l'édition
- **Action** : modifier `edit/route.ts` (Fix 4) — recalcul dans le `.set`.
- **Verify** : `pnpm tsc` ; relecture du `.set` contient les 3 champs.
- **Test** : `app/apps/web/src/__tests__/draft-edit-spam.test.ts` — POST edit avec subject
  `"WINNER!!!"` → row mise à jour avec `spamSeverity:"high"` (mock db) ; subject propre →
  `clean`.

## T6. [NEW] Context route expose spam*
- **Action** : modifier `context/route.ts:127-133` (Fix 5).
- **Verify** : `pnpm tsc` ; appel manuel `GET /api/sequences/drafts/<id>/context` (dev,
  authed) → JSON `draft.spamSeverity` présent.
- **Test** : `app/apps/web/src/__tests__/context-route-spam.test.ts` — mock db renvoie un
  draft avec `spamSeverity:"high"` → la réponse JSON inclut `draft.spamScore/spamSeverity/spamWarnings`.

## T7. [NEW] UI "Deliverability check" + types
- **Action** : étendre `ContextBundle.draft` (`sequence-draft-preview.tsx:37`) et
  `DraftListItem` (`sequence-draft-list.tsx:22-39`) avec les champs spam optionnels ;
  ajouter la section conditionnelle (Fix 6) après `:377`.
- **Verify** : `pnpm tsc` ; lancer le dev, ouvrir `/sequences/review` sur un draft high →
  section rouge listant les messages ; draft clean → section absente. Screenshot.
- **Test** : `app/apps/web/src/__tests__/sequence-draft-preview-spam.test.tsx` (happy-dom +
  Testing Library, mock `fetch` du context) — severity high → texte du warning visible ;
  severity clean → section "Deliverability check" absente du DOM.

## T8. Garde anti-régression "checkSpamSignals est câblé"
- **Action** : test qui assert que `checkSpamSignals` est importé hors de son test (évite
  le retour au code mort).
- **Verify** : le test échouerait si les imports de T3/T4 disparaissaient.
- **Test** : `app/apps/web/src/__tests__/spam-check-wired.test.ts` — grep/`import` assert que
  `sequence-draft-to-outbound.ts` ET `router.ts` référencent `checkSpamSignals`.

## Ordre d'exécution
- T0 → T1 (helper, indépendant) → T2 (schéma, bloque T3/T5/T6) →
  T3, T4, T5 (parallélisables après T2 ; T4 dépend de T1) →
  T6 (après T2) → T7 (après T6) → T8 (après T3+T4).
- T1 et T2 sont la racine ; T7 est la feuille.

## Estimation effort
- T1 : 0.5 j (helper + tests frontière). T2 : 0.25 j (migration + push dev).
- T3 : 0.25 j. T4 : 0.5 j (le mock Inngest/db est le gros morceau). T5 : 0.25 j.
- T6 : 0.25 j. T7 : 0.5 j (UI + test RTL). T8 : 0.1 j.
- **Total ≈ 1.5–2 j** selon réutilisation des mocks db/step existants.
