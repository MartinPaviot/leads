# Next Loop: Real Data Pipeline — Stop Faking, Start Building

## Le problème
52 features existent mais 8/10 pipelines de données sont FAKE. Claude
invente des enrichissements, des signaux, des contacts, des scores.
Le produit est un simulacre. Objectif : brancher de vraies sources de
données pour que le workflow soit réel de bout en bout.

## STATE SNAPSHOT (2026-04-01):
- Branch: main, commit 7d5724e
- 52/53 features, 99 tests, build OK
- DB: Supabase PostgreSQL, 50 comptes (enrichis par Claude = fake),
  100 contacts (CSV import = real structure, fake enrichment),
  10 deals (seeded manuellement)
- Auth: credentials + Google OAuth configuré
- API keys dispo: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_CLIENT_ID/SECRET
- API keys MANQUANTES: RESEND_API_KEY, REDIS_URL
- MCP tools dispo: Apollo.io, Gmail, Google Calendar, Playwright

## AUDIT: Fake vs Real

| Pipeline | Actuel | Cible |
|----------|--------|-------|
| Enrichissement company | FAKE (Claude invente) | REAL (Apollo.io API) |
| Enrichissement contact | FAKE (Claude invente) | REAL (Apollo.io API) |
| Contact discovery | FAKE (Claude invente) | REAL (Apollo.io people search) |
| Signaux | FAKE (Claude invente) | REAL (Apollo.io intent + web scraping) |
| Scoring | FAKE (LLM devine) | REAL (scoring basé sur engagement + fit) |
| TAM Builder | FAKE (Claude invente) | REAL (Apollo.io company search par ICP) |
| Email Sync | REAL (Gmail OAuth) | Activer + tester avec vrai compte |
| Calendar Sync | BLOCKED | REAL (Google Calendar API, MCP dispo) |
| Email Sending | FAKE (log en DB) | REAL (Resend API) |
| Search | REAL (pgvector) | OK — garder tel quel |

## PRIORITÉ 1 : Apollo.io — Le vrai enrichissement

Apollo.io est LA source de données pour un GTM engine. MCP tool dispo.

### 1A. Authenticate Apollo.io
- Utiliser `mcp__claude_ai_Apollo_io__authenticate`
- Obtenir les credentials API
- Stocker la clé dans .env.local (APOLLO_API_KEY)

### 1B. Rewire Company Enrichment
Remplacer le prompt Claude par un vrai appel Apollo.io :
- `POST /api/enrich` → Apollo Organizations API
- Récupérer : domain, industry, employee_count, annual_revenue,
  founded_year, description, technologies, funding, linkedin_url
- Mapper vers notre schéma companies
- Fallback Claude si Apollo rate limit / pas de résultat

### 1C. Rewire Contact Enrichment  
- `POST /api/enrich-contacts` → Apollo People API
- Récupérer : name, title, email (vérifié), phone, linkedin,
  department, seniority_level
- Enrichir les 100 contacts existants avec des vraies données
- Fallback Claude pour structurer si nécessaire

### 1D. Rewire Contact Discovery
- `POST /api/accounts/[id]/suggested-contacts` → Apollo People Search
- Chercher les contacts réels chez une entreprise (par domain)
- Afficher vrais noms, vrais titres, vrais emails
- Plus de "realistic but fictional names"

### 1E. Rewire TAM Builder
- `POST /api/tam` → Apollo Organization Search
- ICP description → filtres Apollo (industry, size, tech, location)
- Retourner de VRAIES entreprises qui matchent l'ICP
- Auto-enrich chaque résultat

### 1F. Rewire Signal Detection
- Apollo.io a des intent signals (Job Changes, Funding, Tech Install)
- `POST /api/signals` → Apollo Intent + enrichment data
- Signaux basés sur des faits (funding round réel, hiring LinkedIn réel)
- Garder Claude uniquement pour INTERPRETER les signaux, pas les inventer

## PRIORITÉ 2 : Gmail — Le vrai email capture

### 2A. Activer Email Sync
- Le code OAuth existe déjà (email/sync/route.ts)
- Utiliser `mcp__claude_ai_Gmail__authenticate` pour connecter un compte
- Tester le flow : OAuth → fetch inbox → parse → match contacts → store

### 2B. Activer Calendar Sync
- Utiliser `mcp__claude_ai_Google_Calendar__authenticate`
- Implémenter la route calendar sync (F2.2 — actuellement bloquée)
- Fetch meetings → extract participants → create activities

### 2C. Real Activity Pipeline
Une fois email + calendar connectés :
- Chaque email reçu/envoyé → activity record
- Chaque meeting → activity record
- Timeline sur les contacts/deals se remplit automatiquement
- Dashboard "Your priorities" basé sur de vrais meetings/emails

## PRIORITÉ 3 : Scoring Réel (basé sur engagement)

### 3A. Scoring basé sur des faits, pas du LLM
Remplacer le scoring LLM par un modèle calculé :
```
Score = (Fit Score × 0.5) + (Engagement Score × 0.5)

Fit Score (de Apollo) :
- Industry match avec ICP → +20
- Size dans range ICP → +20  
- Revenue dans range → +15
- Tech stack match → +15
- Funding récent → +10
- Location match → +10
- Seniority contacts → +10

Engagement Score (de Gmail/Calendar) :
- Emails échangés (30j) → 0-25
- Meetings (30j) → 0-25
- Temps depuis dernier contact → 0-20
- Réponses positives → 0-15
- Multi-thread (plusieurs contacts) → 0-15
```
Plus de "Claude, devine un score".

### 3B. Re-score automatique
- Inngest job : re-score tous les comptes chaque jour
- Score change → signal "Score increased" ou "Score dropped"
- Trend data stocké pour sparklines

## PRIORITÉ 4 : Email Sending Réel

### 4A. Configurer Resend
- Martin doit fournir RESEND_API_KEY
- Configurer un domaine d'envoi (ou utiliser onboarding domain Resend)
- Brancher `POST /api/emails` sur Resend API
- Tracker open/click/bounce/reply via webhooks Resend

### 4B. Deliverability réelle
- Le dashboard deliverability existe déjà
- Le brancher sur les vrais métriques Resend (opens, bounces, etc.)
- Plus de "0 emails sent yet" — de vrais chiffres

## PRIORITÉ 5 : Nettoyage des fausses données

### 5A. Purger les données Claude
- Supprimer les enrichissements fake (industry/description/size/revenue
  générés par Claude) des 50 comptes
- Reset scores à NULL
- Reset signals à []
- Garder : noms des comptes, contacts CSV, deals seeded

### 5B. Re-enrichir avec Apollo
- Passer les 50 comptes dans le nouveau pipeline Apollo
- Passer les 100 contacts dans Apollo People
- Scorer avec le nouveau modèle calculé
- Détecter les vrais signaux

## Ordre d'exécution
1. Apollo.io auth + API key (1A)
2. Rewire enrichissement company (1B) + tester sur 5 comptes
3. Rewire enrichissement contact (1C) + tester
4. Rewire TAM builder (1E) — tester avec un vrai ICP
5. Rewire contact discovery (1D)
6. Rewire signal detection (1F)
7. Gmail auth + email sync test (2A)
8. Calendar sync (2B)
9. Scoring réel (3A, 3B)
10. Purger fake data + re-enrichir (5A, 5B)
11. Email sending si Resend dispo (4A, 4B)

## Règles
- Override : skip checkpoints, log, keep building. Don't ask anything.
- Commit après chaque pipeline rebranché.
- Test unitaire pour chaque nouveau provider.
- Vérifier visuellement avec Playwright après chaque changement.
- Si Apollo.io auth échoue → documenter dans escalation.md et essayer
  des alternatives (Clearbit, Hunter.io, RocketReach, web scraping).
- Claude reste UNIQUEMENT pour : interpréter, résumer, rédiger. 
  JAMAIS pour inventer des données factuelles.
