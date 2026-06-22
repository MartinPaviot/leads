# Design — P0-1 Autopilot enrollment : garde anti-ICP + gate HITL

## Composants existants (read-only puis fix cible)

| Fichier | Role | Status |
|---|---|---|
| `lib/sequences/enrollment-eligibility.ts:37-46` | `checkContactEligibility` pur (deleted>no_email>excluded_company) | ✅ read-only |
| `lib/guardrails/approval-mode.ts:148-205` | `GUARDED_ACTION_METADATA` (`sequence-enrollment`=outbound+confirm:always, l.155) + `enforceAgentApprovalMode` delegue a `decideAction` | ✅ read-only |
| `lib/agents/agent-actions.ts:51-88` | `recordAgentAction(awaitingApproval)` → ligne scheduled sans exec time = lane "Needs you" | ✅ read-only |
| `lib/agents/action-executors.ts:197-247` | executeur `sequence-enrollment` a l'approbation (re-valide tenant+soft-delete, idempotent) | ✅ read-only |
| `inngest/signal-to-sequence.ts:80-262` | patron miroir (anti-ICP + gate + defer) | ✅ read-only / reference |
| `app/api/sequences/[id]/enroll/route.ts` | chemin manuel, parite anti-ICP | ✅ read-only / reference |
| `app/api/sequences/[id]/autopilot/route.ts` | route auto-select | a modifier → ✅ corrige `34cce1f7` |
| `lib/chat/tools/action.ts:667-807` `runSequenceAutopilot` | tool auto-select | a modifier → ✅ corrige |
| `lib/chat/tools/action.ts:575-665` `enrollInSequence` | tool ids explicites | a modifier (eligibilite seule) → ✅ corrige |

## Fixes cibles

### Fix 1 — Route POST `/api/sequences/[id]/autopilot/route.ts`

Imports ajoutes (l.4-9) :

```ts
import { sequences, sequenceSteps, sequenceEnrollments, contacts, companies } from "@/db/schema";
import { eq, sql, and, isNotNull, gte, isNull } from "drizzle-orm";
import { checkContactEligibility } from "@/lib/sequences/enrollment-eligibility";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { readApprovalMode, enforceAgentApprovalMode } from "@/lib/guardrails/approval-mode";
import { recordAgentAction } from "@/lib/agents/agent-actions";
```

Candidats : `leftJoin(companies)` + selection de `companyExcludedReason` (l.63-81) :

```ts
const candidates = await db.select({
  id: contacts.id, email: contacts.email, deletedAt: contacts.deletedAt,
  companyExcludedReason: companies.excludedReason,
}).from(contacts)
  .leftJoin(companies, eq(contacts.companyId, companies.id))
  .where(and(eq(contacts.tenantId, authCtx.tenantId), isNotNull(contacts.email),
             gte(contacts.score, minScore), isNull(contacts.deletedAt)))
  .orderBy(sql`${contacts.score} DESC NULLS LAST`).limit(maxEnroll * 2);
```

Filtre (l.86-102) : `checkContactEligibility(...)` → push `toEnroll` sinon
`skippedCount++`.

Gate + defer (l.121-152) :

```ts
const settings = await getTenantSettings(authCtx.tenantId);
const mode = readApprovalMode(settings ?? { agentApprovalMode: "review-each" });
const gate = enforceAgentApprovalMode({ mode, action: "sequence-enrollment", confidence: 0.9 });
if (!gate.allowed) {
  await recordAgentAction({
    tenantId: authCtx.tenantId, userId: authCtx.userId,
    actionType: "sequence-enrollment", awaitingApproval: true,
    payload: { sequenceId: id, sequenceName: sequence.name, contactIds: toEnroll,
               queueAs: gate.queueAs, reason: gate.reason },
  });
  return Response.json({ success: true, deferred: true, queued: toEnroll.length,
    enrolled: 0, skipped: skippedCount, eligible: candidates.length, reason: gate.reason });
}
// chemin execute inline (inatteignable) : insere le MEME `toEnroll`, jamais `candidates`.
```

### Fix 2 — `action.ts` `runSequenceAutopilot` (l.667-807)

Meme structure : `leftJoin(companies)` (l.703-721) + filtre
`checkContactEligibility` (l.725-741) + gate/defer (l.751-777). `userId` vient du
closure `ctx` (l.50). Retour `{ deferred:true, queued, eligibleConsidered }`.

### Fix 3 — `action.ts` `enrollInSequence` (l.575-665) — eligibilite seule

```ts
const [contact] = await db.select({
  id: contacts.id, email: contacts.email, deletedAt: contacts.deletedAt,
  companyExcludedReason: companies.excludedReason,
}).from(contacts)
  .leftJoin(companies, eq(contacts.companyId, companies.id))
  .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId))).limit(1);
if (!contact) { skipped++; continue; }
const eligibility = checkContactEligibility({ email: contact.email,
  deletedAt: contact.deletedAt, companyExcludedReason: contact.companyExcludedReason });
if (!eligibility.eligible) { skipped++; continue; }
```

Pas de gate de defer ici : `contactIds` sont fournis explicitement par
l'utilisateur (action manuelle), le seul gap vs `/enroll` etait l'anti-ICP.

## Data model

Aucun changement de schema. Reutilise `companies.excludedReason`,
`contacts.{score,deletedAt,companyId}`, `sequenceEnrollments`, `agentActions`
existants.

## Flux

Route autopilot (et `runSequenceAutopilot` en miroir) :

1. auth → `requirePermission("sequences:execute")` (route uniquement, l.21).
2. valider sequence (tenant) + steps non vides.
3. lire `enrolledIds` (deja enroles).
4. candidats `leftJoin companies`, filtre SQL (email, score, non-supprime).
5. boucle : skip deja-enroles, `checkContactEligibility` → `toEnroll` ou `skipped`.
6. si `toEnroll` vide → retour `enrolled:0`.
7. **gate** `enforceAgentApprovalMode` (AVANT tout insert).
8. `!allowed` → `recordAgentAction(awaitingApproval)` + `deferred:true`, STOP.
9. `allowed` (inatteignable) → insere `toEnroll`.
10. approbation ulterieure → `action-executors.ts` enrole (re-valide + idempotent).

`enrollInSequence` : pas d'etape 7-10 ; filtre d'eligibilite par contact puis
insert direct des ids restants.

## Failure handling / Security

- **Fail-closed sur le gate** : `decideAction` mappe `refuse` → `pending-per-item`
  (`approval-mode.ts:201-203`) ; le background n'a pas de viewer, donc on defere
  plutot que d'auto-executer. `sequence-enrollment` ne renvoie jamais `execute`.
- **Defer = zero ecriture partielle** : gate appele avant la 1ere insertion.
- **Tenant-scoping** : toute lecture filtre `tenantId` (route l.74, tool l.714) ;
  `sequenceEnrollments` n'a pas de `tenantId`, donc l'executeur ancre via le FK
  contact re-valide (`action-executors.ts:215-219`).
- **Idempotence** : assuree par l'executeur a l'approbation
  (`action-executors.ts:224-229`), pas sur le chemin inline (inatteignable).
- **try/catch route** : erreur → 500 `"Autopilot enrollment failed"`
  (`route.ts:182-185`).

## Open questions

Aucune restante (toutes resolues a la lecture) :

- `enforceAgentApprovalMode` ne renvoie-t-il jamais `execute` pour
  `sequence-enrollment` ? — confirme (`approval-mode.ts:155` + delegation).
- `enrollInSequence` doit-il aussi deferer ? — non : ids explicites = action
  manuelle ; parite `/enroll` = anti-ICP seul (decision AS-BUILT).
- `/enroll` modifie ? — non, absent du diff `34cce1f7`.
