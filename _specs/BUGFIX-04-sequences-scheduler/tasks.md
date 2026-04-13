# Tasks — BUGFIX-04

## T0. Audit lecture (read-only, écrire dans notes.md)
- **Action :** Lire et résumer dans `_specs/BUGFIX-04-sequences-scheduler/notes.md` :
  - `inngest/functions.ts:308` (sendSequenceStep) — logique complète
  - `inngest/reply-handler.ts` — comment il pause
  - `inngest/client.ts` + `app/api/inngest/route.ts` — toutes les fonctions registered
- **Verify :** `notes.md` répond aux open questions du design.md.
- **Test :** N/A.

## T1. Fix idempotency `sendSequenceStep`
- **Action :** Ajouter check duplicate dans `functions.ts` (avant insert outboundEmail).
- **Verify :** Trigger 2× le même `sequence/step-due` event → 1 seul outboundEmail créé.
- **Test :** Vitest sur `sendSequenceStep` (ou test E2E qui envoie 2× event).

## T2. Helper `pauseEnrollment`
- **Action :** Créer `apps/web/src/lib/enrollment.ts` avec `pauseEnrollment(id, reason)` (cf design.md).
- **Verify :** Appel manuel dans REPL → enrollment passe paused + activity loggée.
- **Test :** Vitest unit.

## T3. Refactor webhooks pour utiliser `pauseEnrollment`
- **Action :**
  - `webhooks/resend/route.ts` lignes 92-104 (bounce hard) → utiliser helper
  - `webhooks/resend/route.ts` lignes 125-130 (complaint) → utiliser helper
  - `webhooks/emailengine/route.ts` (reply detection) → utiliser helper si pas déjà
  - `inngest/reply-handler.ts` → utiliser helper
- **Verify :** Tests existants des webhooks toujours verts.
- **Test :** Vitest sur chaque webhook.

## T4. Ajouter colonnes `pauseReason`, `pausedAt`, `completedAt` (si manquant)
- **Action :** `db/schema.ts` — ajouter colonnes optionnelles à `sequenceEnrollments` si absentes.
- **Verify :** Migration drizzle générée + appliquée.
- **Test :** N/A schema.

## T5. Helper `addBusinessDays`
- **Action :** Créer `apps/web/src/lib/business-days.ts` avec `addBusinessDays(date, days)`.
- **Verify :** Tests : lundi + 1 = mardi ; vendredi + 1 = lundi ; vendredi + 3 = mercredi.
- **Test :** Vitest exhaustif.

## T6. Intégrer skip-weekend dans `sendSequenceStep`
- **Action :** Dans `sendSequenceStep`, calculer `nextStepAt` via `addBusinessDays(now, delayDays)` si `tenant.settings.sequencesSkipWeekends !== false`.
- **Verify :** E2E avec delay=1, enrolled vendredi 15h → nextStepAt = lundi 15h.
- **Test :** Vitest avec mock date.

## T7. Vérifier signature webhook Resend
- **Action :** `webhooks/resend/route.ts` — actuellement aucune vérification de signature visible. Ajouter validation `Svix-Signature` (Resend utilise Svix).
- **Verify :** `curl` sans signature → 401.
- **Test :** Vitest avec signature valide vs invalide.

## T8. Augmenter LIMIT cron à 200
- **Action :** `sequence-cron.ts:33` — `limit(50)` → `limit(200)`.
- **Verify :** Run cron avec > 100 enrollments → tous traités en 1 run.
- **Test :** Vitest avec 150 fixtures.

## T9. Ajouter PostHog events
- **Action :** Dans `sendSequenceStep` (success/skip), `pauseEnrollment`, `processOutboundEmails` (sent), `webhooks/resend` (replied/bounced) → `posthog.capture(...)`.
- **Verify :** PostHog dashboard montre les nouveaux events après run.
- **Test :** Mock PostHog dans tests, vérifier appel.

## T10. Doc dev — `dev-test.md`
- **Action :** Créer `_specs/BUGFIX-04-sequences-scheduler/dev-test.md` :
  - Lancer Inngest dev server : commande exacte
  - Lancer worker localement
  - Seed une sequence test
  - Vérifier l'envoi en Resend test mode
- **Verify :** Un ingénieur fresh peut suivre la doc et tester.

## T11. Test E2E full pipeline
- **Action :** `apps/web/tests/e2e/sequence-pipeline.spec.ts` :
  - Crée sequence 2-step (delay 0)
  - Enroll contact test
  - Attendre 4 min
  - Vérifier outboundEmails : step 1 sent, step 2 sent
  - Inject reply via webhook fake → enrollment.status = replied
- **Verify :** `pnpm playwright test sequence-pipeline` passe en CI (avec Inngest dev + Resend test).

## T12. Doc audit
- **Action :** Mettre à jour `_reports/audit-deep/03a-sequences.md` : corriger l'erreur initiale ("scheduler absent" → "scheduler présent + gaps fixed").

## Ordre d'exécution
T0 (priorité absolue, débloque les hypothèses) → T1, T2, T3 (parallélisable) → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12

## Estimation effort
~5-7h focused (incluant audit T0).
