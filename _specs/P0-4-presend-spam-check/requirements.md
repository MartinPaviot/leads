# P0-4 — Câbler le pre-send spam-check (`checkSpamSignals`)

## Note importante (vérité du code au 2026-06-21)

Audit ligne-par-ligne effectué sur le code live. Le grounding est **confirmé** :

- `checkSpamSignals(subject, body): SpamCheckResult` existe et est complet à
  `app/apps/web/src/lib/emails/email-spam-check.ts:103-216`. Checker pur, pondéré,
  cappé à 100, sévérité bucketée `clean | low | medium | high` (`email-spam-check.ts:36-42`,
  `:211-215`). Poids confirmés : `subject-all-caps` 20 (`:120`), `subject-excessive-punct`
  15 (`:128`), `too-short` 10 (`:138`), `missing-unsubscribe` 20 (`:207`), etc.
- Il est importé **uniquement par son test** `app/apps/web/src/__tests__/email-spam-check.test.ts:2`
  (grep exhaustif : 2 fichiers seulement, le module + son test). **Code mort en prod.**
- Le bridge send-time `app/apps/web/src/inngest/sequence-draft-to-outbound.ts` n'a **aucun
  spam-check** — seulement le citation gate (`:127-172`). Le pattern recall y est :
  `decideCitationGate(...)` → `canTransition(status,"recall")` → si `recall.allowed`,
  `db.update(...).set({ status: recall.nextStatus, reviewReason, reviewedAt, scheduledSendAt: null })`
  (`sequence-draft-to-outbound.ts:145-161`). C'est le clone direct à imiter.
- La transition `recall` n'est autorisée **que depuis `approved`** → `pending_approval`
  (`app/apps/web/src/lib/sequence-drafts/state-machine.ts:117-130`). Le draft arrive ici en
  `approved` (decideDispatch refuse sinon, `:114-125`), donc la garde tient.
- Les drafts sont insérés via `buildDraftRow(...)` (`app/apps/web/src/lib/sequence-drafts/router.ts:75-90`),
  appelé dans `app/apps/web/src/inngest/sequence-draft-router.ts:252-272`. C'est le point
  d'attache génération-time.
- La review UI affiche "Why this draft?" à `app/apps/web/src/components/sequence-draft-preview.tsx:339-377`.
  Le type `DraftListItem` (`sequence-draft-list.tsx:22-39`) porte déjà `reviewReason` mais
  **aucun champ spam**.
- Le contexte review vient de `app/apps/web/src/app/api/sequences/drafts/[id]/context/route.ts`,
  qui re-sérialise `draft` (`:127-133`) mais **n'expose aucun champ spam**.

**Contradiction avec le grounding à signaler** : le grounding suppose qu'on peut "joindre
le score au draft" à la génération sans changer le schéma. **Faux** : `sequenceDrafts`
(`app/apps/web/src/db/schema/outbound.ts:128-195`) n'a **aucune colonne spam**
(`spamScore`, `spamSeverity`, `spamWarnings`). Persister le score impose un changement de
schéma (3 colonnes nullable). Sans ça, le score génération-time est perdu et la review UI
devrait recalculer à la volée. → On ajoute les 3 colonnes (voir design.md, Data model).

## Scope

On construit :
1. Le câblage send-time de `checkSpamSignals` dans `sequence-draft-to-outbound.ts` comme
   gate **fail-soft** (warn, pas fail-closed) : `severity === "high"` → recall vers la
   review via le pattern existant ; sinon, on laisse passer.
2. Le calcul génération-time du score et sa **persistance** sur le draft (3 nouvelles
   colonnes), via `buildDraftRow`.
3. L'affichage des warnings actionnables dans la review UI (`sequence-draft-preview.tsx`),
   alimenté par le contexte route.
4. La décision pure `decideSpamGate(result)` (helper testable, clone de `decideCitationGate`),
   pour ne pas mettre de policy dans l'Inngest fn.

On ne reconstruit PAS :
- `checkSpamSignals` ni ses heuristiques — déjà complet et testé (`email-spam-check.ts:103-216`).
- La state-machine recall — déjà présente (`state-machine.ts:117-130`).
- Le citation gate — intact, on ajoute le spam gate à côté.
- Le mécanisme d'optimistic-lock / version — non touché.

## Exigences (EARS)

**Gate send-time (fail-soft)**

- **R1** — WHEN le bridge `sequence-draft-to-outbound` traite un draft email
  (`decision.via === "email"`, après le citation gate `sequence-draft-to-outbound.ts:172`),
  THE SYSTEM SHALL exécuter `checkSpamSignals(draft.subject, draft.bodyText)` avant l'insert
  `outboundEmails`.
- **R2** — IF `checkSpamSignals(...).severity === "high"` AND
  `canTransition(draft.status,"recall").allowed === true`, THEN THE SYSTEM SHALL passer le
  draft à `pending_approval` avec `reviewReason` = message spam agrégé, `reviewedAt = now`,
  `scheduledSendAt = null`, sans insérer dans `outboundEmails`, en imitant
  `sequence-draft-to-outbound.ts:147-161`.
- **R3** — WHILE `severity` ∈ {`clean`, `low`, `medium`}, THE SYSTEM SHALL **laisser passer**
  l'envoi (fail-soft) et NE PAS recall — contrairement au citation gate qui est fail-closed
  (`citations.ts:49-55`).
- **R4** — WHEN le spam gate recall un draft, THE SYSTEM SHALL logger
  `logger.warn("sequence-draft-to-outbound.spam_recall", { draftId, spamScore, codes })` et
  retourner `{ skipped: "spam_high", draftId, spamScore }`, en miroir de
  `sequence-draft-to-outbound.ts:162-170`.
- **R5** — IF `severity === "high"` mais `canTransition(...,"recall").allowed === false`
  (le draft n'est plus `approved` — course avec un autre handler), THEN THE SYSTEM SHALL ne
  rien muter et retourner `{ skipped: "spam_high_not_recallable", draftId }` (idempotence).
- **R6** — THE SYSTEM SHALL appliquer le spam gate **uniquement** au chemin email ; le chemin
  `phone_task` (`sequence-draft-to-outbound.ts:179-255`) SHALL NOT être affecté (les
  heuristiques email — liens, unsubscribe — n'ont pas de sens pour un script d'appel).

**Persistance génération-time**

- **R7** — WHEN un draft est construit via `buildDraftRow(...)` (`router.ts:75-90`),
  THE SYSTEM SHALL calculer `checkSpamSignals(subject, bodyText)` et inclure `spamScore`,
  `spamSeverity`, `spamWarnings` (jsonb) dans la row insérée.
- **R8** — THE SYSTEM SHALL stocker `spamScore` (integer 0-100), `spamSeverity`
  (text `clean|low|medium|high`), `spamWarnings` (jsonb array de `SpamWarning`) sur
  `sequenceDrafts`, nullable, default null/`[]`.
- **R9** — WHEN un draft est édité par le founder via `/api/sequences/drafts/[id]/edit`
  (subject/bodyText changent), THE SYSTEM SHALL recalculer et re-persister `spamScore`,
  `spamSeverity`, `spamWarnings` dans la même transaction d'update.

**Affichage review**

- **R10** — WHEN la review UI charge un draft, THE SYSTEM SHALL exposer `spamScore`,
  `spamSeverity`, `spamWarnings` via `/api/sequences/drafts/[id]/context/route.ts` (en plus
  des champs existants `:127-133`).
- **R11** — WHERE `spamSeverity` ∈ {`medium`, `high`}, THE SYSTEM SHALL afficher une section
  "Deliverability check" dans `sequence-draft-preview.tsx` (après "Why this draft?",
  `:377`) listant chaque `warning.message`, sans emoji, avec une couleur dérivée de la
  sévérité (`var(--color-warning)` pour medium, `var(--color-error)` pour high).
- **R12** — WHERE `spamSeverity` ∈ {`clean`, `low`} OR `spamWarnings` est vide/null,
  THE SYSTEM SHALL ne PAS rendre la section "Deliverability check" (zéro bruit visuel).

**Tenant-scoping & robustesse**

- **R13** — THE SYSTEM SHALL conserver le tenant-scoping existant : aucune lecture/écriture
  spam ne contourne le `eq(sequenceDrafts.tenantId, tenantId)` déjà en place
  (`sequence-draft-to-outbound.ts:88-93`, context route `:44-50`).
- **R14** — IF `checkSpamSignals` reçoit subject/body null/undefined, THEN THE SYSTEM SHALL
  ne pas throw (déjà géré `email-spam-check.ts:108-109`, garde `("" )`) ; le caller SHALL
  passer `draft.bodyText ?? ""`.

## Critères d'acceptation

- **AC1** — GIVEN un draft `approved` email avec subject `"URGENT FREE MONEY!!!"` et body
  spammy (severity `high`), WHEN `sequence-draft-to-outbound` le traite, THEN aucune row
  `outboundEmails` n'est insérée AND le draft repasse `pending_approval` avec `reviewReason`
  contenant les codes spam AND la fn retourne `{ skipped: "spam_high" }`.
- **AC2** — GIVEN un draft `approved` email propre (`CLEAN_BODY`, severity `clean`), WHEN
  traité, THEN il est inséré dans `outboundEmails` (status `queued`) AND le draft passe `sent`
  — comportement inchangé vs aujourd'hui.
- **AC3** — GIVEN un draft `approved` avec severity `medium` (ex. 1 ALL-CAPS subject + body
  ok = score 20), WHEN traité, THEN il **passe** (fail-soft) — pas de recall.
- **AC4** — GIVEN un draft généré via le router, WHEN inséré, THEN `spamScore`/`spamSeverity`/
  `spamWarnings` sont peuplés et cohérents avec `checkSpamSignals(subject, bodyText)`.
- **AC5** — GIVEN un draft édité (subject passe de propre à `"WINNER!!!"`), WHEN sauvegardé,
  THEN `spamSeverity` repasse à `high` sur la row.
- **AC6** — GIVEN un draft severity `high` en review, WHEN le founder ouvre le preview, THEN
  la section "Deliverability check" liste chaque message en rouge ; GIVEN severity `clean`,
  THEN aucune section n'est rendue.
- **AC7** — GIVEN le citation gate fail-closed existant, WHEN un draft a une citation morte
  ET un spam high, THEN le citation gate s'applique en premier (recall pour citation) — le
  spam gate n'est atteint que si les citations passent. **DÉJÀ ORDONNÉ** par l'early-return
  du citation gate dans `sequence-draft-to-outbound.ts:166-171` ✅.

## Edge cases

- **null/empty** : `bodyText` peut être vide ; passer `?? ""`, `checkSpamSignals` cappe à
  score 0 (`email-spam-check.test.ts:160-163`). Pas de section UI.
- **soft-delete** : la review UI ne charge que des drafts non-terminaux ; pas d'interaction
  spam avec `deletedAt` (les drafts n'ont pas de soft-delete, `outbound.ts:128-195`).
- **concurrence / idempotence** : si le draft n'est plus `approved` au moment du recall
  (autre worker l'a déjà bougé), `canTransition(...,"recall").allowed === false` → no-op
  (R5). Le `messageId = draft:${draftId}` dedup (`sequence-draft-to-outbound.ts:313`) couvre
  déjà le double-insert si le gate passe.
- **cross-runtime** : `checkSpamSignals` est pur, pas d'I/O → tourne identiquement dans
  l'Inngest worker (Node) et dans le client React (le preview pourrait recalculer si le
  champ persisté manque, mais on persiste donc on lit la valeur).
- **timeouts** : aucun — `checkSpamSignals` est synchrone, pas de réseau. Ne PAS le wrapper
  dans un `step.run` (inutile, c'est CPU-pur ; le wrap n'apporte que de l'overhead).
- **retries Inngest** : la fn a `retries: 2` (`sequence-draft-to-outbound.ts:60`). Le spam
  check étant déterministe et le recall idempotent (R5), un retry après recall partiel
  re-tombe en `spam_high_not_recallable` → safe.
- **draft généré avant migration** : colonnes spam null → la review UI tombe sous R12 (pas
  de section). Le send-time gate **recalcule** toujours (R1) donc ne dépend pas de la
  colonne persistée — la persistance sert seulement l'affichage et l'analytics.
- **HTML vs text** : le checker tourne sur `bodyText` (le contenu plain envoyé/édité) ;
  `bodyHtml === bodyText` aujourd'hui (`sequence-draft-router.ts:259-260`).
- **severity exactement à la frontière** : score 50 = `high` (`email-spam-check.ts:213`,
  `< 50 ? medium : high`) ⇒ 50 est `high`. Le test doit couvrir le seuil 49/50.

## Hors scope

- DNS/SPF/DKIM/DMARC auth (P1-7) — orthogonal à l'analyse de contenu.
- Suppression-list / hard-bounce guard (autre item backlog, `enrollment-eligibility.ts`).
- Spam scoring bayésien / SpamAssassin — `checkSpamSignals` reste heuristique structurel
  par design (`email-spam-check.ts:5-8`).
- Câbler le spam check sur d'autres producteurs d'`outboundEmails`
  (`auto-pipeline-email-handler`) — ce spec couvre le chemin sequence-draft. À tracker
  séparément si un second producteur émerge.
- Auto-fix / réécriture LLM du draft spammy — on recall vers l'humain, on ne corrige pas.
