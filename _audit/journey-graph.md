# Journey Graph — Elevay (v1, living doc)

Source : routes réelles (`app/apps/web/src/app/**/page.tsx`) + nav réelle (`components/sidebar.tsx`, `settings/settings-sidebar.tsx`) au 2026-06-05.
v1 = écrit avant le walk live ; les statuts de couture seront remplis pendant le walk Playwright.

## Nœuds (features)

### Entry funnel (acquisition → activation)
- F1 `/(marketing)` Landing
- F2 `/sign-up`
- F3 `/verify-email` (+ `/verify-email-sent`)
- F4 `/onboarding-v3` (+ modal onboarding / HomeSetupCard)
- F5 `/sign-in` (+ `/forgot-password`, `/reset-password`)
- F6 `/accept-invite`

### Setup (config ICP, post-activation)
- C1 `/settings/icp` (ICP & Product)
- C2 `/settings/icp-profiles`

### CRM
- N1 `/accounts` — liste / TAM
- N2 `/accounts/[id]` — fiche compte
- N3 `/accounts/[id]/brain` — "brain" compte
- N4 `/contacts` — liste
- N5 `/contacts/[id]` — fiche contact
- N6 `/contacts/merge` — dédup
- N7 `/opportunities` — pipeline
- N8 `/opportunities/[id]` — fiche deal
- N9 `/proposals`

### Engage (exécution outbound)
- N10 `/inbox`
- N11 `/call-mode`
- N12 `/sequences` — Campaigns
- N13 `/sequences/[id]` (+ `/sequences/[id]/review`, `/sequences/review`)
- N15 `/deliverability`

### Activity / Orchestration
- N16 `/` — Up next / Home (ORCHESTRATEUR — pivot de toutes les coutures)
- N17 `/cs/today`
- N18 `/meetings` — N19 `/meetings/[id]`
- N20 `/notes`
- N21 `/tasks`
- N22 `/insights` — N23 `/insights/hot-to-call` — N24 `/insights/playbook` — N25 `/insights/pilae`
- N26 `/reports`

### AI (transverse)
- N27 `/chat` (+ command palette ⌘K)
- N28 `/knowledge`
- N29 `/skills`
- N30 `/voice-of-customer`
- N31 `/graph`

### Settings / Gouvernance
- ~27 sous-pages (`/settings/*` + `/settings/autonomy`, `/pricing`) — détaillées dans `code-analysis/settings.md`. Focus audit : lesquelles **pilotent réellement** le produit (guardrails, agent, autonomy, signals, workflows, capture-approvals) vs inertes.

Hors-flux (notés mais non audités pour la fluidité) : `/(legal)/*`, `/test-page`, `/pricing` (statique).

## Fil rouge GTM (le parcours canonique)

```
F1 Landing → F2 Sign-up → F3 Verify → F4 Onboarding(ICP)
   → N16 Home "Up next"
        │  (ICP → TAM)
        ▼
   C1 ICP ──> N1 Accounts ──> N2 Account ──> N4/N5 Contacts
        │                          └─> N3 Brain
        ▼
   N22/N23 Insights (hot-to-call / playbook)
        │  (qui appeler / quoi dire)
        ▼
   N11 Call Mode  |  N12/N13 Campaigns  ──> N10 Inbox (réponses)
        │
        ▼
   N18/N19 Meetings ──> N20 Notes + N21 Tasks ──> N7/N8 Opportunities ──> N9 Proposals
        │
        ▼
   N26 Reports / N22 Insights (boucle)

Transverses sur TOUT : N27 Chat, N28 Knowledge, N29 Skills, ⌘K, NotificationBell, capture-approvals.
```

## Table des coutures attendues (à noter pendant le walk)

Statut/score/sévérité/preuve = TBD (remplis au live). Score : 1.0 traverse / 0.5 partiel / 0.0 cul-de-sac.

### Funnel (E)
| id | de → vers | comportement attendu | score | sév | preuve |
|----|-----------|----------------------|-------|-----|--------|
| E1 | sign-up → verify-email | redirige + état "email envoyé" clair | TBD | | |
| E2 | verify-email → onboarding | le lien/token entre directement dans l'onboarding | TBD | | |
| E3 | onboarding → home | l'ICP saisi est persisté ET visible au home | TBD | | |
| E4 | onboarding(ICP) → accounts/TAM | l'ICP filtre/déclenche réellement la liste de comptes | TBD | | |
| E5 | accept-invite → home | le membre rejoint le bon tenant, atterrit utile | TBD | | |

### Cœur GTM (S)
| id | de → vers | comportement attendu | score | sév | preuve |
|----|-----------|----------------------|-------|-----|--------|
| S1 | Home card → cible | chaque carte "Up next" deep-link AVEC le contexte de l'entité | TBD | | |
| S2 | ICP → Accounts | sauver l'ICP rafraîchit/filtre la TAM | TBD | | |
| S3 | Accounts → Account detail | contexte préservé, retour facile | TBD | | |
| S4 | Account detail → Contacts | les contacts du compte sont listés/enrichis (pas de cul-de-sac) | TBD | | |
| S5 | Account detail → Brain | le brain agrège réellement signaux/historique du compte | TBD | | |
| S6 | Contacts → Contact detail | contexte préservé | TBD | | |
| S7 | Contact detail → Call Mode | "appeler" pré-charge n° + signaux + script | TBD | | |
| S8 | Contact/Account → Campaign | enrôler pré-rempli depuis le CRM (pas de ressaisie) | TBD | | |
| S9 | Insights/hot-to-call → Call Mode | "appeler maintenant" charge la cible + le pourquoi | TBD | | |
| S10 | Insights/playbook → action | le playbook propose une action exécutable (pas read-only) | TBD | | |
| S11 | Call Mode → outcome → Notes/Tasks/Deal | fin d'appel = log + follow-up + avancée deal | TBD | | |
| S12 | Campaign → Inbox | les réponses reviennent rattachées au contact/thread | TBD | | |
| S13 | Inbox reply → Task/Opportunity | transformer une réponse en next step / deal | TBD | | |
| S14 | Meeting → Notes/Tasks/Deal | résumé auto + follow-ups + mouvement de stage | TBD | | |
| S15 | Opportunity → Proposal | générer la proposale pré-remplie depuis le deal | TBD | | |
| S16 | Proposal → suivi → Opportunity | envoi/tracking renvoie l'état dans le deal | TBD | | |
| S17 | Notes/Tasks → entité liée | back-link vers account/contact/deal | TBD | | |
| S18 | Reports/Insights → drill | descendre jusqu'aux enregistrements sous-jacents | TBD | | |

### Transverses (X) & gouvernance (G)
| id | de → vers | comportement attendu | score | sév | preuve |
|----|-----------|----------------------|-------|-----|--------|
| X1 | ⌘K command palette → entité | sauter vers n'importe quel enregistrement | TBD | | |
| X2 | Chat → action CRM | le chat AGIT (task/email/enroll/deal/proposal), pas juste répond | TBD | | |
| X3 | Chat → Knowledge | le chat retrieve la knowledge base (citations) | TBD | | |
| X4 | Skills → invocation | les skills sont invocables (depuis chat ? une page ?) | TBD | | |
| X5 | NotificationBell → source | la notif deep-link vers l'item déclencheur | TBD | | |
| X6 | capture-approvals → CRM | la donnée approuvée atterrit dans le CRM (human-in-loop) | TBD | | |
| X7 | Voice-of-customer → Insights/Knowledge | les signaux VoC alimentent un consommateur | TBD | | |
| G1 | Guardrails/Agent/Autonomy → Engage | ces réglages contraignent réellement les actions outbound | TBD | | |
| G2 | LLM budget/evals → observabilité | admin voit coût/qualité réels | TBD | | |
