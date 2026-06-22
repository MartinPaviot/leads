# P0-7 — List-Unsubscribe RFC-8058 (One-Click) sur le path d'envoi worker BullMQ

## Note importante (verite du code, ancree file:line — verifiee le 2026-06-21)

Deux paths d'envoi coexistent et divergent sur la conformite RFC-8058 :

- **Path Inngest (web)** — `app/apps/web/src/inngest/email-send-worker.ts`. Les
  DEUX sites d'envoi via Resend emettent deja les headers One-Click :
  - batch send : `:464-467` → `headers: { "List-Unsubscribe": "<${unsubUrl}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }`.
  - single send (`step.run("send")`) : `:788-791` → idem.
  - L'URL est construite par `buildUnsubscribeUrl(appUrl, email.tenantId, email.toAddress)`
    (`:439`, `:765`) depuis `@/lib/emails/unsubscribe-token`.
  - **CONCLUSION : path Inngest = conforme, NE PAS retoucher.**

- **Path worker BullMQ** — `app/apps/worker/src/workers/send.worker.ts`. L'appel
  `sendEmail(...)` `:85-92` ne passe **aucun** header `List-Unsubscribe`. La seule
  trace d'unsubscribe est un footer HTML `mailto:` `:80-83`
  (`mailto:${mailbox.emailAddress}?subject=unsubscribe`). **Ce path n'est PAS
  conforme One-Click** → un mail envoye via BullMQ peut bruler la reputation
  domaine (Gmail/Yahoo bulk-sender requirements). C'est le gap reel.

- **Service EmailEngine** — `app/apps/worker/src/services/emailengine.ts`.
  `sendEmail(accountId, email)` `:71-100` n'accepte aujourd'hui qu'un sous-ensemble
  de champs (`from/to/subject/html/text/inReplyTo/references`) et ne construit le
  bloc `body.headers` `:90-95` QUE pour `In-Reply-To`/`References`. Aucun moyen de
  passer un header arbitraire. **Il faut etendre sa signature.**

- **Cross-package (point dur)** — le worker (`app/apps/worker`) est un package
  separe (`@leadsens/worker`, package.json). Le builder de token vit cote web :
  `app/apps/web/src/lib/emails/unsubscribe-token.ts` (`buildUnsubscribeUrl`,
  `generateUnsubscribeToken`, `verifyUnsubscribeToken`, HMAC SHA-256 sur
  `AUTH_SECRET`, deterministe, `:11-44`). **Le grounding pose le choix
  dupliquer vs partager. Tranche apres lecture :** le worker importe DEJA du web
  via l'alias tsconfig `@web/*` → `../web/src/*` (worker/tsconfig.json:11) et
  `app/apps/worker/src/db.ts:10` importe `@web/db/schema` au runtime (tsx 4.x
  honore les `paths` du tsconfig). **Donc on REUTILISE le builder web via un
  import `@web/lib/emails/unsubscribe-token` — pas de duplication.** La duplication
  est rejetee : deux copies du HMAC = risque de divergence de token → liens
  unsubscribe non verifiables (403 cote `/api/unsubscribe`).

- **Route One-Click cote serveur** — `app/apps/web/src/app/api/unsubscribe/route.ts`
  expose `GET` (`:139`) et `POST` (`:155`, RFC-8058 One-Click, accepte
  `List-Unsubscribe=One-Click` + params dans l'URL `:166-169`). Elle verifie le
  token (`verifyToken` `:90`, `:199`), insere l'opt-out `onConflictDoNothing`
  (`:115-122`, `:219-226`) et met en pause les enrollments. **Cote serveur =
  pret, ne pas retoucher.** Le worker doit produire une URL que cette route
  accepte (meme builder, meme secret).

- **Contradiction grounding/code** : le grounding dit que le worker importe via
  `../db.js`. C'est l'import RELATIF du fichier `db.ts` LOCAL au worker
  (`send.worker.ts:7` → `from "../db.js"`) ; mais `db.ts:10` lui-meme importe
  `@web/db/schema`. Le pattern cross-package web→worker est **deja en place**, le
  grounding le sous-estime. Pas de nouvelle dependance a inventer.

## Scope

**On construit :**
- Extension de `sendEmail` (`emailengine.ts`) pour accepter des headers
  arbitraires et les merger au bloc `body.headers` existant.
- Generation de l'`unsubUrl` cote worker via le builder web partage
  (`@web/lib/emails/unsubscribe-token`), avec resolution de `appUrl` depuis l'env.
- Injection des headers `List-Unsubscribe` + `List-Unsubscribe-Post` One-Click
  dans l'appel `sendEmail` de `send.worker.ts`.
- Tests unitaires worker (merge de headers) + test cross-runtime de coherence du
  token (le token genere cote worker se verifie par la route web).

**On ne reconstruit PAS :**
- Le builder/verifier de token (`unsubscribe-token.ts`) — existe, reutilise.
- La route `/api/unsubscribe` GET/POST One-Click — existe, conforme.
- Le path Inngest (`email-send-worker.ts`) — deja conforme.
- Le footer HTML mailto (`send.worker.ts:80`) — on le conserve (CAN-SPAM
  belt-and-suspenders), on ajoute le header par-dessus.

## Exigences (EARS)

- **R1** — WHEN le worker BullMQ envoie un email via `sendEmail`
  (`send.worker.ts:85`), THE SYSTEM SHALL inclure le header
  `List-Unsubscribe: <unsubUrl>` ou `unsubUrl` pointe vers `/api/unsubscribe`
  avec `email`, `tenant`, `token` valides.

- **R2** — WHEN le worker BullMQ envoie un email, THE SYSTEM SHALL inclure le
  header `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC-8058), a
  parite avec `email-send-worker.ts:466`/`:790`.

- **R3** — THE SYSTEM SHALL construire `unsubUrl` via `buildUnsubscribeUrl`
  (`unsubscribe-token.ts:36-44`) avec le MEME `AUTH_SECRET` que la route web, de
  sorte que `verifyUnsubscribeToken` (`:19-33`) renvoie `true` cote serveur.

- **R4** — THE SYSTEM SHALL deriver `appUrl` depuis
  `process.env.NEXT_PUBLIC_APP_URL` avec fallback `https://app.elevay.com`,
  identique au path Inngest (`email-send-worker.ts:437-438`, `:763-764`).

- **R5** — WHEN `sendEmail` recoit un champ `headers` (nouveau parametre), THE
  SYSTEM SHALL merger ces headers avec les headers `In-Reply-To`/`References`
  existants (`emailengine.ts:90-95`) sans en perdre.

- **R6** — IF un email worker est aussi une reponse (`email.inReplyTo` present,
  `send.worker.ts:91`), THEN THE SYSTEM SHALL emettre simultanement
  `In-Reply-To`, `References`, `List-Unsubscribe` et `List-Unsubscribe-Post`
  dans le meme bloc `body.headers`.

- **R7** — WHILE l'adresse destinataire contient des caracteres a encoder
  (`+`, accents), THE SYSTEM SHALL produire une URL ou `email` est
  `encodeURIComponent`-encode (deja garanti par `buildUnsubscribeUrl:43`) et qui
  reste verifiable par la route.

- **R8** — IF `AUTH_SECRET` est absent du runtime worker, THEN THE SYSTEM SHALL
  faire echouer l'envoi de maniere explicite (l'erreur `generateUnsubscribeToken`
  `:13` remonte) plutot que d'envoyer un mail sans header conforme — fail-closed
  sur la conformite (voir design).

- **R9** — THE SYSTEM SHALL NOT modifier le path Inngest
  (`email-send-worker.ts`), la route `/api/unsubscribe/route.ts`, ni le builder
  `unsubscribe-token.ts`.

- **R10** — THE SYSTEM SHALL conserver le footer HTML mailto existant
  (`send.worker.ts:80-83`) inchange.

- **R11** — THE SYSTEM SHALL NOT dupliquer la logique HMAC du token cote worker
  (un seul builder de verite : `unsubscribe-token.ts`).

## Criteres d'acceptation

- **AC1** — GIVEN un job d'envoi BullMQ valide WHEN `send.worker.ts` appelle
  `sendEmail` THEN le `body` POST vers `/v1/account/{id}/submit` contient
  `headers["List-Unsubscribe"] === "<" + unsubUrl + ">"` AND
  `headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click"`.
  (Path Inngest equivalent DEJA IMPLEMENTE dans `email-send-worker.ts:464-467` ✅.)

- **AC2** — GIVEN l'`unsubUrl` genere par le worker WHEN on extrait `tenant`,
  `email`, `token` de l'URL et qu'on appelle `verifyUnsubscribeToken(tenant,
  email, token)` THEN le resultat est `true` (coherence cross-runtime
  worker↔web). (Builder + verifier DEJA IMPLEMENTES dans
  `unsubscribe-token.ts:11-44` ✅, on teste la reutilisation.)

- **AC3** — GIVEN un email worker avec `inReplyTo` defini WHEN `sendEmail` est
  appele avec `headers: { "List-Unsubscribe": ..., "List-Unsubscribe-Post": ... }`
  THEN `body.headers` contient les 4 cles (`In-Reply-To`, `References`,
  `List-Unsubscribe`, `List-Unsubscribe-Post`).

- **AC4** — GIVEN un email worker SANS `inReplyTo` WHEN `sendEmail` est appele
  avec `headers` THEN `body.headers` existe et contient les 2 cles
  `List-Unsubscribe*` (et pas de cles `In-Reply-To`/`References`).

- **AC5** — GIVEN aucun `headers` passe a `sendEmail` (compat ascendante) WHEN
  `email.inReplyTo` est absent THEN `body.headers` est absent
  (comportement actuel `emailengine.ts:90-95` preserve).

- **AC6** — GIVEN un POST One-Click reel vers `/api/unsubscribe?email=&tenant=&token=`
  avec le token genere worker WHEN la route traite la requete THEN reponse
  `{ success: true }` et insertion `emailOptouts`. (Route DEJA IMPLEMENTEE
  `route.ts:155-237` ✅.)

## Edge cases

- **Token cross-runtime** : tsx (runtime worker) doit charger
  `@web/lib/emails/unsubscribe-token` ; verifier que tsx 4.x honore le `paths`
  tsconfig (deja le cas pour `@web/db/schema`, db.ts:10). Test de fumee.
- **`AUTH_SECRET` divergent** entre process worker et process web → token non
  verifiable (403). Mitigation : meme `.env`/secret en prod ; R8 fail-closed si
  absent ; documenter dans tasks (verif env).
- **Vitest worker ne resout pas `@web/*`** : `vitest.config.ts` (worker) n'a
  aucun plugin tsconfig-paths ; les tests actuels (`workers.test.ts`) **echouent
  deja** (mock ioredis casse en vitest 4, `queues/index.ts:4`). Donc : tester les
  fonctions PURES (merge headers de `emailengine`, builder importe) sans charger
  la chaine `send.worker → queues → ioredis`. Ajouter l'alias `@web` au
  vitest.config worker si on veut importer le builder web en test.
- **Email destinataire avec `+`/unicode** → couvert par `encodeURIComponent`
  (`unsubscribe-token.ts:43`) ; test dedie (parite avec
  unsubscribe-token.test.ts:82).
- **`mailbox.emailAddress` null** (footer `:80`) : hors scope (comportement
  existant), mais le header n'utilise PAS `mailbox.emailAddress` — il utilise
  `email.tenantId`/`email.toAddress`, donc independant.
- **Idempotence opt-out** : POST One-Click rejoue → `onConflictDoNothing`
  (`route.ts:226`) ✅ existant.
- **Email deja opt-out** : le worker skip en amont (`send.worker.ts:33-39`),
  donc le header n'est jamais emis pour un opt-out — coherent.
- **Header injection** : `unsubUrl` est une URL HMAC-signee sans CRLF ;
  `email.toAddress` encode. Pas de risque d'injection d'en-tete.
- **`html.includes("unsubscribe")`** (`send.worker.ts:81`) reste vrai/faux
  independamment du header → footer logique inchangee.
- **Compat ascendante `sendEmail`** : appelants existants (warmup.worker,
  reply.worker s'ils l'utilisent) ne passent pas `headers` → param optionnel.

## Hors scope

- Reecriture du path Inngest ou unification des deux paths d'envoi (Inngest vs
  BullMQ) — backlog separe.
- Ajout d'un header `List-Unsubscribe` au warmup (`warmup.worker.ts`) — les mails
  de warmup ne sont pas du cold-outbound utilisateur ; a tracker separement.
- Fix du mock ioredis casse de `workers.test.ts` (pre-existant, non cause par
  cette feature) — peut etre fait en passant mais pas un livrable P0-7.
- Migration du footer mailto vers footer HTTPS — conserve tel quel (R10).
