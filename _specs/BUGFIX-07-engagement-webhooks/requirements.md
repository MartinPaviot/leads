# BUGFIX-07 — Engagement webhooks : audit & gap-fill

## Note importante
**L'audit initial était trompeur.** Les webhooks EXISTENT déjà :
- `apps/web/src/app/api/webhooks/resend/route.ts` (149 lignes) — handle `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`. Update outboundEmails, emailOptouts, sequenceEnrollments, connectedMailboxes.
- `apps/web/src/app/api/webhooks/emailengine/route.ts` (130 lignes) — handle `messageNew` (reply detection), `messageBounce`. Signature HMAC vérifiée.
- `apps/web/src/inngest/email-send-worker.ts` (525 lignes) — inject tracking pixel + click rewrite + CAN-SPAM footer + `List-Unsubscribe` header.

## Scope révisé (gaps réels)

### Gap 1 — `webhooks/resend/route.ts` n'a PAS de signature verification
La route Resend accepte tout POST sans validation. Un attaquant peut faker des opens/clicks/bounces.

### Gap 2 — Pas d'endpoint `/api/track/open` ni `/api/track/click`
Le worker `email-send-worker.ts:48-72` génère des URLs `${appUrl}/api/track/open?id=...` et `${appUrl}/api/track/click?id=...&url=...`. **Ces routes existent-elles ?** À vérifier. Si non, le tracking pixel est mort.

### Gap 3 — Pas d'endpoint `/api/unsubscribe`
Le footer + header `List-Unsubscribe` pointent vers `${appUrl}/api/unsubscribe?email=...`. Vérifier que la route existe et ajoute le contact à `emailOptouts`.

### Gap 4 — Configuration manquante côté Resend dashboard
Les webhook URLs `https://app.elevay.com/api/webhooks/resend` doivent être configurées dans Resend dashboard. À documenter.

### Gap 5 — Pas d'analytics dashboard pour engagement
Les données s'accumulent dans `outboundEmails.openedAt/clickedAt/repliedAt/bouncedAt` mais aucun endpoint analytics ne les expose. Cf BUGFIX-04 si on les bundle.

## Critères d'acceptation

### AC1 — Webhook Resend signature vérifiée
- **GIVEN** Resend envoie un webhook
- **WHEN** la requête arrive à `/api/webhooks/resend` sans signature valide
- **THEN** 401, body ignoré
- **AND** logger.warn "Invalid Resend signature" loggée

### AC2 — Tracking pixel `/api/track/open`
- **GIVEN** un email envoyé contient `<img src="/api/track/open?id=<emailId>" />`
- **WHEN** le destinataire ouvre l'email (image loaded)
- **THEN** la route répond 200 avec un GIF transparent 1x1
- **AND** `outboundEmails.openedAt` est set si pas déjà set
- **AND** PostHog event `email_opened` capturé

### AC3 — Click tracking `/api/track/click`
- **GIVEN** un email contient `<a href="/api/track/click?id=<emailId>&url=<encoded>">`
- **WHEN** le destinataire clique
- **THEN** la route répond 302 vers l'URL originale décodée
- **AND** `outboundEmails.clickedAt` est set si pas déjà set
- **AND** PostHog event `email_clicked` capturé

### AC4 — Unsubscribe `/api/unsubscribe`
- **GIVEN** le destinataire clique sur le lien unsubscribe
- **WHEN** GET `/api/unsubscribe?email=...&tenant=...`
- **THEN** ajout dans `emailOptouts` (idempotent)
- **AND** toutes les `sequenceEnrollments` actives pour ce contact pause
- **AND** page de confirmation rendue : "You've been unsubscribed from <workspace>"

### AC5 — Unsubscribe one-click POST
- **GIVEN** Gmail/Outlook envoient un POST one-click (header `List-Unsubscribe-Post: List-Unsubscribe=One-Click`)
- **WHEN** POST `/api/unsubscribe?email=...&tenant=...` arrive
- **THEN** comportement identique à GET, 200 + page minimale

### AC6 — Documentation Resend webhook setup
- **GIVEN** un dev déploie en prod
- **WHEN** il lit `_specs/BUGFIX-07-engagement-webhooks/setup-prod.md`
- **THEN** il sait quels endpoints configurer dans Resend dashboard + secrets à set

### AC7 — Test E2E fake webhook
- **GIVEN** `RESEND_WEBHOOK_SECRET=test`
- **WHEN** un test envoie un POST avec signature valide vers `/api/webhooks/resend` event=`email.opened`
- **THEN** `outboundEmails.openedAt` mis à jour

## Edge cases
- Tracking pixel chargé 2× (forwards) → openedAt set au premier seulement (idempotent)
- Click avec URL malformée (encoding cassé) → log + redirect vers homepage avec banner
- Unsubscribe email avec espaces / casing → trim + lowercase
- Unsubscribe sans tenant param → 400 (pas de fuite cross-tenant)
- Resend webhook signature manquante en dev (`NODE_ENV !== production`) → accepter pour faciliter local

## Steps d'évaluation
1. Vérifier existence des routes : grep `app/api/track/open`, `app/api/track/click`, `app/api/unsubscribe`
2. Si manquantes, créer
3. Test : envoyer email via worker → ouvrir avec mailpit/test mode → vérifier `openedAt`
4. Test : cliquer un lien → vérifier 302 + `clickedAt`
5. Test : signature Resend invalide → 401
6. Test : unsubscribe → emailOptouts ligne créée + enrollment paused
