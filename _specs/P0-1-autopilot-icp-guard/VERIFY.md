# VERIFY — P0-1 Autopilot enrollment : garde anti-ICP + gate HITL

Branche : `feat/autopilot-icp-guard` · Verifie le 2026-06-21 contre le code live.

## Commits

- `34cce1f7` — "fix(sequences): close anti-ICP + HITL bypass in autopilot
  enrollment". 3 fichiers, +327/-70 :
  - `app/apps/web/src/app/api/sequences/[id]/autopilot/route.ts` (+124/-…)
  - `app/apps/web/src/lib/chat/tools/action.ts` (+115/-…)
  - `app/apps/web/src/__tests__/autopilot-api.test.ts` (+158/-…)

## Requirements diff (Status / Evidence)

| Req | Status | Evidence |
|---|---|---|
| R1 leftJoin companies + eligibilite (lot) | ✅ | `route.ts:63-102` ; `action.ts:703-741` |
| R2 exclure `excluded_reason` | ✅ | `enrollment-eligibility.ts:42-44` ; test `autopilot-api.test.ts:140` (`skipped:1`, `contactIds:["c-ok"]`) |
| R3 exclure soft-delete / no_email | ✅ | `enrollment-eligibility.ts:40-41` ; filtre SQL `route.ts:77` |
| R4 parite anti-ICP `enrollInSequence` | ✅ | `action.ts:609-635` |
| R5 gate avant tout insert | ✅ | `route.ts:121-127` ; `action.ts:751-753` |
| R6 jamais `allowed:true` pour sequence-enrollment | ✅ | `approval-mode.ts:155` (outbound+confirm:always) + delegation l.195-204 |
| R7 defer via recordAgentAction, zero insert | ✅ | `route.ts:129-152` ; test `autopilot-api.test.ts:142-151` (`recordAgentAction` appele, `insertValues` non appele) |
| R8 enrole via executeur a l'approbation | ✅ | `action-executors.ts:203-238` (re-valide tenant+soft-delete, idempotent) |
| R9 auth + `sequences:execute` | ✅ | `route.ts:15-22` ; test 401 l.110-114 |
| R10 tenant-scoping | ✅ | `route.ts:74` ; `action.ts:714` |
| R11 payload reporting coherent | ✅ | `route.ts:143-151` ; test `toMatchObject` l.140,172 |
| R12 pas d'enroll inline tant que gate≠execute | ✅ | chemin l.154-181 inatteignable ; test l.154-176 verifie qu'il filtre quand meme |
| R13 ne pas toucher `/enroll`/miroir/helpers | ✅ | diff `34cce1f7` ne contient PAS `/enroll`, `enrollment-eligibility.ts`, `approval-mode.ts`, `action-executors.ts`, `signal-to-sequence.ts` |

## Tests

`app/apps/web/src/__tests__/autopilot-api.test.ts` — 4 tests :

1. `returns 401 when not authenticated` (l.110-114).
2. `returns 404 when sequence not found` (l.116-121).
3. `skips anti-ICP-excluded contacts and DEFERS the eligible set (no active enroll)`
   (l.123-152) — asserte `deferred:true, queued:1, enrolled:0, skipped:1, eligible:2`,
   `recordAgentAction(contactIds:["c-ok"])`, `insertValues` **non** appele.
4. `even if the authority ever allows execute, only the eligible set is enrolled`
   (l.154-176) — gate force `allowed:true`, asserte `enrolled:1, skipped:1`,
   `recordAgentAction` non appele, `insertValues` appele exactement 1 fois.

`checkContactEligibility` est importe REEL (fonction pure) → le filtrage est
genuinement exerce ; le gate + la lane sont mockes pour asserter le cablage.

Gate (revendique par `34cce1f7`, a re-executer avant merge) :

- `pnpm tsc --noEmit` (app/apps/web) → **0 erreur**.
- `pnpm test` (suite web) → **5867 verts**.

Commandes de re-verification :

```
cd app/apps/web
pnpm vitest run src/__tests__/autopilot-api.test.ts
pnpm tsc --noEmit
pnpm test
```

## Honest scope note

- Le chemin d'enroll **inline** de la route et de `runSequenceAutopilot`
  (`route.ts:154-181`, `action.ts:779-805`) est **aujourd'hui inatteignable** :
  `sequence-enrollment` est `outbound + confirm:always`, donc le gate ne renvoie
  jamais `allowed:true`. Le test #4 le couvre defensivement (si la politique
  change un jour, seul le lot eligible serait enrole). Il n'est pas exerce en prod.
- `enrollInSequence` a recu **uniquement** le filtre anti-ICP, **pas** de gate de
  defer — c'est intentionnel (ids passes explicitement par l'utilisateur = action
  manuelle ; le seul gap vs `/enroll` etait l'anti-ICP). Les surfaces auto-select
  (route + `runSequenceAutopilot`) ont, elles, le gate complet.
- Couverture de tests dediee : la **route** est couverte (4 tests). Les tools chat
  `runSequenceAutopilot` (T2) et `enrollInSequence` (T3) n'ont **pas** de test
  unitaire dedie dans ce commit — ils reutilisent les memes helpers que la route
  (couverts) et sont identiques en structure, mais une couverture directe reste a
  ajouter (T2/T3 du tasks.md). Honnete : la garantie sur ces deux surfaces repose
  sur la revue de code + la parite structurelle, pas sur un test propre.
- Aucune migration / changement de schema. Aucune verification live runtime
  (Playwright) n'a ete faite ; la garantie est statique (tsc) + unitaire (vitest).
