# `.env` à remplir — projet `leads` (web + admin)

Source de vérité maintenue : `app/apps/web/.env.example` (committé). Ce fichier-ci est la
liste **exhaustive** (125 clés réelles trouvées dans le code, bruit Next/Playwright exclu),
groupée et marquée **[REQUIS pour booter]**, **[REQUIS pour la feature X]**, **[OPTIONNEL]**.

Trois fichiers à créer (tous ignorés par git — vérifié via `git check-ignore`) :
- `app/apps/web/.env.local`   ← l'app principale (bloc ci-dessous)
- `app/apps/admin/.env.local` ← admin (3 clés, tout en bas)
- racine `.env.prod` / `.env.run` ← générés par `vercel env pull`, ne pas remplir à la main

Le plus simple sur une machine liée à Vercel : `vercel env pull app/apps/web/.env.local`
récupère TOUTES les valeurs prod d'un coup. Le bloc ci-dessous sert si tu pars de zéro
ou pour savoir ce que chaque clé fait.

---

## `app/apps/web/.env.local`

```bash
# ── Noyau — REQUIS pour booter ────────────────────────────────────────
AUTH_SECRET=                      # npx auth secret  (alias accepté: NEXTAUTH_SECRET)
AUTH_URL=http://localhost:3000    # (alias: NEXTAUTH_URL)
DATABASE_URL=postgresql://user:password@localhost:5432/leadsens
NEXT_PUBLIC_APP_URL=http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-...      # au moins UN provider LLM requis
OPENAI_API_KEY=sk-proj-...        # (fallback / embeddings)

# ── Souveraineté / RGPD — OPTIONNEL (recommandé EU) ───────────────────
ANTHROPIC_REGION=eu               # route via eu.anthropic.com
# ANTHROPIC_API_BASE=https://eu.anthropic.com
GDPR_REGION=eu                    # valide que DATABASE_URL pointe un host EU/CH
NEXT_PUBLIC_GDPR_REGION=eu
# LLM_PROVIDER=anthropic           # anthropic | mistral | auto
# MISTRAL_API_KEY=                 # provider EU-souverain

# ── Sign-in OAuth — REQUIS pour login Google / Microsoft ──────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# ── Secrets app — REQUIS ──────────────────────────────────────────────
ELEVAY_APP_SECRET=                # openssl rand -hex 32  (chiffre les clés Instantly + settings tenant)
ENCRYPTION_KEY=                   # openssl rand -hex 32  (présent dans le .env.local actuel)
CRON_SECRET=                      # protège les routes cron
INBOUND_WEBHOOK_SECRET=           # vérifie les webhooks entrants
BETA_SIGNUP_CODE=                 # lien d'invitation /join?code=...
# E2E_SECRET=                      # tests e2e seulement
# NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=  # fixe la clé Server Actions entre déploiements

# ── Enrichissement / sourcing — OPTIONNEL (chaque clé = un fournisseur) ─
APOLLO_API_KEY=                   # search + enrich (principal)
PAPPERS_API_KEY=                  # registre entreprises FR
ZEFIX_API_USER=                   # registre entreprises CH
ZEFIX_API_PASSWORD=
DATAGMA_API_KEY=                  # enrich EU (39$/mo)
FIRMABLE_API_KEY=                 # enrich ANZ
HUNTER_API_KEY=                   # email finding (free 50/mo)
CRUNCHBASE_API_KEY=               # funding (Enterprise only)
COGNISM_API_KEY=
CLEARBIT_API_KEY=
SNITCHER_API_KEY=                 # déanonymisation visiteurs
RB2B_API_KEY=                     # idem
KASPR_API_KEY=                    # mobiles FR (0.30€/lookup)
LUSHA_API_KEY=                    # mobiles US/UK
FULLENRICH_API_KEY=               # waterfall téléphone
# FULLENRICH_API_BASE=
# FULLENRICH_CALLBACK_BASE_URL=
FULLENRICH_WEBHOOK_SECRET=
ZELIQ_API_KEY=
# ZELIQ_CALLBACK_BASE_URL=
ZELIQ_WEBHOOK_SECRET=
APIFY_TOKEN=apify_...             # vérif rôle LinkedIn live (no-cookie)
# APIFY_LINKEDIN_ACTOR=dev_fusion~linkedin-profile-scraper
INSTANTLY_API_KEY=                # connecteur Instantly (1 clé workspace)
# LINKEDIN_OUTREACH_PROVIDER=

# ── Email sortant + sync — REQUIS pour invites/outbound ───────────────
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=
INVITE_FROM_ADDRESS=Elevay <invites@tondomaine.com>
OPS_EMAIL_ADDRESS=ops@tondomaine.com
# OPS_FROM_ADDRESS=
# WELCOME_FROM_ADDRESS=
EMAILENGINE_URL=http://localhost:3100
EMAILENGINE_WEBHOOK_SECRET=

# ── Queue / jobs — REQUIS pour crons + séquences ──────────────────────
REDIS_URL=redis://localhost:6379
# UPSTASH_REDIS_REST_URL=          # si Upstash plutôt que Redis local
# UPSTASH_REDIS_REST_TOKEN=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# ── Billing Stripe — REQUIS pour plans payants ────────────────────────
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
# STRIPE_FOUNDER_LED_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_...
# FOUNDER_LED_AMOUNT_CENTS=
# FOUNDER_LED_CURRENCY=

# ── Voice / Call Mode — REQUIS pour /call-mode ────────────────────────
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=
TWILIO_API_KEY_SID=SK...
TWILIO_API_KEY_SECRET=
TWILIO_APP_SID=AP...
TWILIO_REGION=ie1                 # ie1 Dublin (EU) | us1 | au1 | br1
DEEPGRAM_API_KEY=                 # transcription streaming
VOICE_PUBLIC_BASE_URL=https://ton-tenant.elevay.ai   # ngrok https en dev
VOICE_STREAM_PUBLIC_URL=wss://ton-tunnel.ngrok-free.app
VOICE_STREAM_PORT=3001
# VOICE_STREAM_DEBUG=1
VOICE_DISCLOSURE_AUDIO_URL=https://cdn.example.com/voice/disclosure-fr.mp3
VOICE_VOICEMAIL_DEFAULT_URL=https://cdn.example.com/voice/voicemail-fr.mp3
# VOICE_COACHING_LIVE=on
# VOICE_RECORDING_ENABLED=         # enregistrement souverain (Jibri), off par défaut
# VERIFY_NUMBER=                   # numéro de test

# ── Meetings (notetaker) — OPTIONNEL ──────────────────────────────────
RECALL_API_KEY=
RECALL_WEBHOOK_SECRET=
ZOOM_ACCOUNT_ID=                  # visio Zoom S2S
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
# JIBRI_WEBHOOK_SECRET=            # enregistrement Jitsi souverain

# ── Observabilité — OPTIONNEL (vide = désactivé) ──────────────────────
NEXT_PUBLIC_APP_ENV=development
# SENTRY_DSN=                       # *.de.sentry.io pour rester EU
# NEXT_PUBLIC_SENTRY_DSN=
# SENTRY_ORG=
# SENTRY_PROJECT=
# SENTRY_AUTH_TOKEN=
# NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# ── Divers / flags — OPTIONNEL ────────────────────────────────────────
# WS1_CHANNEL_ENABLED=
# WS1_LANDING_URL=
# NEXT_PUBLIC_QUALIFICATION_EXTRAS=
# PILAE_DOGFOOD_TENANT_ID=          # tenant de dogfooding
# OUTBOUND_TEST_MODE=               # garde-fou: n'envoie qu'à l'allowlist
# OUTBOUND_TEST_ALLOWLIST=
# ELEVAY_APP_DATABASE_URL=          # DB séparée si besoin
# NODE_EXTRA_CA_CERTS=C:/Users/<toi>/leads/.cacerts.pem   # SEULEMENT derrière un AV qui intercepte le TLS
```

---

## `app/apps/admin/.env.local`

```bash
ADMIN_SECRET=
AUTH_SECRET=
DATABASE_URL=postgresql://user:password@localhost:5432/leadsens
```

---

## Raccourci recommandé (machine liée à Vercel)

```bash
vercel link                                            # choisir team + projet web
vercel env pull app/apps/web/.env.local                # tire toutes les valeurs prod
```
Remplit en local seulement les clés que tu veux différentes de la prod (ex. Twilio test, ngrok).
