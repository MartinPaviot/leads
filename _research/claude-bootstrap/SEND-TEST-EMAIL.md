# Envoyer un mail de test Elevay (vers nos propres adresses)

But : déclencher un envoi sortant Elevay vers `martin@elevay.dev` et
`martin.paviot@outlook.com` **sans toucher de vrai prospect**. Deux couches
doivent passer ; elles sont indépendantes.

## Couche 1 — le destinataire a-t-il le droit de recevoir ? (garde-fou app)

`app/apps/web/src/lib/emails/recipient-guardrail.ts`. En **test mode** (le
défaut : seul le littéral `OUTBOUND_TEST_MODE=off` le désactive ; absent ou
typo ⇒ ON), tout envoi prospect-facing n'atteint QUE l'allowlist :

- **`martin@elevay.dev`** → passe **sans config**. Le domaine `elevay.dev` est
  codé en dur dans `ALWAYS_ALLOWED`.
- **`martin.paviot@outlook.com`** → pas sur `elevay.dev`, donc il faut l'ajouter :
  ```bash
  # app/apps/web/.env.local
  OUTBOUND_TEST_ALLOWLIST=martin.paviot@outlook.com
  ```
  (entrées séparées par virgule ; chacune = adresse complète, `@domaine`, ou
  `domaine` nu ; insensible à la casse.)

Tout autre destinataire est **échoué avec une raison claire, jamais envoyé**.
Appliqué à chaque chokepoint sortant (worker campagne, SMTP, composer,
`deliverInteractiveEmail`, follow-up meeting). N'affecte PAS le mail
transactionnel/auth (invite/verify/reset/notifs) — chemins séparés.

> En PROD, `OUTBOUND_TEST_MODE=off` (couche 1 désactivée) → cette recette est
> pour le **local/dev** où le test mode est ON par défaut.

## Couche 2 — l'expéditeur a-t-il le droit d'envoyer ? (Resend)

`app/apps/web/src/lib/emails/from.ts` (`INVITE_FROM_ADDRESS`). Tant qu'aucun
domaine n'est **vérifié dans Resend**, le compte est en testing mode :
- seul `onboarding@resend.dev` est accepté comme `from` ;
- Resend ne délivre **qu'au propriétaire du compte Resend** ; les autres
  destinataires reçoivent un **403 silencieux**.

Donc pour qu'`outlook.com` reçoive vraiment, il faut soit un domaine vérifié
dans Resend, soit que cette adresse soit le propriétaire du compte Resend.

## Tester le transport directement (bypass couche 1)

```bash
cd app/apps/web
npx tsx scripts/probe-resend-domains.ts   # quels domaines sont vérifiés ?
npx tsx scripts/probe-resend.ts           # POST /emails brut : status + body (capture le 403)
```

## Prompt court (à coller dans une session fraîche)

```
Active l'envoi de mails de test Elevay vers martin@elevay.dev et martin.paviot@outlook.com.
Lis d'abord _research/claude-bootstrap/SEND-TEST-EMAIL.md, puis :
mets OUTBOUND_TEST_ALLOWLIST=martin.paviot@outlook.com dans app/apps/web/.env.local,
vérifie RESEND_API_KEY + un domaine vérifié dans Resend,
et lance `npx tsx scripts/probe-resend.ts` pour confirmer la délivrance.
```
