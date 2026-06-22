# Design — P0-4 (pre-send spam-check)

## Composants existants (read-only puis fix ciblé)

| Fichier | Rôle | Status |
|---|---|---|
| `app/apps/web/src/lib/emails/email-spam-check.ts:103-216` | `checkSpamSignals` pur, score+severity+warnings | ✅ correct, **read-only** |
| `app/apps/web/src/lib/sequence-drafts/citations.ts:49-69` | `decideCitationGate` — modèle de gate pur fail-closed | ✅ read-only (on le **clone** pour le spam) |
| `app/apps/web/src/lib/sequence-drafts/state-machine.ts:117-130` | `canTransition(status,"recall")` : `approved`→`pending_approval` | ✅ read-only |
| `app/apps/web/src/inngest/sequence-draft-to-outbound.ts:127-172` | citation gate + pattern recall à imiter | **à modifier** (insérer le spam gate après `:172`) |
| `app/apps/web/src/lib/sequence-drafts/router.ts:75-90` | `buildDraftRow` — construit la row d'insert | **à modifier** (peupler spam*) |
| `app/apps/web/src/db/schema/outbound.ts:128-195` | table `sequenceDrafts` | **à modifier** (3 colonnes) |
| `app/apps/web/src/app/api/sequences/drafts/[id]/context/route.ts:127-133` | sérialise le draft pour la review | **à modifier** (exposer spam*) |
| `app/apps/web/src/app/api/sequences/drafts/[id]/edit/route.ts` | édition subject/body | **à modifier** (recalcul spam) |
| `app/apps/web/src/components/sequence-draft-preview.tsx:339-377` | section "Why this draft?" | **à modifier** (ajouter "Deliverability check") |
| `app/apps/web/src/components/sequence-draft-list.tsx:22-39` | type `DraftListItem` | **à modifier** (champs spam optionnels) |

## Fixes ciblés

### Fix 1 — helper pur `decideSpamGate` (nouveau)

Clone de `decideCitationGate` (`citations.ts:56-69`), mais **fail-soft** : seul `high`
bloque. Nouveau fichier `app/apps/web/src/lib/sequence-drafts/spam-gate.ts` :

```ts
import type { SpamCheckResult } from "@/lib/emails/email-spam-check";

export function decideSpamGate(
  result: SpamCheckResult,
): { ok: true } | { ok: false; reviewReason: string; codes: string[]; score: number } {
  if (result.severity !== "high") return { ok: true };
  const codes = result.warnings.map((w) => w.code);
  const top = result.warnings.slice(0, 3).map((w) => w.message).join(" ");
  return {
    ok: false,
    score: result.score,
    codes,
    reviewReason:
      `High spam risk (score ${result.score}/100) — sending would hurt your domain ` +
      `reputation. Fix before resending: ${top}`,
  };
}
```

### Fix 2 — câblage send-time dans `sequence-draft-to-outbound.ts`

Insérer **après** le citation gate (`:172`) et **avant** la branche phone_task (`:179`),
en clonant la structure `:145-171`. `checkSpamSignals` est CPU-pur → pas de `step.run`
autour du calcul, seulement autour du DB update.

```ts
import { checkSpamSignals } from "@/lib/emails/email-spam-check";
import { decideSpamGate } from "@/lib/sequence-drafts/spam-gate";
// ...
// Spam gate (P0-4). Fail-SOFT, contrairement au citation gate :
// seul severity 'high' recall. medium/low/clean passent.
// Email-only ; les heuristiques (liens, unsubscribe) n'ont pas de
// sens pour un phone_task.
if (decision.via === "email") {
  const spam = checkSpamSignals(draft.subject, draft.bodyText ?? "");
  const gate = decideSpamGate(spam);
  if (!gate.ok) {
    const recall = canTransition(draft.status as DraftStatus, "recall");
    if (recall.allowed) {
      await step.run("recall-draft-spam", async () => {
        await db.update(sequenceDrafts).set({
          status: recall.nextStatus,
          reviewReason: gate.reviewReason,
          spamScore: spam.score,
          spamSeverity: spam.severity,
          spamWarnings: spam.warnings,
          reviewedAt: new Date(),
          scheduledSendAt: null,
          updatedAt: new Date(),
        }).where(eq(sequenceDrafts.id, draftId));
      });
      logger.warn("sequence-draft-to-outbound.spam_recall", {
        draftId, spamScore: gate.score, codes: gate.codes,
      });
      return { skipped: "spam_high", draftId, spamScore: gate.score };
    }
    logger.warn("sequence-draft-to-outbound.spam_high_not_recallable", { draftId });
    return { skipped: "spam_high_not_recallable", draftId };
  }
}
```

Note : la branche `via === "email"` ici n'empêche pas la branche `phone_task` plus bas car
on `return` dans le cas bloquant uniquement ; le cas `ok` tombe à travers vers le code
existant inchangé.

### Fix 3 — `buildDraftRow` peuple le score (génération-time)

`router.ts:75-90`. Le checker étant pur, on le calcule directement dans `buildDraftRow`
(pas d'I/O, reste testable sans mock) :

```ts
import { checkSpamSignals } from "@/lib/emails/email-spam-check";
// dans DraftRowInsert : + spamScore: number; spamSeverity: string;
//   spamWarnings: SpamWarning[];
export function buildDraftRow(args: BuildDraftArgs): DraftRowInsert {
  const spam = checkSpamSignals(args.subject, args.bodyText);
  return {
    // ... champs existants :77-88 ...
    spamScore: spam.score,
    spamSeverity: spam.severity,
    spamWarnings: spam.warnings,
    status: "pending_approval",
    version: 1,
  };
}
```

### Fix 4 — recalcul à l'édition

`app/apps/web/src/app/api/sequences/drafts/[id]/edit/route.ts` : après validation
subject/bodyText, dans le `db.update(...).set({...})`, ajouter `spamScore/spamSeverity/
spamWarnings` recalculés via `checkSpamSignals(newSubject, newBodyText)`. (Lire le fichier
en T0 pour ancrer la ligne exacte du `.set`.)

### Fix 5 — context route expose les champs

`context/route.ts:127-133`, dans l'objet `draft:` du `Response.json` :

```ts
draft: {
  id: draft.id,
  status: draft.status,
  triggerReason: draft.triggerReason,
  generatedAt: draft.generatedAt?.toISOString(),
  spamScore: draft.spamScore,
  spamSeverity: draft.spamSeverity,
  spamWarnings: draft.spamWarnings,
},
```

### Fix 6 — UI "Deliverability check"

`sequence-draft-preview.tsx` : étendre `ContextBundle.draft` (`:37`) avec
`spamScore/spamSeverity/spamWarnings`, puis ajouter, **après** la `ContextSection` "Why
this draft?" (`:377`), une section conditionnelle (R11/R12) :

```tsx
{context?.draft?.spamSeverity &&
 ["medium", "high"].includes(context.draft.spamSeverity) &&
 (context.draft.spamWarnings?.length ?? 0) > 0 && (
  <ContextSection title="Deliverability check" icon={<AlertCircle size={12} />}>
    {context.draft.spamWarnings!.map((w, i) => (
      <p key={i} className="text-[12px]" style={{
        color: context.draft!.spamSeverity === "high"
          ? "var(--color-error)" : "var(--color-warning)",
      }}>{w.message}</p>
    ))}
  </ContextSection>
)}
```

`AlertCircle` est déjà importé (`sequence-draft-preview.tsx:31`). `ContextSection` existe
(`:486-513`). No-emoji respecté.

## Data model

`sequenceDrafts` (`outbound.ts:128-195`) — **3 colonnes nullables ajoutées** :

```ts
spamScore: integer("spam_score"),                       // 0-100, null = non calculé
spamSeverity: text("spam_severity"),                    // 'clean'|'low'|'medium'|'high'
spamWarnings: jsonb("spam_warnings")
  .$type<Array<{ code: string; message: string; weight: number }>>()
  .default([]),
```

Migration : drizzle ajoute 3 colonnes nullables, zéro backfill requis (les vieux drafts
restent null → R12 ne les affiche pas, le send-time gate recalcule). `pnpm db:push` en dev,
`db:migrate:apply` (runner custom, le journal casse à 0012) pour appliquer. **Ne pas
auto-migrer la prod depuis une branche non mergée** (cf. memory).

## Flux (ordre des gardes)

Send-time (`sequence-draft-to-outbound`) :
1. Load draft tenant-scoped (`:73-94`).
2. `decideDispatch` — refuse si pas `approved`+`email`/`phone_task` (`:114-125`).
3. **Citation gate** (fail-closed, existant `:134-172`) — early-return si citation morte.
4. **Spam gate** (NOUVEAU, fail-soft) — si `severity high` ET recallable → recall + return ;
   sinon fall-through.
5. (phone_task ou) resolve contact/mailbox → insert `outboundEmails` → mark `sent` (existant).

Génération-time : `personalizeStepEmail` → `buildDraftRow` (**calcule spam**) → insert.
Édition : route edit → recalcule spam → update.
Review : context route → expose spam* → preview rend la section conditionnelle.

## Failure handling / Security

- **Fail-soft motivé** : un faux positif heuristique ne doit JAMAIS bloquer l'envoi
  silencieusement (le founder a déjà approuvé). On bloque seulement `high` (score ≥ 50) et
  on renvoie à l'humain avec la raison — décision réversible. Le citation gate reste
  fail-closed car une citation morte est une erreur factuelle, pas un signal de style.
- **Tenant-scoping** : tous les updates conservent `eq(...tenantId)` existant ; aucune
  nouvelle requête cross-tenant (R13).
- **Idempotence** : recall gardé par `canTransition` (R5) ; double-insert couvert par le
  dedup `messageId` existant (`:313-323`).
- **Pas de step.run autour du calcul** : `checkSpamSignals` pur → re-exécution sur retry
  Inngest déterministe, pas de coût réseau.

## Open questions (à confirmer en T0 avant de coder)

1. Ligne exacte du `.set({...})` dans `edit/route.ts` (non lu intégralement) — confirmer
   qu'il fait bien un update et qu'on peut y greffer les 3 champs.
2. `bodyHtml` vs `bodyText` : le checker tourne sur `bodyText` ; confirmer que
   `bodyText` est toujours non-null à l'insert (`outbound.ts:141` `.notNull()` → oui).
3. Le runner de migration (`db:migrate:apply`) accepte-t-il l'ajout sur une branche
   post-0012 ? Sinon `db:push` en dev + SQL idempotent manuel sur la dev DB (cf. memory
   "always-apply-migrations").
