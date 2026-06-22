# Tasks — P0-1 Autopilot enrollment : garde anti-ICP + gate HITL

> AS-BUILT : les taches T1-T4 sont **DEJA livrees** sur `feat/autopilot-icp-guard`
> (`34cce1f7`). Conservees pour tracabilite ; chaque "Verify" est reproductible.

## T0. Audit lecture (read-only)

- **Action** : lire `enrollment-eligibility.ts:37-46`, `approval-mode.ts:148-205`,
  `action-executors.ts:197-247`, `signal-to-sequence.ts` (miroir), `/enroll` (parite).
- **Verify** : confirmer que `checkContactEligibility`, `enforceAgentApprovalMode`,
  `recordAgentAction`, l'executeur existent deja et sont corrects (read-only).
- **Test** : N/A.

## T1. Anti-ICP + gate dans la route POST `/autopilot`  [DEJA LIVRE]

- **Action** : `app/apps/web/src/app/api/sequences/[id]/autopilot/route.ts` —
  `leftJoin(companies)` + `checkContactEligibility` (l.63-102), puis
  `enforceAgentApprovalMode` + `recordAgentAction(awaitingApproval)` (l.121-152) ;
  chemin execute inline insere `toEnroll`, jamais `candidates` (l.154-181).
- **Verify** : `cd app/apps/web && pnpm vitest run src/__tests__/autopilot-api.test.ts`
  → 4 verts ; inspecter que `insertValues` n'est PAS appele sur le chemin defer.
- **Test** : `src/__tests__/autopilot-api.test.ts` — cas "skips anti-ICP-excluded
  contacts and DEFERS the eligible set" (l.123-152). (R1,R2,R5,R7,R9)

## T2. Anti-ICP + gate dans `runSequenceAutopilot`  [DEJA LIVRE]

- **Action** : `app/apps/web/src/lib/chat/tools/action.ts:667-807` — meme
  `leftJoin` + filtre eligibilite + gate/defer.
- **Verify** : `cd app/apps/web && pnpm tsc --noEmit` → 0 erreur ; lecture
  ciblee l.700-777 confirme `recordAgentAction` + `deferred:true`.
- **Test** : ajouter `src/__tests__/run-sequence-autopilot-tool.test.ts` —
  mock `db`/`enforceAgentApprovalMode`/`recordAgentAction`, asserter qu'un contact
  `excludedReason` est `skipped` et que le lot eligible defere sans insert. (R1,R2,R5,R7)

## T3. Parite anti-ICP dans `enrollInSequence`  [DEJA LIVRE]

- **Action** : `app/apps/web/src/lib/chat/tools/action.ts:575-665` — `leftJoin`
  companies + `checkContactEligibility` par contact avant l'insert (l.609-635).
- **Verify** : lecture l.609-635 confirme le skip ; pas de gate de defer (decision
  AS-BUILT : ids explicites).
- **Test** : ajouter `src/__tests__/enroll-in-sequence-tool.test.ts` —
  un `contactId` dont la company est flaggee est `skipped`, un eligible est enrole. (R4)

## T4. Test de regression route  [DEJA LIVRE]

- **Action** : `app/apps/web/src/__tests__/autopilot-api.test.ts` — 4 tests :
  401 (l.110), 404 (l.116), defer anti-ICP (l.123), execute filtre (l.154).
- **Verify** : `cd app/apps/web && pnpm vitest run src/__tests__/autopilot-api.test.ts`.
- **Test** : ce fichier meme. (R1-R3,R5-R7,R9)

## T5. Gate complet (regression suite + tsc)  [DEJA LIVRE]

- **Action** : faire tourner la suite web complete + tsc.
- **Verify** : `cd app/apps/web && pnpm tsc --noEmit` → 0 ; `pnpm test` → 5867 verts.
- **Test** : suite complete (gate de merge). (tous R)

## Ordre d'execution

T0 (lecture) → T1 (route, surface principale) → T4 (regression route, valide T1)
→ T2 + T3 (tools chat, independants entre eux, dependent de T0) → T5 (gate final).
T2/T3 parallelisables. T4 depend de T1 ; T5 depend de tout.

## Estimation effort

- T0 : 0.5 j (lecture des 6 fichiers + parite/miroir).
- T1 : 0.5 j.
- T2 : 0.25 j. T3 : 0.25 j.
- T4 : 0.25 j (deja ecrit). T5 : 0.25 j.
- **Total : ~2 jours** (1 dev). Conforme au livre `34cce1f7` (3 fichiers, 327 +/-).
