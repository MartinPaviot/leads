# Build the Real Engine — Apollo.io + EmailEngine + Outbound Pipeline

## Contexte

LeadSens a 52 features, 99 tests, build OK. Mais 8/10 pipelines de
données sont FAKE (Claude invente enrichissements, signaux, scores,
contacts). Et le système outbound ne peut pas envoyer un seul email.

Objectif de cette session : brancher les vrais tuyaux.

Lire OBLIGATOIREMENT avant de coder :
- `_specs/outbound-architecture.md` — architecture complète pour
  100 tenants × 100K emails/mois (EmailEngine + BullMQ + Workers)

## STATE SNAPSHOT (2026-04-01):
- Branch: main, commit 0bc6808
- 52/53 features, 99 tests, production build OK
- FAKE: enrichissement, scoring, signaux, TAM, contact discovery
- REAL: Gmail sync (read only), pgvector search, Inngest jobs
- ZÉRO email envoyé, ZÉRO vraie donnée d'enrichissement
- DB: Supabase PostgreSQL, 18 tables
- Dev: `cd app/apps/web && npx next dev --port 3002`
- Auth: credentials (any email/password) + Google OAuth configuré
- MCP dispo: Apollo.io, Gmail, Google Calendar, Playwright

## RÈGLE ABSOLUE

Claude = rédige, personnalise, résume, classifie.
Claude ≠ invente des données factuelles.

Tout enrichissement, contact, signal, score doit venir d'une SOURCE
RÉELLE (Apollo.io, Gmail, Calendar, calcul d'engagement).

---

## ÉTAPE 1 : Apollo.io — source de vérité pour les données (priorité max)

### 1A. Authentifier Apollo.io
```
Appeler: mcp__claude_ai_Apollo_io__authenticate
Explorer les tools disponibles après auth.
Documenter chaque tool dans _specs/apollo-tools.md
```

### 1B. Rewire `/api/enrich` → Apollo Organizations
Le code actuel dans `app/apps/web/src/app/api/enrich/route.ts` appelle
`generateObject()` avec Claude pour INVENTER industry/size/revenue.

Remplacer par :
- Apollo Organization Enrich (par nom + domaine)
- Récupérer : industry, employee_count, estimated_revenue, description,
  technologies, funding_total, linkedin_url, founded_year, domain
- Stocker les VRAIES données dans la table companies
- Fallback Claude UNIQUEMENT si Apollo ne trouve rien (et marquer
  `properties.enrichment_source = "llm_fallback"`)

### 1C. Rewire `/api/enrich-contacts` → Apollo People
Le code actuel invente des titres et seniority avec Claude.

Remplacer par :
- Apollo People Enrich (par email) ou People Search (par nom + company)
- Récupérer : title, email (vérifié), phone, linkedin_url, department,
  seniority_level, city, state, country
- Remplacer les données inventées par des vraies

### 1D. Rewire `/api/tam` → Apollo Organization Search
Le code actuel demande à Claude de "generate 30 REAL companies".
Ce sont des noms inventés.

Remplacer par :
- Traduire la description ICP en filtres Apollo :
  industry, employee_range, revenue_range, technologies, location
- Apollo Organization Search avec ces filtres
- Retourner de VRAIES entreprises avec de vraies données
- Auto-enrichir chaque résultat

### 1E. Rewire `/api/accounts/[id]/suggested-contacts` → Apollo People Search
Le code actuel génère des "realistic but fictional names".

Remplacer par :
- Apollo People Search par organization_domain
- Filtrer par seniority (VP, Director, C-Suite, Manager)
- Retourner de vrais contacts avec vrais titres et vrais emails

### 1F. Rewire `/api/signals` → Apollo + faits réels
Le code actuel invente des signaux avec de fausses URLs.

Remplacer par :
- Apollo intent data (si disponible)
- Données d'enrichissement Apollo (funding_total, technologies, employee_growth)
- Claude INTERPRÈTE les faits Apollo pour générer des insights
  Exemple: "Funding $12M Series A" → signal "Funding récent, budget disponible"
  PAS: Claude invente "ils viennent de lever" sans source

### 1G. Purger les fausses données
```sql
UPDATE companies SET
  industry = NULL, description = NULL, size = NULL,
  revenue = NULL, score = NULL, score_reasons = NULL,
  properties = '{}'
WHERE tenant_id = 'default';
```
Puis re-enrichir avec Apollo (1B).

---

## ÉTAPE 2 : Infra Outbound (lire _specs/outbound-architecture.md)

### 2A. Docker : EmailEngine + Redis
```yaml
# Créer docker-compose.yml à la racine
services:
  emailengine:
    image: postalsys/emailengine:latest
    ports: ["3100:3000", "3101:3001"]
    environment:
      EENGINE_REDIS: redis://redis:6379/1
      EENGINE_SECRET: ${EMAILENGINE_SECRET}
    depends_on: [redis]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redis_data:/data]
volumes:
  redis_data:
```
Lancer avec `docker-compose up -d`.
Vérifier : `curl http://localhost:3100/v1/settings` → 200.

### 2B. Migration DB : nouvelles tables
Créer dans le schema Drizzle + migrer :
- `connected_mailboxes` — mailboxes connectées par les tenants
- `outbound_emails` — chaque email envoyé avec tracking
- `warmup_emails` — emails de warm-up inter-tenant
- `email_optouts` — CAN-SPAM opt-outs

Schema exact dans `_specs/outbound-architecture.md`, section "Composant 2".

### 2C. Worker Service
Créer `app/apps/worker/` — service Node.js séparé de Next.js.
```
app/apps/worker/
├── src/
│   ├── queues/       (send, reply, warmup, health)
│   ├── workers/      (send, reply, warmup, health workers)
│   ├── services/     (emailengine client, rotation, rate-limiter)
│   └── index.ts
├── package.json
└── tsconfig.json
```
Dépendances : bullmq, imapflow (fallback), pg, @anthropic-ai/sdk

### 2D. EmailEngine Client Service
```typescript
// services/emailengine.ts
// REST client pour EmailEngine API
// - registerAccount(mailbox) → connecter une mailbox
// - sendEmail(accountId, email) → envoyer
// - getMessages(accountId, query) → lire
// - configureWebhook(url) → recevoir les events
```

### 2E. Connect Mailbox Flow
UI : page `/settings/mailboxes`
- Bouton "+ Connect Mailbox"
- Options : Gmail (OAuth), Outlook (OAuth), Custom SMTP/IMAP
- Pour Gmail : utiliser le Google OAuth existant (NextAuth)
- Stocker dans `connected_mailboxes` + enregistrer dans EmailEngine
- Afficher : email, provider, status, sent today, health score

### 2F. Send Worker + Rate Limiter + Rotation
Implémenter les 3 services critiques (code exact dans la spec) :
- `send.worker.ts` — consume la queue, envoie via EmailEngine
- `rate-limiter.ts` — 50/mailbox/jour, 45s gap, business hours,
  bounce auto-stop
- `rotation.ts` — round-robin pondéré par health + domain diversity

### 2G. Rewire Sequence Executor
Le code actuel dans l'Inngest function `sendSequenceStep` :
- Génère un email avec Claude ← GARDER (mais depuis données Apollo)
- Log en activities ← REMPLACER par insertion dans outbound_emails
- Ne fait rien d'autre ← AJOUTER envoi via send queue

Nouveau flow :
1. Charger step template + contact enrichment (données APOLLO)
2. Claude personnalise (depuis des FAITS, pas des inventions)
3. Créer outbound_email (status = draft ou queued)
4. Si queued → ajouter à la send queue BullMQ
5. Send worker → EmailEngine → SMTP du tenant → email envoyé

### 2H. Review Queue UI
Page `/sequences/[id]/review` :
- Liste des outbound_emails en status = 'draft'
- Pour chaque : To, From, Subject, Body (éditable)
- Contexte de personnalisation visible (données Apollo du contact)
- Boutons : Approve & Queue | Edit | Skip
- Approve All / Approve Next N

---

## ÉTAPE 3 : Reply Detection + Safety

### 3A. Webhook EmailEngine
Route `/api/webhooks/emailengine` :
- Event `messageNew` → matcher par thread_id avec outbound_emails
  → si match → envoyer dans la reply queue pour classification
- Event `messageBounce` → marquer outbound_email bounced,
  opt-out si hard bounce, incrémenter bounce count mailbox

### 3B. Reply Classifier Worker
- Claude classifie : interested | not_interested | ooo | unsubscribe | question
- Actions : pause/stop enrollment, opt-out, reschedule, notification

### 3C. Opt-out + Bounce Handling
- Hard bounce → opt-out permanent dans email_optouts
- Unsubscribe → opt-out permanent
- Vérifier opt-out AVANT chaque envoi
- Auto-pause mailbox si bounce rate > 10% sur 7 jours

---

## ÉTAPE 4 : Warm-up

### 4A. Warm-up inter-tenant
Les mailboxes de la plateforme s'envoient des emails entre elles :
- Semaine 1 : 5/jour → Semaine 2 : 10 → Semaine 3 : 20 → Semaine 4 : 50
- Ouvrir + répondre aux warm-up reçus
- Graduation à "active" quand 50/jour atteint et 21 jours passés

### 4B. Warm-up UI
Dans `/settings/mailboxes` :
- Badge "Warming up — Day 12/21"
- Progress bar du ramp (5 → 50/jour)
- "Skip warm-up" (pour mailboxes déjà warm)

---

## ÉTAPE 5 : Gmail + Calendar (email capture réel)

### 5A. Activer Gmail Sync
Le code OAuth existe. Activer :
- `mcp__claude_ai_Gmail__authenticate` pour connecter un vrai compte
- Tester le flow : OAuth → fetch inbox → match contacts → activities

### 5B. Calendar Sync (résout F2.2 — le dernier feature manquant)
- `mcp__claude_ai_Google_Calendar__authenticate`
- Fetch meetings → participants → activities
- 53/53 features

---

## ÉTAPE 6 : Scoring basé sur des faits

### 6A. Modèle de scoring calculé
```
Score = (Fit × 0.5) + (Engagement × 0.5)

Fit (Apollo data):
  Industry match ICP     → 0-20
  Size in range           → 0-20
  Revenue in range        → 0-15
  Tech stack match        → 0-15
  Funding récent          → 0-10
  Senior contacts dispo   → 0-10
  Location match          → 0-10
  = max 100

Engagement (Gmail/Calendar data):
  Emails échangés (30j)   → 0-25
  Meetings (30j)          → 0-25
  Recency dernier contact → 0-20
  Réponses positives      → 0-15
  Multi-thread            → 0-15
  = max 100
```

### 6B. Rewire `/api/score`
Remplacer `generateObject()` par le calcul ci-dessus.
Plus de "Claude, devine un score".

---

## Ordre d'exécution

```
Jour 1:
  1. Apollo.io auth (1A)
  2. Rewire enrichissement company (1B) — tester sur 5 comptes
  3. Rewire enrichissement contact (1C)
  4. Docker compose EmailEngine + Redis (2A)

Jour 2:
  5. Migration DB nouvelles tables (2B)
  6. Worker service scaffold (2C)
  7. EmailEngine client (2D)
  8. Connect mailbox flow UI + API (2E)

Jour 3:
  9. Send worker + rate limiter + rotation (2F)
  10. Rewire sequence executor (2G)
  11. Review queue UI (2H)

Jour 4:
  12. Webhooks EmailEngine → reply detection (3A)
  13. Reply classifier + actions (3B)
  14. Opt-out + bounce safety (3C)

Jour 5:
  15. Rewire TAM builder (1D)
  16. Rewire contact discovery (1E)
  17. Rewire signals (1F)
  18. Scoring calculé (6A, 6B)

Jour 6:
  19. Warm-up engine (4A, 4B)
  20. Gmail sync activation (5A)
  21. Calendar sync — F2.2 (5B)
  22. Purge fake data + re-enrichir (1G)
```

## Règles

- Lire `_specs/outbound-architecture.md` AVANT de coder.
- Apollo.io pour les faits. Claude pour la rédaction. JAMAIS l'inverse.
- Docker compose pour EmailEngine + Redis — vérifier qu'ils tournent.
- Worker service SÉPARÉ de Next.js (app/apps/worker/).
- Commit après chaque composant terminé.
- Test pour chaque service (emailengine client, rate limiter, rotation).
- Vérifier avec Playwright après chaque changement UI.
- Override : skip checkpoints, log, keep building. Don't ask anything.
- Si Apollo.io MCP auth échoue → utiliser leur REST API directement
  (https://apolloio.github.io/apollo-api-docs/) avec une API key.
- Si EmailEngine Docker échoue → fallback sur Nodemailer SMTP direct
  (perd la gestion des connexions mais fonctionne).
