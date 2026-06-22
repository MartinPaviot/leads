# Tasks — P0-7 List-Unsubscribe (One-Click) worker BullMQ

Estimation totale : **~1 jour** (8 taches, dont 1 audit + 4 code + 3 test/verif).

## T0. Audit lecture (read-only)
- **Action** : relire `send.worker.ts:80-92`, `emailengine.ts:71-100`,
  `email-send-worker.ts:464-467,788-791`, `unsubscribe-token.ts:11-44`,
  `unsubscribe/route.ts:155-237`, `worker/tsconfig.json:11`, `worker/db.ts:10`.
  Confirmer que `@web/*` resout au runtime tsx (db.ts le prouve) et que
  `outboundEmails.tenantId/toAddress` existent (outbound.ts:290,297).
- **Verify** : `grep -n "List-Unsubscribe" app/apps/worker/src/workers/send.worker.ts`
  → 0 resultat (confirme le gap).
- **Test** : N/A.

## T1. Etendre `sendEmail` pour merger des headers arbitraires
- **Action** : modifier `app/apps/worker/src/services/emailengine.ts:71-100`
  selon Fix 1 (ajouter `headers?: Record<string,string>` au type, builder `headers`
  fusionne In-Reply-To/References + `email.headers`, n'assigner `body.headers` que
  s'il est non vide).
- **Verify** : `pnpm --filter @leadsens/worker tsc` (typecheck vert).
- **Test** : `app/apps/worker/src/__tests__/emailengine.headers.test.ts` —
  mock global `fetch`, appeler `sendEmail("acc", {...})` avec/sans `inReplyTo`,
  avec/sans `headers` ; asserter le `body.headers` POSTe (les 4 cas AC3/AC4/AC5 :
  4 cles / 2 cles / absent).
- **Refs** : R5, AC3, AC4, AC5.

## T2. Module worker `unsubscribe.ts` re-exportant le builder web
- **Action** : creer `app/apps/worker/src/services/unsubscribe.ts` (Fix 3) :
  `export { buildUnsubscribeUrl } from "@web/lib/emails/unsubscribe-token";`.
- **Verify** : `pnpm --filter @leadsens/worker tsc` resout `@web/...` (vert).
- **Test** : couvert par T5 (cross-runtime). Pas de test isole supplementaire.
- **Refs** : R3, R11.

## T3. Alias `@web` dans le vitest worker
- **Action** : modifier `app/apps/worker/vitest.config.ts` (Fix 4) pour ajouter
  `resolve.alias["@web"] = ../web/src`.
- **Verify** : un test important `@web/lib/emails/unsubscribe-token` se charge
  (T5 passe) ; `workers.test.ts` reste rouge UNIQUEMENT pour cause ioredis
  (pas de nouvelle erreur de resolution `@web`).
- **Test** : valide par execution de T5.
- **Refs** : edge case "vitest ne resout pas @web".

## T4. Injecter les headers One-Click dans `send.worker.ts`
- **Action** : modifier `app/apps/worker/src/workers/send.worker.ts` (Fix 2) :
  importer `buildUnsubscribeUrl` depuis `../services/unsubscribe.js`, calculer
  `appUrl` (env, R4) + `unsubUrl` avant `sendEmail:85`, passer
  `headers: { "List-Unsubscribe": "<"+unsubUrl+">", "List-Unsubscribe-Post":
  "List-Unsubscribe=One-Click" }`. Conserver le footer (`:80-83`) et `inReplyTo`.
- **Verify** : `grep -n "List-Unsubscribe" send.worker.ts` → 2 lignes ;
  `pnpm --filter @leadsens/worker tsc` vert.
- **Test** : `app/apps/worker/src/__tests__/send.worker.unsub-headers.test.ts` —
  mocker `../services/emailengine.js` (espion sur `sendEmail`),
  `../services/unsubscribe.js` (builder reel ou stub), `../db.js`, `../queues`,
  `../services/rate-limiter.js`, `../services/rotation.js` ; invoquer le processor
  capture (pattern `workers.test.ts:33-42`) avec un `email` queued non-opt-out ;
  asserter que `sendEmail` est appele avec `headers["List-Unsubscribe"]` matchant
  `/^<https?:\/\/.+\/api\/unsubscribe\?.+>$/` ET
  `headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click"`.
  NB : ce test exige que les mocks ioredis/postgres fonctionnent ; si le harness
  vitest reste casse pour ioredis, isoler en mockant `../queues/index.js`
  entierement (et non `ioredis`).
- **Refs** : R1, R2, R4, R6, R10, AC1.

## T5. Test cross-runtime : token worker verifiable par la route web
- **Action** : aucun code applicatif ; test seul.
- **Verify** : execution du test ci-dessous, vert.
- **Test** : `app/apps/worker/src/__tests__/unsub-token.crossruntime.test.ts` —
  `beforeEach` set `process.env.AUTH_SECRET="test-secret"` ; importer
  `buildUnsubscribeUrl` via `../services/unsubscribe.js` ET
  `verifyUnsubscribeToken` via `@web/lib/emails/unsubscribe-token` ; construire
  une URL pour `("t1","Bob+x@acme.com")`, parser `tenant`/`email`/`token`,
  asserter `verifyUnsubscribeToken(tenant, email, token) === true` ; ajouter un cas
  email avec `+`/unicode (parite unsubscribe-token.test.ts:82).
- **Refs** : R3, R7, R11, AC2.

## T6. Verif env + non-regression Inngest/route
- **Action** : confirmer que `AUTH_SECRET` et `NEXT_PUBLIC_APP_URL` sont presents
  dans l'env du process worker (infra) ; confirmer qu'aucun fichier du path Inngest
  ni `unsubscribe/route.ts` n'a ete touche.
- **Verify** : `git diff --name-only` ne liste QUE
  `app/apps/worker/src/services/emailengine.ts`,
  `app/apps/worker/src/services/unsubscribe.ts`,
  `app/apps/worker/src/workers/send.worker.ts`,
  `app/apps/worker/vitest.config.ts`, et les 3 fichiers de test (R9 respecte).
- **Test** : `app/apps/web/src/__tests__/email-send-worker.unsub-header.regression.test.ts`
  (leger) — asserter par grep/string que `email-send-worker.ts` contient toujours
  les 2 headers One-Click aux sites `:464-467`/`:788-791` (garde anti-regression de
  parite). Alternative acceptee : assertion dans le test existant
  `email-send-worker.*.test.ts` si plus simple.
- **Refs** : R8, R9.

## T7. Run global + DoD
- **Action** : lancer les tests worker et le typecheck des deux packages.
- **Verify** :
  - `pnpm --filter @leadsens/worker test` → T1/T4/T5 verts (workers.test.ts peut
    rester rouge pour cause ioredis pre-existante — documenter, hors scope).
  - `pnpm --filter @leadsens/worker tsc` vert ; `pnpm --filter @leadsens/web tsc`
    vert.
- **Test** : aggregation des tests ci-dessus ; aucun nouveau test.
- **Refs** : tous.

## Ordre d'execution
- T0 (audit) → T1 (emailengine) → T2 (module unsub) → T3 (vitest alias, debloque
  T5) → T4 (send.worker, depend de T1+T2) → T5 (depend de T2+T3) → T6 (regression)
  → T7 (run final).
- T1 et T2 sont independants et parallelisables. T3 doit preceder T5. T4 depend de
  T1 et T2.

## Estimation effort
- T0 : 0.5 h · T1 : 1 h · T2 : 0.25 h · T3 : 0.25 h · T4 : 1.5 h · T5 : 1 h ·
  T6 : 1 h · T7 : 0.5 h. **Total ~6 h (~1 jour).**
