# Design — BUGFIX-04 (audit + gap-fill)

## Composants existants à auditer (read-only puis fix ciblé)

### `apps/web/src/inngest/sequence-cron.ts` (50 lignes)
- Cron `*/2 * * * *`, retries 1, concurrency 1, dead-letter log
- SELECT enrollments WHERE status='active' AND nextStepAt <= now LIMIT 50
- Fire `sequence/step-due` event par enrollment
**Status :** Apparemment correct. À vérifier : la limite de 50/run, la concurrency 1 (peut bottleneck à grande échelle).

### `apps/web/src/inngest/functions.ts:308` `sendSequenceStep`
- Consume `sequence/step-due`
- **À lire** : logique de génération du prochain step + insertion outbound + recalcul nextStepAt
- Vérifier qu'il gère :
  - Sequence terminée (currentStep > sequence.steps.length) → status="completed"
  - Step suivant manquant → status="completed"
  - Mailbox indisponible → fallback ou pause
  - Concurrence : 2 cron run successifs = duplicate event → idempotency clé `enrollmentId+stepNumber`

### `apps/web/src/inngest/email-send-worker.ts` (525 lignes)
- Tracking pixel + click rewrite ✅
- CAN-SPAM footer + `List-Unsubscribe` header ✅
- Send window + daily limit + warmup ramp ✅
- Daily reset cron ✅
**Status :** Très complet. Aucune action sauf observabilité.

### `apps/web/src/inngest/reply-handler.ts` (à lire)
- À vérifier : pause enrollment au reply, classification reply intent, opt-out détection

### Webhooks
- `apps/web/src/app/api/webhooks/resend/route.ts` ✅ — opened/clicked/bounced/complained
- `apps/web/src/app/api/webhooks/emailengine/route.ts` ✅ — messageNew/messageBounce

## Fixes ciblés à apporter

### Fix 1 — Idempotency dans `sendSequenceStep`
Ajouter un check : avant d'insérer un nouvel `outboundEmail`, query :
```ts
const existing = await db.select({id: outboundEmails.id}).from(outboundEmails)
  .where(and(
    eq(outboundEmails.enrollmentId, enrollmentId),
    eq(outboundEmails.stepNumber, currentStep + 1)
  )).limit(1);
if (existing.length > 0) return { skipped: "duplicate" };
```
Empêche les doublons en cas de retry Inngest ou de cron qui chevauche.

### Fix 2 — Helper `pauseEnrollment(enrollmentId, reason)`
Centraliser la logique pause (replied / bounced / complained / unsubscribed) dans `apps/web/src/lib/enrollment.ts` :
```ts
export async function pauseEnrollment(enrollmentId: string, reason: "replied" | "bounced" | "complained" | "unsubscribed" | "manual") {
  await db.update(sequenceEnrollments).set({
    status: reason === "replied" ? "replied" : "paused",
    pausedAt: new Date(),
    pauseReason: reason,
  }).where(eq(sequenceEnrollments.id, enrollmentId));
  await db.insert(activities).values({
    tenantId, ...,
    activityType: "system_event",
    summary: `Enrollment paused: ${reason}`,
  });
}
```
Refactor : webhooks/resend, webhooks/emailengine, reply-handler appellent ce helper.

### Fix 3 — Skip-weekend dans `nextStepAt`
Ajouter helper `addBusinessDays(date, days)` : ignore samedi/dimanche.
Optionnel par tenant via `tenants.settings.sequencesSkipWeekends: boolean` (default true).

### Fix 4 — Cron concurrency limit augmenter
Si > 100 enrollments en attente, le cron de 50 ne couvre pas. Augmenter LIMIT à 200 ou faire concurrency=3.

### Fix 5 — Observabilité
- Ajouter PostHog event `sequence_step_sent` { sequenceId, contactId, step, latency }
- Ajouter `sequence_replied`, `sequence_completed`, `sequence_paused`
- Métrique cron : `step_due_count`, `processed_count`, `failed_count` à chaque run

### Fix 6 — Doc dev
`SETUP.md` ou nouvelle `_specs/BUGFIX-04-sequences-scheduler/dev-test.md` :
- Comment lancer Inngest dev server (`pnpm inngest-cli dev` ou équivalent)
- Comment seed une sequence de test 1-min delay
- Comment vérifier l'envoi en local (Resend test mode)

## Data model — nouvelles colonnes (optionnel)
```ts
sequenceEnrollments {
  pauseReason: text(),       // nouveau
  pausedAt: timestamp(),     // nouveau
  completedAt: timestamp(),  // nouveau si pas existant
}
```

## Failure handling
- DLQ : Inngest dead-letter onFailure log already in place. Ajouter alerte Sentry/Slack.
- Race : 2 instances cron lancées en parallèle → concurrency=1 protège déjà. Idempotency Fix 1 = défense en profondeur.
- DB down : cron retry 1× puis dead-letter. Acceptable.

## Security
- Pas de modif d'authz (les crons tournent en service account Inngest).
- Webhook signature verified (Resend signature missing pour le moment dans la route — à vérifier).

## Open questions
- Lire `reply-handler.ts` pour confirmer qu'il existe et est wired
- Vérifier la signature webhook Resend (manquante actuellement = vulnérabilité)
- Décider du behavior reply : pause vs replied (semantically different)
