# Audit du parcours utilisateur — LeadSens

**Date :** 2026-04-13
**Méthode :** Inspection du code source uniquement (pas de dépendance aux specs/docs qui dérivent)
**Objectif :** Base pour que Martin pose ses exigences étape par étape et les compare aux concurrents

---

## Format de chaque étape

Pour chaque étape du parcours, ce document fournit :
1. **Nom de l'étape**
2. **Route(s) / fichier(s) clé(s)** — chemins exacts + lignes
3. **État actuel** — ce que fait vraiment le code
4. **Manquant** — stubs, TODO, placeholders, features référencées mais absentes
5. **Points de blocage** — friction UX, dead-ends, erreurs non gérées, absences de loading/empty states
6. **Points forts** — ce qui est déjà différenciant ou bien construit

---

## PHASE 1 — ENTRÉE & AUTHENTIFICATION

### 1.1 Landing / Marketing
**Route :** `app/apps/web/src/app/(marketing)/*` — **à inspecter**
**État :** Non audité dans cette passe.
**À faire :** Relancer une exploration ciblée sur ce groupe.

---

### 1.2 Sign Up
**Fichier :** `apps/web/src/app/sign-up/page.tsx:1-222`

**État actuel :**
- Logo Elevay hardcoded (`/logo-Elevay.svg`, ligne 77)
- 3 voies : Google OAuth, Microsoft Entra OAuth, Email/password
- OAuth → redirige vers `/home` après succès (lignes 86-140)
- Email/password : validation (min 6 chars), bcrypt hash, insert dans `authUsers` + `authAccounts` (lignes 25-58)
- Email/password → redirige vers `/sign-in?registered=true` (ligne 60) — pas de login auto
- Erreurs gérées : `EmailExists`, `MissingFields`, `PasswordTooShort` (lignes 12-17)

**Manquant :**
- Aucun envoi d'email de confirmation
- Aucune vérification d'email avant accès au dashboard
- Aucun lien "Forgot password"
- OAuth ne valide pas les champs métier (nom, entreprise, rôle)

**Points de blocage :**
- **Friction post-signup email/pwd** : redirige vers `/sign-in` au lieu d'auto-login
- Pas de loading state visible pendant création
- Erreurs API sans feedback (try/catch sans toast)
- Règle mot de passe très permissive (6 chars)

**Points forts :**
- OAuth rapide (Google + Microsoft) en un clic
- Validation email déjà pris
- bcrypt correctement utilisé

---

### 1.3 Sign In
**Fichier :** `apps/web/src/app/sign-in/page.tsx:1-156`

**État actuel :**
- Google + Microsoft OAuth → `/home`
- Email/password : `signIn("credentials", formData)` (lignes 91-102)
- Sur AuthError → `/sign-in?error={type}` (ligne 98)
- Lien vers ToS + Privacy Policy (lignes 147-150)
- Lien vers sign-up

**Manquant :**
- Pas de "Forgot password" / reset flow
- Gestion détaillée des erreurs non visible (affichage du `?error=` pas inspecté)
- Pas de loading state sur soumission

**Points de blocage :**
- **Pas de recovery** si mot de passe perdu → utilisateur bloqué définitivement
- Messages d'erreur génériques (ne distingue pas email vs password invalide)

**Points forts :**
- OAuth social + email/pwd
- Liens légaux visibles

---

## PHASE 2 — ONBOARDING (post-signup)

### 2.1 Détection de l'onboarding
**Endpoint :** `GET /api/onboarding/status` (`apps/web/src/app/api/onboarding/status/route.ts:1-79`)

**Logique :**
- Compte en DB ? Companies=0 et Contacts=0 → `isNew = true`
- `tenant.settings.onboardingCompleted === false` ?
- `needsOnboarding = !onboardingCompleted && isNew`
- Retourne aussi `hasGoogle`, `hasMicrosoft`, `email`, `name`

**Appelé depuis :** Home page (ligne 128)

---

### 2.2 Onboarding Wizard (modale 7 étapes)
**Composant :** `apps/web/src/components/onboarding-wizard.tsx`

**Étapes :**
1. **welcome** — "Your profile" : Full name, Company name (pré-rempli depuis le domaine email), Role (défaut = Founder)
2. **connect** — "Connect" : offre connexion email/calendrier si hasGoogle/hasMicrosoft
3. **privacy** — "Sync settings" : backsync range (1m/3m/6m/12m), contact creation (selective/always/disabled), do-not-track domains
4. **product** — "Your product" : description, sales motion, AI tone, challenge (`Finding leads` / `Getting responses` / `Closing deals` / `Expanding accounts`)
5. **icp** — "Your customer" : industries, sizes, roles, geographies (PillSelect, TagInput, FreeTagInput)
6. **building** — "Building" : loading, lance enrichment + find contacts + email intelligence
7. **ready** — "Ready" : affiche {X} prospects + {Y} contacts, CTA "Go to dashboard"

**Endpoints appelés (inférés) :**
- `POST /api/onboarding/analyze-website`
- `POST /api/onboarding/find-contacts`
- `POST /api/onboarding/enrich-icp`
- `POST /api/onboarding/email-intelligence`
- `POST /api/onboarding/save`

**Manquant :**
- Détail des endpoints API non inspecté
- Pas de bouton "skip" visible (obligatoire ?)
- Pas de sauvegarde intermédiaire visible (abandon = tout perdu ?)

**Points de blocage :**
- **Processus long (7 étapes)** → risque de churn
- **Aucun skip** : utilisateur qui veut juste voir le produit doit tout remplir
- **Pas de gestion d'erreur visible** sur les jobs background (step 6)
- **Pas de progress granulaire** pendant "building" (step 6)

**Points forts :**
- Pré-remplissage intelligent (nom, domaine email)
- Détection automatique des connexions OAuth déjà faites
- Challenges pré-définis clairs (4 options)
- ICP couvert avec 4 dimensions (industry, size, role, geo)

---

## PHASE 3 — DASHBOARD (usage quotidien)

### 3.1 Layout dashboard
**Fichier :** `apps/web/src/app/(dashboard)/layout.tsx:1-88`

**État actuel :**
- Auth gate : `if (!session?.user) redirect("/sign-in")` (ligne 20)
- Sidebar + main + PersistentChatBar
- Pré-charge : user avatar, tenant name, 5 derniers chats
- Command palette + theme + toast providers

**Points de blocage :**
- **Catch silencieux sur DB down** (ligne 51 `catch { }`) → utilisateur voit des defaults sans savoir pourquoi

**Points forts :**
- Fallback gracieux si DB indisponible
- Données pré-chargées côté serveur (moins d'appels côté client)

---

### 3.2 Home — "Up next"
**Fichier :** `apps/web/src/app/(dashboard)/home/page.tsx:1-730`

**Appels API au mount (lignes 119-167) :**
- `GET /api/onboarding/status` → déclenche wizard si besoin
- `GET /api/dashboard/summary` → greeting, weekSummary, founderMetrics, todayTasks, todayMeetings
- `GET /api/actions` → priorités du jour
- `GET /api/insights` → business insights
- `GET /api/priorities` → hot contacts
- `GET /api/recommendations` → recos hebdo

**Sections :**

**Welcome banner (post-onboarding, lignes 201-247)**
- Affiche "Your sales engine is ready. {X} prospects, {Y} contacts"
- CTAs : "Review top accounts", "Launch a campaign", "Ask Elevay"
- Dismiss persistant via `localStorage.leadsens_welcomed`

**Weekly summary stats (lignes 248-286)**
- Si activité outbound > 0 → stats outbound (Sequences, Responses, Meetings, Closed)
- Sinon si founder data > 0 → stats founder (Accounts, Contacts, Pipeline, Deals)
- Sinon → rien

**Deals at risk (lignes 289+)**
- Max 3 deals "stalled" avec badge "Silent {X}d"
- Click → `/opportunities`

**Priorités du jour (lignes 337+)**
- Max 5 actions affichées
- Chaque action : titre, raison, priority badge, category badge
- Si contact → bouton "Draft email"
- Si 0 actions → 3 fallback suggestions hardcodées

**Today's schedule (right column, lignes 485+)**
- Today's meetings (depuis summary.todayMeetings)
- Hot contacts (top 5 depuis /api/priorities)
- This week recommendations (max 3 depuis /api/recommendations)
- Tasks due (depuis summary.todayTasks)

**Priority detail panel (slide-over right, lignes 616-703)**
- Trigger : click sur une action
- Contenu : badges, deal value, raison, dernier email subject+snippet, IA follow-up suggestion
- Footer : "Send follow-up" ou "View details"

**Manquant :**
- Aucun trend indicator (↑/↓ vs semaine précédente)
- Pas de lien depuis task vers détail
- Pas de mark-done depuis dashboard
- Panel non-resizable, pas d'édition inline

**Points de blocage :**
- **Max 5 actions** cap dur → priorités 6+ masquées
- **Deals at risk : max 3** → peut cacher la réalité
- **Click sur deal at risk → /opportunities (liste)** au lieu du détail du deal

**Points forts :**
- Vue dense, multi-widget, très riche
- Welcome banner contextuel intelligent
- Détection auto outbound vs founder-led
- IA follow-up draft directement accessible

---

### 3.3 Chat
**Fichier :** `apps/web/src/app/(dashboard)/chat/page.tsx:1-724`

**Empty state (ligne 294)**
- Icon Compass + "Good {morning/afternoon/evening}, {firstName}"
- 6 suggestions (API `/api/chat/suggestions` ou defaults hardcodés) :
  - "What should I focus on today?"
  - "Summarize my active opportunities"
  - "Which deals are at risk of stalling?"
  - "Draft a follow-up email to my last meeting"
  - "Who haven't I followed up with?"
  - "Research my top accounts to refine my ICP"

**Thread management :**
- Thread ID en URL `?thread={id}`
- Nouveau thread créé au premier message (ligne 136)
- Save auto via `POST /api/chat/threads/{id}` (ligne 147, 176-180)

**Message UI :**
- User : aligné droite, bg hover color, max 85% width
- AI : aligné gauche, label "Elevay" + Compass icon, Markdown, tool cards, copy button, follow-up suggestions, "Open in Composer" si email détecté

**Tool calls / action cards (lignes 505-528)**
- Types : `campaign`, `createContact`, `createAccount`, `createDeal`
- Status : pending / approved / dismissed
- Batch approval si 2+ pending (lignes 468-502)
- Approval flow : POST endpoint → mark approved → follow-up message au LLM pour créer records liés

**Input (lignes 669-688)**
- Text : placeholder "Ask Elevay...", disabled pendant streaming
- Voice : SpeechRecognition API en-US (lignes 208-231), fallback `alert()` si non supporté
- File : `.csv,.txt,.md,.json,.pdf`, max 2MB, premières 5000 chars injectées en contexte

**Erreur (lignes 610-637)**
- Banner rouge + bouton Retry qui re-envoie le dernier message

**Manquant :**
- Pas de typing indicator
- Pas de rename conversation
- Pas de delete conversation
- Pas de drag-drop pour fichiers
- Pas de multi-file

**Points de blocage :**
- **Silent failures** sur création (ligne 458 `catch { }`)
- **Pas de timeout visible** sur streaming
- **Voice non supporté → `alert()` popup** brutal (pas de design)
- Endpoints hardcoded (`/api/contacts`, etc.)

**Points forts :**
- Multi-modal (texte, voix, fichier)
- Action cards éditables avant approval
- Batch approval
- Workflow séquentiel (crée records liés après approval)
- Retry sur erreur

---

### 3.4 Accounts (TAM)
**Fichier :** `apps/web/src/app/(dashboard)/accounts/page.tsx:1-200+`

**État actuel :**
- Pagination `pageSize=200` (ligne 75)
- Filtres : `all` / `tam` / `manual`
- Bulk actions : Enrich all, Score all, Detect signals
- Carte compte : logo, nom, domaine, industry, size, revenue, score + reasons, last interaction, signals, custom fields
- Création : form Name + Domain → `POST /api/accounts`
- Enrichment single : `POST /api/enrich { companyIds: [id] }`
- Enrich all : filtre unenriched → POST batch
- Score all : filtre `score === null` → `POST /api/score`
- Signals : `POST /api/signals`
- Search sémantique : `POST /api/search/tam { query, entityType: "company", limit: 20 }`
- Slide-over detail : IntelligenceBrief component (non inspecté)
- Custom fields via `useCustomFields("company")`
- Signals avec reasoning + sources cliquables (popover)

**Manquant :**
- Code `IntelligenceBrief` non inspecté
- Pas de batch edit
- Pas de merge duplicates

**Points de blocage :**
- **Enrich/Score sans feedback visuel** pendant processing (juste un status state)
- **Semantic search sans query builder visuel**
- **Pas de cancel** sur opérations bulk

**Points forts :**
- Batch enrichment + scoring + signals
- Signals avec reasoning ET sources (différenciant)
- Custom fields extensibles
- Semantic search natif

---

### 3.5 Contacts
**Fichier :** `apps/web/src/app/(dashboard)/contacts/page.tsx:1-100+`

**État actuel :**
- `GET /api/contacts` (pagination pas visible)
- Carte contact : logo company, nom, title, company, email/phone/LinkedIn, score + reasons, last interaction, custom fields
- Create : form first/last/email/title/company/phone/LinkedIn
- Import : SmartImport (CSV/Excel, non inspecté)
- Import history : liste imports + stats (created/skipped/companies created)
- Enrich single / all

**Manquant :**
- SmartImport wizard non inspecté
- Pas de merge dupes visible
- Pas de batch edit

---

### 3.6 Sequences (outbound)
**Fichier :** `apps/web/src/app/(dashboard)/sequences/page.tsx:1-122`

**État actuel :**
- `GET /api/sequences`
- Carte séquence : name, description, status badge (active/paused/draft/archived), step count, enrolled count, sent count
- Click → `/sequences/{id}` (**détail non inspecté**)
- Create → CampaignWizard modal (**non inspecté**)

**Manquant :**
- Détail séquence + wizard non inspectés — à audit approfondi séparé

---

### 3.7 Meetings
**Fichier :** `apps/web/src/app/(dashboard)/meetings/page.tsx:1-100+`

**État actuel :**
- `GET /api/meetings?daysBack=30&daysForward=14`
- Carte : titre, time, attendees, calendar link, past/upcoming, recording URL, transcript status, notes summary
- Filtres : Upcoming vs Past
- Prep : click → `POST /api/meetings/prep { activityId }` → Markdown expandable cacheé localement
- Upload transcript : bouton vers `/meetings/upload` (**non inspecté**)

**Manquant :**
- Upload page non inspectée
- Pas de live meeting mode visible (juste prep)
- Affichage transcript final pas clair

---

### 3.8 Opportunities
**Fichier :** `apps/web/src/app/(dashboard)/opportunities/page.tsx:1-100+`

**État actuel :**
- Analytics : total deals, active, pipeline value, won value + count, lost count, win rate, avg deal value, avg velocity (days), value by stage, funnel, risk summary
- Carte deal : name, stage, value, company, owner, summary, expected close, risk level, custom properties
- Stages : lead → qualification → demo → trial → proposal → negotiation → won/lost
- Vues : Board (Kanban par stage) + Table (sortable, filterable)
- Filters : field, label, operator (eq, contains, gte, lte), value

**Manquant :**
- Filter builder UI non inspecté en détail
- Interaction drag-drop Kanban non confirmée

---

### 3.9 Settings (15+ sous-pages)
**Fichier principal :** `apps/web/src/app/(dashboard)/settings/page.tsx:1-173`

**Profile inspecté :**
- Champs : first name, last name, language (en/fr/de/es/pt/it/nl/ja/ko/zh), timezone (auto-detect ou liste)
- `PUT /api/settings/profile`
- Feedback "Saved" badge

**Sous-pages existantes mais NON inspectées :**
- `/settings/billing`
- `/settings/data-model`
- `/settings/evals` (**admin-only**)
- `/settings/icp`
- `/settings/knowledge`
- `/settings/mailboxes`
- `/settings/mail-calendar`
- `/settings/mcp` (**probablement admin**)
- `/settings/members`
- `/settings/notifications`
- `/settings/objects`
- `/settings/privacy`
- `/settings/recording`
- `/settings/stages`
- `/settings/workflows`
- `/settings/workspace`

**À faire :** audit dédié de chaque sous-page quand on en arrivera là.

---

## PHASE 4 — ERREURS & EDGE CASES

### 4.1 Expiration de session
- Layout dashboard redirige si `!session?.user` (ligne 20)
- Aucun refresh token flow visible
- Aucun message "Your session expired"
- **Risque :** déconnexion silencieuse en milieu de session

### 4.2 Erreurs API
**Pattern dominant :** `.catch(() => {})` silencieux
- Home actions fetch (ligne 150)
- Chat thread load (ligne 74)
- Onboarding status (ligne 139)

**Risque :** aucun feedback utilisateur sur API down, pas d'error boundaries visibles.

### 4.3 Empty states
- Home : 3 fallback suggestions si 0 actions
- Accounts : EmptyState + CTA "Create first account"
- Contacts : EmptyState
- Sequences : EmptyState "Pick your targets, draft personalized emails..."
- Meetings : EmptyState "Connect your calendar" si !calendarConnected
→ **globalement bien couvert**

### 4.4 Opérations lentes
- Enrich / Score / Signals / Semantic search / Chat streaming : **aucun timeout visible, aucun cancel, aucune progress bar**
- Utilisateur peut croire l'app gelée

---

## PHASE 5 — ADMIN & FEATURES CACHÉES

**Admin-only probables :** `/settings/evals`, `/settings/mcp`, `/settings/members`, `/settings/workspace`, `/settings/billing`
**Gates visibles côté UI :** non confirmées dans ce sample — probablement backend-enforced
**Feature flags :** endpoint `GET /api/features` existe, contenu non inspecté

---

## PHASE 6 — GAPS STRUCTURELS

**Hardcoded / placeholders :**
- Logo `/logo-Elevay.svg`
- Nom "Elevay" en dur
- Timezone defaults en dur
- Liste challenges en dur (4 options)

**Features absentes :**
- Password reset
- Team collaboration / invitations
- Shared views
- Intégrations UI (au-delà OAuth + calendrier)
- Custom record types (limité à companies/contacts/deals)

---

## PHASE 7 — POLISH & ACCESSIBILITÉ

- Form labels associés ✓
- Focus indicators : pas visibles dans les styles inspectés
- Keyboard navigation : pas audité
- ARIA : pas audité
- Toast après save : seulement profile confirmé
- Undo : absent
- Shortcuts : Command palette mentionnée, reste non audité
- Dark mode : theme provider présent, toggle pas visible
- Animations : skeleton loaders seulement

---

## TABLEAU SYNTHÈSE

| Phase | Couverture audit | Blocage principal | Point fort principal |
|---|---|---|---|
| Landing | 0 % | — | — |
| Sign-up | 100 % | Redirection post-signup vers `/sign-in` au lieu d'auto-login | OAuth double (Google + Microsoft) |
| Sign-in | 100 % | Pas de password reset | OAuth + email/pwd |
| Onboarding | 70 % | 7 étapes sans skip, pas de sauvegarde intermédiaire | Pré-remplissage intelligent, ICP 4-dim |
| Dashboard home | 80 % | Max 5 actions, click deal → liste pas détail | Vue dense multi-widget, welcome contextuel |
| Chat | 90 % | Silent failures sur creates, pas de timeout | Multi-modal, action cards éditables, batch approval |
| Accounts | 70 % | Enrich/score sans feedback visuel | Signals avec reasoning + sources |
| Contacts | 50 % | SmartImport non inspecté, pas de merge dupe | Import history |
| Sequences | 20 % | Wizard + détail non inspectés | Status lifecycle |
| Meetings | 30 % | Upload page non inspectée | Prep IA à la demande |
| Opportunities | 10 % | Filter builder non inspecté | Analytics + risk scoring |
| Settings (profile) | 100 % | — | i18n 10 langues, timezone auto |
| Settings (15 autres) | 0 % | — | — |

---

## AUDITS APPROFONDIS (complétés 2026-04-13)

Voir `_reports/audit-deep/` pour les rapports détaillés :

| Fichier | Couverture |
|---|---|
| `01-landing-admin-errors.md` | Landing `(marketing)/*`, routes admin, patterns d'erreurs transverses, refresh tokens, rate limiting |
| `02-onboarding-deep.md` | 7 étapes wizard + 9 endpoints `/api/onboarding/*` + jobs Inngest + 8 edge cases + 10 problèmes priorisés |
| `03a-sequences.md` | UI list/detail/review, Campaign Wizard 4 steps, 15 endpoints, schéma DB, 7 gaps critiques |
| `03b-contacts.md` | UI contacts, SmartImport (parsing + AI mapping + dédup), tous endpoints `/api/contacts` + `/api/import` + `/api/enrich-contacts` |
| `03c-accounts.md` | UI accounts, IntelligenceBrief, Enrichment, Scoring (fit+engagement), Signals (Claude extended thinking), Semantic search pgvector |
| `04-meetings-opportunities.md` | Meetings (Recall.ai, prep, post-call, live), Opportunities (Kanban, analytics, risk scoring, filter builder) |
| `05-settings-all.md` | 18 sous-pages settings détaillées + 3 bugs critiques identifiés |
