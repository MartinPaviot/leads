# WS-1 — Recorder as Channel

## Contexte

L'Elevay Notetaker (bot Recall.ai) est déjà déployé en production. Il est configuré
via `app/(dashboard)/settings/recording/page.tsx` et le nom par défaut est "Elevay
Notetaker" (visible à tous les participants d'un meeting). Les meetings et
transcripts sont gérés via `api/webhooks/recall/route.ts` + `inngest/recall-functions.ts`.

**Gap identifié** : le recorder est traité comme une feature d'enregistrement,
pas comme un canal d'acquisition instrumenté. Lightfield revendique 75% de leurs
signups via exposure au recorder. Nous n'avons aucune attribution mesurée, donc
nous ne pouvons ni optimiser ni défendre ce canal.

**Insight produit principal** : un founder B2B fait 5-8 external sales calls/jour.
Chaque external call avec le bot branded = exposition de ~2-5 prospects à la marque
Elevay dans un contexte de haute attention (call actif). Sur 200 jours ouvrés,
c'est 2000-8000 exposures/an/seat — un canal de distribution entièrement intégré
au produit qui se substitue au paid marketing.

## User story principale

> En tant que founder LeadSens prospectant 5-8 calls/jour, je veux que chaque
> external sales call devienne une exposition mesurable à mon ICP cible, pour
> qu'à 12 mois, 50%+ des nouveaux signups soient attribuables à une exposition
> Notetaker avec un K-factor >0.3.

## Acceptance criteria

### AC-1.1 — Smart branding (auto-detect external vs internal)

- **GIVEN** un meeting est synchronisé via Google ou Microsoft Calendar
- **WHEN** au moins un participant a un domaine email ≠ du domaine primaire du tenant
- **THEN** le bot rejoint avec nom `{recordingBotName} (via Elevay)` ET
  le résumé envoyé aux externes contient un footer CTA "Powered by Elevay"
- **WHEN** tous les participants partagent le domaine primaire du tenant
- **THEN** le bot rejoint en mode silencieux avec nom `Notes` (pas de
  branding dans nom ni footer)

### AC-1.2 — Viral attribution

- **GIVEN** un nouveau signup s'inscrit avec email `prospect@acme.com`
- **WHEN** cet email (normalisé) correspond à ≥1 row `notetaker_exposures` avec
  `exposure_at` dans les 90 derniers jours ET `branding_mode = 'full'`
- **THEN** le tenant créé reçoit `settings.acquisitionSource = 'notetaker_exposure'`,
  `settings.referringTenantId = <id>`, `settings.exposureCount = N`,
  `settings.firstExposureAt = <timestamp>`
- **AND** la row `notetaker_exposures.signup_attributed_id` est mise à jour
- **AND** `tenant_referral_credits.credits_earned_count` du referrer est
  incrémenté ; si multiple de 3, un crédit "1 mois gratuit" est émis

### AC-1.3 — Prospect-side CTA non-intrusif

- **GIVEN** un meeting avec branding_mode='full' se termine
- **WHEN** le résumé est envoyé aux participants externes (opt-in tenant existant
  via `/api/meetings/[id]/notes/send-follow-up`)
- **THEN** le footer email contient exactement 2 lignes :
  `Ce résumé a été généré par Elevay. [Voir comment ça marche →](tracked link)`
- **AND** le link tracked est `/r/exposure/:exposureId` qui update `cta_clicked_at`
  avant redirect vers `/marketing/notetaker-landing`

### AC-1.4 — K-factor dashboard (admin)

- **GIVEN** je suis admin LeadSens sur le sous-dashboard existant
- **WHEN** je navigue vers `/admin/flywheel/recorder` (nouvelle page)
- **THEN** je vois 5 widgets :
  1. Exposures totales lifetime + last 30d (stat cards)
  2. Signups attribués lifetime + last 30d + conversion rate %
  3. K-factor hebdomadaire 12 semaines (line chart)
  4. Top 10 referring tenants (table : name, exposures, signups, conversion)
  5. Distribution temporelle : exposure → signup (median, p90 days)

### AC-1.5 — Default-on avec opt-out friction-light

- **GIVEN** tenant dans onboarding ou settings existant
- **WHEN** il configure le recorder
- **THEN** la policy est "branded" par défaut (branding visible pour externes)
- **AND** opt-out propose 2 modes : `always_silent` (jamais branded) ou
  `per_meeting` (opt-out sur demande par meeting, via UI future)
- **AND** `always_silent` requiert une raison (radio : "internal only",
  "client confidential", "regulatory", "other"). La raison est loggée
  dans `tenant.settings.recordingOptOutReason` pour instrumentation produit.

## Edge cases

| Cas | Comportement attendu |
|-----|---------------------|
| Meeting avec 5+ domaines différents | Externe (fuzzy match ignoré au-delà de 2 domaines) |
| Domaines aliasés (`acme.com` / `acme-corp.com`) | Si Levenshtein ≤2 sur racine + même TLD → même org, silent. Sinon externe. Configurable via `tenant.settings.domainAliases[]`. |
| Recurring meeting avec 1 externe ponctuel | Branding ON ce jour-là uniquement (décision par-meeting, pas par-series) |
| Signup avec email professionnel ≠ email d'exposition | Fallback : matcher par LinkedIn via Apollo enrichment existant (best effort, confidence tag) |
| Tenant tenu par régulation (santé/finance) | `always_silent` + aucune attribution outbound. Channel metrics restent trackées mais anonymisées. |
| Prospect EU (TLD `.fr`, `.de`, etc. ou IP EU) | CTA tracked link nécessite opt-in explicite via banner sur landing page (GDPR) |
| Bot ne rejoint pas (meeting annulé, lien invalide) | Aucune exposure créée. Bot status `error` ne compte pas. |
| Plusieurs bots sur 1 meeting (autre produit + Elevay) | Our branding s'applique normalement. On log `other_bots_detected` dans metadata pour future analyse. |
| Même prospect exposé à 2 tenants différents | Attribution au dernier expositor. Both tenants voient l'exposure côté analytics, un seul reçoit le crédit. |
| Tenant désactive recording après avoir déjà exposé | Exposures historiques conservées et attribuables. Plus aucune nouvelle exposure créée. |

## Evaluation steps (Phase 6 hostile QA)

1. **Setup** : créer 2 tenants test `A@leadsens-test.com` et `B@external-corp.com` sur staging.
2. **Meeting externe** : tenant A invite `user@external-corp.com` à un Google Meet, active recording avec nom "Acme Notetaker". Launch bot. Vérifier :
   - Bot affiche "Acme Notetaker (via Elevay)" dans Google Meet
   - Row `notetaker_exposures` créée avec `branding_mode='full'`, `participant_email='user@external-corp.com'`
3. **Résumé** : meeting se termine, résumé envoyé. Vérifier :
   - Email reçu par `user@external-corp.com` contient footer CTA
   - Click sur CTA → 302 vers landing + `cta_clicked_at` set
4. **Attribution** : `user@external-corp.com` signup 3j après. Vérifier :
   - Tenant B.settings.acquisitionSource = 'notetaker_exposure'
   - Tenant B.settings.referringTenantId = tenant A.id
   - Row exposure.signup_attributed_id = tenant B.id
5. **Meeting interne** : tenant A invite un user interne (même domaine) à un call. Vérifier :
   - Bot affiche "Notes" (silencieux)
   - Aucune row exposure créée
6. **Admin dashboard** : visiter `/admin/flywheel/recorder`. Vérifier les 5 widgets affichent des données cohérentes avec les tests 1-5.
7. **Fuzzy domain** : tenant A invite `user@acme-corp.com` alors que A.primaryDomain = `acme.com`. Vérifier : branding silent (considéré comme même org).
8. **Override fuzzy** : tenant A retire `acme-corp.com` de `domainAliases`. Nouveau meeting → branding full.
9. **GDPR** : signup avec IP EU ou email `.fr`. Vérifier banner opt-in avant tracking, CTA fonctionnel après opt-in.
10. **Regression** : lancer `regression.sh`. Aucun test existant ne doit failer (meeting processing, transcript, summary send).

## Hors scope (V1)

- Optimisation A/B du copy CTA
- Multi-touch attribution (premier-touch est suffisant V1)
- Récompenses monétaires autres que "1 mois gratuit" (cash bounties = V2)
- Détection automatique de "bot déjà présent" (other vendor bot) + stratégie de nom unique — log only en V1
- Attribution cross-device / fingerprint (email-based uniquement V1)

## KPIs de succès à 12 mois

| KPI | Cible |
|-----|-------|
| % signups avec `acquisitionSource = 'notetaker_exposure'` | ≥ 50% |
| K-factor hebdomadaire (signups attribués / exposures × 1 semaine) | ≥ 0.3 |
| Conversion CTA click → signup (30j) | ≥ 8% |
| Conversion exposure → signup (90j) | ≥ 2% |
| Opt-out rate (tenants qui passent à `always_silent`) | ≤ 15% |
| Délai médian exposure → signup | ≤ 21 jours |
