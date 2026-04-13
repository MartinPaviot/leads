# Tasks — BUGFIX-07

## T0. Audit lecture
- **Action :**
  - `find apps/web/src/app/api/track -type f`
  - `find apps/web/src/app/api/unsubscribe -type f`
  - Lire chaque route existante, noter dans `_specs/BUGFIX-07-engagement-webhooks/notes.md`
- **Verify :** Liste claire de ce qui existe vs à créer.
- **Test :** N/A.

## T1. Créer (ou patcher) `/api/track/open`
- **Action :** Si manquant, créer fichier (cf design.md). Si existant, vérifier idempotency `isNull(openedAt)` + cache headers.
- **Verify :** `curl -i http://localhost:3000/api/track/open?id=<email-uuid>` → 200, Content-Type: image/gif, body = GIF transparent. DB : openedAt updated.
- **Test :** Vitest sur la route — happy path + idempotency + invalid id.

## T2. Créer (ou patcher) `/api/track/click`
- **Action :** Idem T1 pour click route.
- **Verify :** `curl -i "http://localhost:3000/api/track/click?id=X&url=https%3A%2F%2Fexample.com"` → 302 + Location: https://example.com. DB updated.
- **Test :** Vitest — URL valide, malformée, scheme `javascript:`, etc.

## T3. Créer (ou patcher) `/api/unsubscribe`
- **Action :** GET + POST handlers cf design.md. Pause enrollments + insert emailOptouts.
- **Verify :** `curl /api/unsubscribe?email=bob@acme.com&tenant=<uuid>` → page HTML. DB : opt-out + enrollments paused.
- **Test :** Vitest — happy path, missing params, idempotent.

## T4. Signature Svix sur webhook Resend
- **Action :** `apps/web/src/app/api/webhooks/resend/route.ts` — installer `svix` (`pnpm add svix`), wrapper avec `Webhook.verify`.
- **Verify :** Sans signature → 401. Avec signature valide (test mode) → traitement normal.
- **Test :** Vitest avec `Webhook` mock + signature de test.

## T5. Vérifier signature webhook EmailEngine
- **Action :** `apps/web/src/app/api/webhooks/emailengine/route.ts` a déjà signature HMAC manuelle (lignes 6-18). Vérifier qu'elle est appelée et que `EMAILENGINE_WEBHOOK_SECRET` est set en prod.
- **Verify :** Sans signature → 401 confirmé.

## T6. Documentation prod setup
- **Action :** Créer `_specs/BUGFIX-07-engagement-webhooks/setup-prod.md` :
  - Endpoints à configurer dans Resend dashboard : `https://app.elevay.com/api/webhooks/resend`, events à écouter
  - Endpoint EmailEngine : `https://app.elevay.com/api/webhooks/emailengine`
  - ENV vars requises : `RESEND_WEBHOOK_SECRET`, `EMAILENGINE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`
  - Test commands (curl avec signature)

## T7. Helper `captureServerEvent` (PostHog server-side)
- **Action :** Créer/vérifier `apps/web/src/lib/posthog-server.ts` avec `captureServerEvent(name, properties)` qui ne block pas + ne throw pas.
- **Verify :** Test : event arrive dans PostHog dashboard.
- **Test :** Vitest avec mock PostHog client.

## T8. Test E2E webhook simulation
- **Action :** `apps/web/tests/e2e/webhooks-engagement.spec.ts` :
  - POST `/api/webhooks/resend` event=`email.opened` avec signature → DB updated
  - POST `/api/webhooks/resend` sans signature → 401
  - GET `/api/track/open?id=X` → GIF + DB updated
  - GET `/api/track/click?id=X&url=https://example.com` → 302
  - GET `/api/unsubscribe?email=...&tenant=...` → opt-out + page
- **Verify :** `pnpm playwright test webhooks-engagement` passe.

## T9. Doc audit
- **Action :** Mettre à jour `_reports/audit-deep/03a-sequences.md` section "Engagement tracking" : corriger ("schéma OK, logique manquante" → "logique présente, gates fixés").

## Ordre d'exécution
T0 (priorité absolue) → T1, T2, T3 (parallélisable) → T4, T5 → T6 → T7 → T8 → T9

## Estimation effort
~4-5h (dépend du résultat T0 — si tout existe, on est à 2h).
