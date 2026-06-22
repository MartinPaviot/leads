# P0-1 — Autopilot enrollment : garde anti-ICP + gate d'approbation HITL

## Note importante (verite du code, ancree file:line)

Feature **deja construite et committee** sur `feat/autopilot-icp-guard`,
commit `34cce1f7` ("fix(sequences): close anti-ICP + HITL bypass in autopilot
enrollment"). Cette spec documente le comportement **AS-BUILT**.

Ce qui EXISTAIT deja avant le fix (read-only, non reconstruit) :

- `app/apps/web/src/lib/sequences/enrollment-eligibility.ts:37-46` —
  `checkContactEligibility({ email, deletedAt, companyExcludedReason })`
  fonction pure, source unique de verite : ordre `deleted` > `no_email` >
  `excluded_company`. Deja consommee par `/enroll` et `signal-to-sequence`.
- `app/apps/web/src/lib/guardrails/approval-mode.ts:148-205` —
  `GUARDED_ACTION_METADATA["sequence-enrollment"]` = `{ outbound: true,
  confirm: "always" }` (ligne 155) ; `enforceAgentApprovalMode` delegue a
  `decideAction` et ne renvoie JAMAIS `allowed:true` pour `sequence-enrollment`
  (outbound + confirm:always → `confirm`/`queue` sous tous les modes).
- `app/apps/web/src/lib/agents/agent-actions.ts:51-88` — `recordAgentAction`
  avec `awaitingApproval:true` insere une ligne `agentActions` `status:'scheduled'`
  SANS `scheduledExecutionAt` → apparait dans la lane "Needs you".
- `app/apps/web/src/lib/agents/action-executors.ts:197-247` — executeur
  `case "sequence-enrollment"` qui, a l'approbation, re-valide tenant +
  `isNull(deletedAt)` (ligne 218), est idempotent (ligne 224-229) et insere
  `status:"active"`. C'est la frontiere de confiance.
- `app/apps/web/src/inngest/signal-to-sequence.ts:80-262` — **patron miroir**
  deja correct : check anti-ICP (`isCompanyEligible`, l.97) + gate
  `enforceAgentApprovalMode` (l.231) + defer via `recordAgentAction` (l.240).
- `app/apps/web/src/app/api/sequences/[id]/enroll/route.ts` — chemin manuel,
  **deja correct**, NON modifie par `34cce1f7` (absent du diff). Reference de parite.

Le GAP REEL (corrige par ce commit) : l'autopilot d'enrollment
auto-selectionnait des contacts par score et inserait des `sequenceEnrollments`
**ACTIFS** sans (a) check anti-ICP `excluded_reason`, ni (b) gate d'approbation,
sur **3 surfaces** :

1. `app/apps/web/src/app/api/sequences/[id]/autopilot/route.ts` (route POST).
2. `app/apps/web/src/lib/chat/tools/action.ts` tool `runSequenceAutopilot`
   (l.667-807).
3. `app/apps/web/src/lib/chat/tools/action.ts` tool `enrollInSequence`
   (l.575-665) — ne manquait que le check anti-ICP (pas de gate : l'utilisateur
   passe des `contactIds` explicites, mais une company flaggee doit quand meme
   etre rejetee, parite `/enroll`).

Le grounding est **conforme au code** sur chaque point. Une precision : sur la
surface `enrollInSequence` le fix ajoute uniquement le filtre d'eligibilite (pas
de gate de defer), car cette surface enrolle des `contactIds` fournis a la main —
le check anti-ICP est la seule parite manquante vs `/enroll`.

## Scope

Construit (AS-BUILT, deja livre) :

- Filtre d'eligibilite anti-ICP via `checkContactEligibility` sur les 3 surfaces
  (leftJoin `companies` pour ramener `excluded_reason`).
- Gate HITL `enforceAgentApprovalMode` + defer via `recordAgentAction` sur les 2
  surfaces "auto-select" (route autopilot + `runSequenceAutopilot`).
- Test de regression `app/apps/web/src/__tests__/autopilot-api.test.ts` (4 tests).

NON reconstruit (read-only, deja en place) :

- `checkContactEligibility` (helper pur).
- `enforceAgentApprovalMode` / `GUARDED_ACTION_METADATA` / `decideAction`.
- `recordAgentAction` / lane "Needs you" / dispatcher.
- `action-executors.ts` executeur `sequence-enrollment`.
- `signal-to-sequence.ts` (miroir) et `/enroll` (parite).

## Exigences (EARS)

**Anti-ICP (eligibilite)**

- **R1** — WHEN l'autopilot construit son lot de candidats, THE SYSTEM SHALL
  joindre `companies` en `leftJoin` pour ramener `excluded_reason` et passer
  chaque candidat dans `checkContactEligibility`.
  `route.ts:63-102`, `action.ts:703-741`.
- **R2** — IF un contact a une company avec `excluded_reason` non nul, THEN THE
  SYSTEM SHALL l'exclure du lot (compte en `skipped`) et ne jamais l'enroler.
  `enrollment-eligibility.ts:42-44`, `route.ts:97-100`.
- **R3** — IF un contact est soft-supprime (`deletedAt` non nul) ou sans email,
  THEN THE SYSTEM SHALL l'exclure via le meme helper (ordre `deleted` >
  `no_email` > `excluded_company`). `enrollment-eligibility.ts:40-44`.
- **R4** — WHEN un `contactId` est passe explicitement a `enrollInSequence`, THE
  SYSTEM SHALL appliquer le meme `checkContactEligibility` (parite `/enroll`), de
  sorte qu'une company flaggee n'est jamais enrolee meme par id explicite.
  `action.ts:609-635`.

**Gate HITL (approbation)**

- **R5** — WHEN le lot eligible n'est pas vide sur une surface auto-select
  (route autopilot, `runSequenceAutopilot`), THE SYSTEM SHALL appeler
  `enforceAgentApprovalMode({ action: "sequence-enrollment", confidence: 0.9 })`
  AVANT toute insertion. `route.ts:121-127`, `action.ts:751-753`.
- **R6** — WHILE `sequence-enrollment` est `outbound:true` + `confirm:"always"`,
  THE SYSTEM SHALL ne jamais recevoir `allowed:true` du gate, donc ne jamais
  enroler inline sous aucun mode d'approbation.
  `approval-mode.ts:155`, `approval-mode.ts:195-204`.
- **R7** — IF le gate renvoie `allowed:false`, THEN THE SYSTEM SHALL enregistrer
  UNE action `sequence-enrollment` `awaitingApproval:true` portant `{ sequenceId,
  sequenceName, contactIds (lot eligible), queueAs, reason }` et retourner
  `deferred:true` SANS aucun insert. `route.ts:129-152`, `action.ts:755-777`.
- **R8** — WHEN le founder approuve l'action en attente, THE SYSTEM SHALL enroler
  via l'executeur `action-executors.ts` `case "sequence-enrollment"` qui
  re-valide tenant + soft-delete et est idempotent — le code autopilot ne
  reimplemente jamais l'insertion d'enrollment a l'approbation.
  `action-executors.ts:203-238`.

**Garde de permission + tenant-scoping**

- **R9** — WHEN la route POST `/autopilot` est appelee, THE SYSTEM SHALL exiger
  l'authentification puis la permission `sequences:execute` avant tout travail.
  `route.ts:15-22`.
- **R10** — THE SYSTEM SHALL scoper toute lecture de candidats au `tenantId` du
  contexte d'auth. `route.ts:74`, `action.ts:714`.

**Reporting**

- **R11** — THE SYSTEM SHALL retourner un payload coherent `{ success/deferred,
  queued, enrolled, skipped, eligible|eligibleConsidered, reason? }` reflectant le
  lot effectivement defere ou enrole. `route.ts:143-151`, `action.ts:769-776`.

**Non-goals**

- **R12** — THE SYSTEM SHALL NOT enroler inline sur les surfaces auto-select tant
  que le gate ne renvoie pas `allowed:true` (inatteignable aujourd'hui).
- **R13** — THE SYSTEM SHALL NOT modifier `/enroll`, `signal-to-sequence`,
  `checkContactEligibility`, `enforceAgentApprovalMode` ni l'executeur — tous
  deja corrects.

## Criteres d'acceptation

**AC1 — anti-ICP route** — GIVEN un candidat dont la company porte
`excluded_reason:"competitor"`, WHEN la route autopilot tourne, THEN il est en
`skipped` et absent de `contactIds`. DEJA IMPLEMENTE dans `route.ts:92-100` ✅
(test `autopilot-api.test.ts:123-152`).

**AC2 — defer, zero insert** — GIVEN un lot eligible non vide et `mode:
review-each`, WHEN la route tourne, THEN `recordAgentAction(awaitingApproval:true,
contactIds:["c-ok"])` est appele UNE fois ET aucun `db.insert` n'a lieu ET la
reponse est `{ deferred:true, queued:1, enrolled:0 }`. DEJA IMPLEMENTE dans
`route.ts:129-152` ✅ (test `autopilot-api.test.ts:140-151`).

**AC3 — chemin execute (inatteignable)** — GIVEN un gate force `allowed:true`,
WHEN la route tourne, THEN SEUL le lot eligible est insere (1 insert pour 1
eligible + 1 exclu) ET `recordAgentAction` n'est PAS appele. DEJA IMPLEMENTE dans
`route.ts:154-181` ✅ (test `autopilot-api.test.ts:154-176`).

**AC4 — parite enrollInSequence** — GIVEN un `contactId` explicite dont la
company est flaggee, WHEN `enrollInSequence` tourne, THEN le contact est `skipped`
et non enrole. DEJA IMPLEMENTE dans `action.ts:609-635` ✅.

**AC5 — gate runSequenceAutopilot** — GIVEN un lot eligible, WHEN
`runSequenceAutopilot` tourne, THEN il defere via `recordAgentAction` et retourne
`{ deferred:true }` sans insert. DEJA IMPLEMENTE dans `action.ts:755-777` ✅.

**AC6 — 401 / 404 / no-steps** — GIVEN non authentifie → 401 (`route.ts:16-18`,
test l.110-114) ; sequence introuvable → 404 (`route.ts:34-36`, test l.116-121) ;
sequence sans steps → 400 (`route.ts:43-45`). DEJA IMPLEMENTE ✅.

## Edge cases

- **company null (leftJoin)** — un contact sans `companyId` a
  `companyExcludedReason = null` → eligible. `leftJoin` couvre le cas, pas
  d'exclusion fantome. `route.ts:71`.
- **score NULL** — `gte(score, minScore)` exclut les `NULL`; tri
  `DESC NULLS LAST`. `route.ts:76,80`.
- **soft-delete** — double couche : filtre SQL `isNull(deletedAt)` (l.77) ET
  helper `checkContactEligibility` (`enrollment-eligibility.ts:40`). L'executeur
  re-valide aussi a l'approbation (`action-executors.ts:218`).
- **deja enroles** — exclus via `enrolledIds` Set avant le filtre d'eligibilite,
  comptes en `skipped`. `route.ts:88-91`.
- **lot eligible vide** — retour anticipe `{ enrolled:0, queued:0 }` sans appel
  gate ni insert. `route.ts:104-112`, `action.ts:743-745`.
- **fetch x2** — `limit(maxEnroll * 2)` pour compenser deja-enroles/ineligibles
  avant cap a `maxEnroll`. `route.ts:81,87`.
- **cap maxEnroll** — `Math.min(maxEnroll ?? 20, 100)`. `route.ts:49`.
- **idempotence a l'approbation** — l'executeur skip un contact deja enrole (tout
  statut). `action-executors.ts:224-229`. (Note : la route ne re-check pas les
  doublons sur le chemin execute inline car ce chemin est inatteignable.)
- **cross-runtime** — route (Next runtime) et `runSequenceAutopilot` (chat tool)
  partagent le meme helper + gate ; miroir Inngest = `signal-to-sequence`.
- **defer = zero ecriture partielle** — gate appele AVANT la 1ere insertion ; un
  lot defere ne produit aucun enrollment. `route.ts:121-152`.
- **`getTenantSettings` null** — fallback `{ agentApprovalMode: "review-each" }`.
  `route.ts:122`, `action.ts:752`.

## Hors scope

- P0-2 (routage signal→sequence par `triggerSignalTypes`) — autre item, deja
  partiellement present dans `signal-to-sequence.ts:130-191`.
- UI de la lane "Needs you" / dispatcher — deja livres (WS-7, up-next-redesign).
- Tout changement a `/enroll`, `enforceAgentApprovalMode`, l'executeur.
