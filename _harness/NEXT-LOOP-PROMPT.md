# Next Loop: Real Outbound Pipeline + Real Data Sources

## Le problème
8/10 data pipelines sont FAKE (Claude invente tout). Le système
outbound ne peut pas envoyer un seul email. On a un beau shell UI
mais zéro workflow réel.

## STATE SNAPSHOT (2026-04-01):
- Branch: main, commit 26f4e5a
- 52/53 features, 99 tests, production build OK
- FAKE: enrichissement, scoring, signaux, TAM, contact discovery
- REAL: Gmail sync (read), pgvector search, Inngest jobs
- MANQUANT: Gmail send, outbound emails table, sequence execution
- Specs: `_specs/outbound-architecture.md` (lire en premier)
- Dev: `cd app/apps/web && npx next dev --port 3002`
- Auth: credentials (email: any, password: any)
- MCP: Apollo.io + Gmail + Google Calendar disponibles

## ÉTAPE 1 : Connecter Apollo.io (source de vérité)

Apollo.io remplace Claude pour toutes les données factuelles.

### 1A. Authentifier Apollo.io
- Appeler `mcp__claude_ai_Apollo_io__authenticate`
- Explorer les tools disponibles après auth
- Documenter les endpoints utiles

### 1B. Rewire `/api/enrich` → Apollo Organizations API
- Chercher par nom + domaine
- Récupérer: industry, employee_count, revenue, description,
  technologies, funding_total, linkedin_url, founded_year
- Stocker les vraies données dans companies table
- Fallback Claude SEULEMENT si Apollo ne trouve pas

### 1C. Rewire `/api/enrich-contacts` → Apollo People API
- Chercher par email ou (name + company)
- Récupérer: title, email_verified, phone, linkedin, department,
  seniority, city, state
- Remplacer les titres inventés par des vrais

### 1D. Rewire `/api/tam` → Apollo Organization Search
- ICP description → traduire en filtres Apollo
  (industry, employee_range, revenue_range, technologies)
- Retourner de VRAIES entreprises, pas des noms inventés
- Auto-enrichir chaque résultat

### 1E. Rewire `/api/accounts/[id]/suggested-contacts` → Apollo People Search
- Chercher les vrais contacts chez une entreprise (par domain)
- Afficher vrais noms, vrais titres, vrais emails vérifiés

### 1F. Rewire `/api/signals` → Apollo + données enrichment
- Signaux basés sur des FAITS Apollo (funding, hiring, tech changes)
- Claude INTERPRÈTE les faits, ne les invente pas
- Sources = URLs réelles vers LinkedIn, Crunchbase, etc.

## ÉTAPE 2 : Construire le vrai outbound (lire `_specs/outbound-architecture.md`)

### 2A. Migration DB : table `outbound_emails`
```sql
outbound_emails (
  id, tenant_id, enrollment_id, contact_id, step_number,
  subject, body_html, body_text,
  gmail_message_id, gmail_thread_id,
  status (draft/queued/sending/sent/bounced/replied),
  sent_at, replied_at, bounced_at,
  reply_classification, reply_message_id,
  created_at, updated_at
)
```

### 2B. Gmail Send Service (`lib/gmail-send.ts`)
- Utiliser l'OAuth token stocké par NextAuth (table auth_accounts)
- `gmail.users.messages.send` avec raw RFC 2822 message
- Thread management (follow-up = même thread_id + In-Reply-To)
- Retourner message_id + thread_id

### 2C. Rewire `sendSequenceStep` (Inngest)
Actuellement: génère email → log en activities → c'est tout.
Nouveau flow:
1. Charger step template + contact enrichment (Apollo data)
2. Charger historique interactions (Gmail sync data)
3. Claude personnalise (depuis VRAIES données)
4. Créer outbound_email:
   - Mode REVIEW → status = 'draft'
   - Mode AUTOPILOT → status = 'queued'
5. Si queued: vérifier rate limit → Gmail Send → status = 'sent'
6. Stocker gmail_message_id + thread_id
7. Update enrollment (currentStep++, nextStepAt)

### 2D. Sequence Executor Cron (Inngest)
```
Toutes les 5 min:
1. SELECT enrollments WHERE next_step_at <= NOW AND status = 'active'
2. Pour chaque: run sendSequenceStep
3. Vérifier rate limits AVANT chaque envoi
```

### 2E. Reply Matcher
Greffer sur le Gmail Sync existant:
1. Email entrant → chercher thread_id dans outbound_emails
2. Si match → classifier avec Claude (positive/negative/ooo/unsubscribe)
3. Agir: pause/stop enrollment, notifier, créer activité

### 2F. Review Queue (`/sequences/[id]/review`)
Page UI:
- Liste des outbound_emails en status = 'draft'
- Pour chaque: To, Subject, Body (editable)
- Boutons: Approve & Send | Edit | Skip
- Approve → status = 'queued' → envoi au prochain cycle

### 2G. Rate Limiter
- Max 50 emails/jour (configurable dans Settings > Agent)
- Min 45s entre chaque envoi
- Heures d'envoi: 8h-18h (configurable)
- Jours: Lun-Ven (configurable)
- Auto-stop si bounce rate > 10% sur 24h

### 2H. Real Deliverability Dashboard
Remplacer les métriques fake:
- Sent = COUNT outbound_emails WHERE sent
- Replied = COUNT WHERE replied_at NOT NULL
- Bounced = COUNT WHERE bounced
- Health score basé sur vrais ratios

## ÉTAPE 3 : Connecter Gmail + Calendar

### 3A. Gmail Auth
- Utiliser `mcp__claude_ai_Gmail__authenticate`
- OU utiliser l'OAuth Google existant (déjà configuré)
- Vérifier que le scope inclut `gmail.send` (pas juste `gmail.readonly`)

### 3B. Calendar Sync (F2.2 — le seul feature bloqué)
- Utiliser `mcp__claude_ai_Google_Calendar__authenticate`
- Fetch meetings → participants → activities
- Résout le dernier feature manquant (53/53)

## ÉTAPE 4 : Scoring basé sur des faits

### 4A. Scoring calculé (remplace le LLM guessing)
```
Score = (Fit × 0.5) + (Engagement × 0.5)

Fit (Apollo data):
- Industry match ICP → +20
- Size in range → +20
- Revenue in range → +15
- Tech stack match → +15
- Funding récent → +10
- Location match → +10
- Senior contacts → +10

Engagement (Gmail/Calendar data):
- Emails échangés (30j) → 0-25
- Meetings (30j) → 0-25
- Recency dernier contact → 0-20
- Réponses positives → 0-15
- Multi-thread → 0-15
```

### 4B. Auto re-score (Inngest daily cron)
- Recalculer tous les scores chaque nuit
- Stocker trend data pour sparklines
- Trigger signal si score change > 10 points

## ÉTAPE 5 : Purger les fausses données

### 5A. Reset les colonnes fake
```sql
UPDATE companies SET
  industry = NULL, description = NULL, size = NULL,
  revenue = NULL, score = NULL, score_reasons = NULL
WHERE tenant_id = 'default';

UPDATE companies SET properties = '{}'
WHERE tenant_id = 'default';
```

### 5B. Re-enrichir avec Apollo
- Passer les 50 comptes dans le nouveau pipeline Apollo
- Passer les 100 contacts dans Apollo People
- Scorer avec le modèle calculé
- Détecter les vrais signaux

## Ordre d'exécution
1. Apollo.io auth (1A)
2. Rewire enrichissement company (1B) — tester sur 5 comptes
3. Table outbound_emails (2A)
4. Gmail Send Service (2B)
5. Rewire sendSequenceStep (2C) + Sequence Executor (2D)
6. Reply Matcher (2E)
7. Review Queue UI (2F)
8. Rate Limiter (2G)
9. Rewire enrichissement contact + TAM + contacts (1C-1E)
10. Rewire signaux (1F)
11. Real Deliverability (2H)
12. Gmail/Calendar auth (3A, 3B)
13. Scoring calculé (4A, 4B)
14. Purge + re-enrichir (5A, 5B)

## Règles
- Lire `_specs/outbound-architecture.md` AVANT de coder
- Claude = rédaction + interprétation. JAMAIS invention de faits.
- Commit après chaque composant terminé
- Test unitaire pour chaque nouveau service
- Vérifier avec Playwright après chaque changement UI
- Si Apollo.io auth échoue → essayer leur REST API directement
  (https://apolloio.github.io/apollo-api-docs/)
- Override: skip checkpoints, log, keep building. Don't ask anything.
