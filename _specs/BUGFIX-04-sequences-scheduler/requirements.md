# BUGFIX-04 — Sequences scheduler : audit & gaps

## Note importante
**L'audit initial était trompeur.** Le scheduler EXISTE déjà :
- `apps/web/src/inngest/sequence-cron.ts` — cron `*/2 * * * *` qui détecte les `sequenceEnrollments` due → fire `sequence/step-due`
- `apps/web/src/inngest/functions.ts:308` — `sendSequenceStep` consomme l'event → drafts l'email du step suivant
- `apps/web/src/inngest/email-send-worker.ts` — cron `*/2 * * * *` `processOutboundEmails` → envoie via Resend, gère send window, daily limit, warmup, tracking pixel + click rewrite, CAN-SPAM footer
- `cronDailyMailboxReset` — reset compteurs quotidiens, transition warming_up → active

## Scope révisé
On ne reconstruit pas le scheduler. On audit l'existant + comble les gaps réels suivants :

### Gap 1 — Vérifier `sendSequenceStep` génère bien le prochain step
Lire `inngest/functions.ts:308` → confirmer logique : pour chaque enrollment due, charger `sequenceSteps[currentStep+1]`, drafter email avec `personalizeStepEmail`, insérer dans `outboundEmails` (status="queued") OU (status="draft" si tenant.settings demande review), incrémenter `currentStep`, recalculer `nextStepAt = now + nextStep.delayDays`.

### Gap 2 — Aucun reply-handler complet pour stop sequence
`reply-handler.ts` existe (vu dans Glob) — vérifier qu'il pause l'enrollment au reply.

### Gap 3 — Timezone awareness manquante côté `nextStepAt`
Le calcul `nextStepAt = now + delayDays` ne respecte pas la timezone du destinataire. Si Bob a `delayDays = 2` et reçoit un email lundi 23:50 UTC, le step suivant fire mercredi 23:50 UTC = mercredi soir Europe = mauvaise heure.

### Gap 4 — Pas de "Skip weekends" pour le calcul de `nextStepAt`
La feature `sendDays` existe sur `connectedMailboxes` et est respectée par `processOutboundEmails` (le cron retient l'email et retry plus tard). MAIS : `nextStepAt = now + delayDays` peut tomber un samedi → l'email reste queued jusqu'à lundi → délai effectif = 4 jours au lieu de 2. Acceptable mais à documenter.

### Gap 5 — Aucun fallback si `RESEND_API_KEY` manquant
`email-send-worker.ts:241-253` : email passe en `failed` immédiatement avec message clair. **OK.**

## Critères d'acceptation

### AC1 — Audit pipeline E2E
- **GIVEN** une sequence avec 3 steps (delays 0, 2, 5 jours)
- **WHEN** un contact est enrolled
- **THEN** step 1 envoyé immédiatement (ou queued si review mode)
- **AND** step 2 fired après 2 jours
- **AND** step 3 fired après 5 jours après step 2
- **AND** chaque étape est tracée dans `activities` (entityType = contact)

### AC2 — Reply pause
- **GIVEN** un contact enrolled, step 1 sent
- **WHEN** le contact répond (webhook EmailEngine `messageNew` ou Resend)
- **THEN** `sequenceEnrollments.status` passe à `"replied"` ou `"paused"` (selon politique)
- **AND** aucun step suivant n'est envoyé

### AC3 — Bounce hard pause
- **GIVEN** un contact enrolled, step 1 sent
- **WHEN** Resend webhook `email.bounced` type=hard arrive
- **THEN** `outboundEmail.status = "bounced"`, `enrollment.status = "paused"`, contact ajouté à `emailOptouts`
- **DÉJÀ IMPLÉMENTÉ** dans `webhooks/resend/route.ts:73-105` ✅

### AC4 — Send window respecté
- **GIVEN** un email queued à 19h avec `sendWindowEnd = 18:00`
- **WHEN** le cron `processOutboundEmails` tourne
- **THEN** l'email reste `queued` avec `errorMessage = "Outside send window, will retry"`
- **AND** retry au prochain cron qui tombe dans la window
- **DÉJÀ IMPLÉMENTÉ** dans `email-send-worker.ts:205-221` ✅

### AC5 — Daily limit respecté
- **DÉJÀ IMPLÉMENTÉ** dans `email-send-worker.ts:223-234` ✅

### AC6 — Failure mode dead-letter logging
- **GIVEN** une exception non-catchée dans `sendSequenceStep`
- **WHEN** Inngest abandonne après retries
- **THEN** dead-letter handler logge avec contexte (enrollmentId, sequenceId, contactId)
- **AND** alert PostHog/Sentry envoyée

### AC7 — Test E2E avec dev-server Inngest
- **GIVEN** Inngest dev server local + DB locale
- **WHEN** un test enroll un contact dans une sequence avec delay 0 minute
- **THEN** dans <1 minute : email apparaît en `outboundEmails`, status=queued
- **AND** dans <3 minutes : status=sent (Resend test mode)

## Edge cases
- Enrollment supprimé en plein vol → cron skip gracefully
- Sequence supprimée → tous enrollments deviennent orphelins → cron doit les marquer `paused` ou `cancelled`
- Mailbox du tenant supprimé → fallback FROM (FALLBACK_FROM existe ligne 16) ou error
- Contact email = null (improbable mais possible si manuel) → cron skip + log

## Steps d'évaluation
1. Lire `inngest/functions.ts:308` (sendSequenceStep) — vérifier qu'il existe et fait ce qu'on attend
2. Lire `inngest/reply-handler.ts` — vérifier reply pause logic
3. Bench E2E : créer sequence 2-step (delay 1 min), enroll contact test, attendre 2 cycles cron (~4 min), vérifier statuts
4. Vérifier dead-letter logs si on injecte une exception
5. Vérifier docs dev (`SETUP.md`, README) mentionnent comment lancer Inngest dev server pour tester
