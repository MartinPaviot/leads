# Exigences Parcours Utilisateur — 13 Étapes

**Date**: 2026-04-16
**Base**: Audit `_reports/audit-deep/` + vérification code actuel
**Méthode**: Pour chaque étape → état actuel (vérifié) → exigences (ce qui doit être vrai pour prod) → gaps réels

---

## Étape 1 — Landing / Marketing

**État actuel**: COMPLET. Page marketing animée, CTAs, SEO metadata, middleware redirect `/` auth → `/home`.

**Exigences (atteintes)**:
- [x] Hero avec proposition de valeur claire
- [x] CTAs : Try free, Log in, Book demo
- [x] SEO metadata (title, description, OG)
- [x] Redirect auth users vers /home
- [x] Legal links (terms, privacy, AUP)

**Gaps**: Aucun bloquant. Nice-to-have : pricing page détaillée, blog/content, customer logos.

---

## Étape 2 — Sign Up

**État actuel**: Fonctionnel. Google + Microsoft OAuth. Email/password avec bcrypt. Email verification EXISTS (`/verify-email`, `/verify-email-sent`). Password min 12 chars (M11).

**Exigences (atteintes)**:
- [x] OAuth social (Google + Microsoft)
- [x] Email/password avec hashing bcrypt
- [x] Email verification flow
- [x] Password policy : 12 chars min, digit + lower + upper
- [x] HIBP breach check (`isPasswordPwned`)
- [x] Invite token consumption on signup

**Exigences (manquantes)**:
- [ ] Auto-login après sign-up email/password (actuellement redirect vers /sign-in — friction)
- [ ] Collect metadata pendant OAuth sign-up (nom, company) si absent du provider

**Priorité gaps**: LOW. La friction redirect est mineure.

---

## Étape 3 — Sign In

**État actuel**: Fonctionnel. OAuth + credentials. Password reset EXISTS (`/forgot-password` → `/reset-password`). Account lockout (5 attempts / 15min). IP lockout (30 attempts / 1h).

**Exigences (atteintes)**:
- [x] OAuth social (Google + Microsoft)
- [x] Email/password credentials
- [x] Password reset flow (forgot → email → reset)
- [x] Account lockout (I6 : 5 fails / 15min)
- [x] IP lockout (L4 : 30 fails / 1h)
- [x] Edge-compatible crypto (Web Crypto API)

**Exigences (manquantes)**:
- [ ] Loading state on submit button (spinner)
- [ ] Distinction error message (email vs password) — actuellement générique pour anti-enumeration, OK pour security mais frustrant UX

**Priorité gaps**: LOW. Fonctionnel et sécurisé.

---

## Étape 4 — Onboarding (7 étapes)

**État actuel**: 85% complet. 7-step wizard progressif, smart pré-fill, per-step save, LLM double-pass. Bugs P1-P10 identifiés dont 5 high-priority.

**Exigences (atteintes)**:
- [x] 7 étapes progressives avec sauvegarde par étape
- [x] Pré-remplissage intelligent (domain email, website analysis)
- [x] ICP auto-fill depuis website analysis
- [x] TAM build via Apollo + LLM
- [x] Contact discovery (top 10 companies → Apollo people)
- [x] RAG embeddings pour semantic search
- [x] Inngest `onOnboardingCompleted` pour post-processing

**Exigences (manquantes)**:
- [ ] Retry button sur `/api/tam` failure (actuellement : retour silencieux à ICP)
- [ ] Timeout indicator (UI gelée >60s, pas de "Taking longer...")
- [ ] Await `score` avant de montrer "Ready" (actuellement fire-and-forget)
- [ ] Validation batch sur LLM responses (P10)

**Priorité gaps**: MEDIUM. L'onboarding fonctionne mais peut apparaître cassé si Apollo rate-limite.

---

## Étape 5 — Dashboard Home

**État actuel**: 90% complet. Multi-widget view riche : welcome banner, weekly summary, deals at risk, priorities, today's schedule, right panel detail.

**Exigences (atteintes)**:
- [x] Welcome banner post-onboarding avec métriques
- [x] Weekly summary stats
- [x] Deals at risk (max 3, stalled badges)
- [x] Today's priorities (max 5)
- [x] Meeting schedule
- [x] Right panel avec deal context + email draft
- [x] **NEW**: Daily deal brief via Inngest (7am cron)
- [x] **NEW**: Founder coaching brief (8am cron, D3)

**Exigences (manquantes)**:
- [ ] Mark-as-done depuis le dashboard (actuellement : click → navigate to entity)
- [ ] Afficher priorities 6+ (actuellement cap à 5)

**Priorité gaps**: LOW.

---

## Étape 6 — Chat

**État actuel**: 90% complet. Chat-first interface avec 11 tool groups, streaming, compacted messages, RAG, context graph search, citations.

**Exigences (atteintes)**:
- [x] Streaming LLM responses
- [x] 11 tool groups : schema, query, create, update, action, memory, intelligence, skills, undo, **briefing**, **coaching**
- [x] 28 skills accessible via chat
- [x] RAG semantic search with citations
- [x] Context graph entity extraction
- [x] Cross-session memory (chatMemories)
- [x] Shared prompts
- [x] **NEW**: Deal briefing (`briefAllDeals`, `briefDeal`)
- [x] **NEW**: Coaching insights (`getCoachingInsights`, `getMyPerformance`)
- [x] **NEW**: Verbatim search (`searchExactWords`)
- [x] **NEW**: Enriched context (`getEnrichedContext`)

**Exigences (manquantes)**:
- [ ] Aucune bloquante identifiée

**Priorité gaps**: NONE.

---

## Étape 7 — Accounts (TAM)

**État actuel**: 75% complet. List view + detail slide-over + semantic search + enrichment + scoring + signals.

**Exigences (atteintes)**:
- [x] Account list avec pagination client-side
- [x] Filter tabs (TAM / Manual / All)
- [x] Semantic search (pgvector HNSW)
- [x] Detail slide-over avec IntelligenceBrief
- [x] Custom fields dynamiques
- [x] Signal popover avec reasoning
- [x] **NEW**: NL Smart Search (P2)
- [x] **NEW**: Signal → Deal alerts (D1)

**Exigences (manquantes)**:
- [ ] **Bulk enrich feedback** — actuellement tronqué à 20 silencieusement. L'UI doit afficher "Enriching 20/100, batch in progress" ou augmenter le cap
- [ ] **Re-enrichment TTL** — données Apollo stalent après 30j, pas de re-fetch automatique
- [ ] **Engagement score inclut activités contacts** — actuellement company-only, miss les contacts actifs
- [ ] **Server-side sort/filter** sur `/api/accounts` — actuellement tout client-side

**Priorité gaps**: MEDIUM. Fonctionnel mais le silent truncation est un vrai problème produit.

---

## Étape 8 — Contacts + SmartImport

**État actuel**: 60% complet. List view + import + enrichment. Plusieurs gaps critiques.

**Exigences (atteintes)**:
- [x] Contact table avec 8 colonnes + custom fields
- [x] Status dots (enriching/done/failed)
- [x] Company logo + score badge
- [x] SmartImport (drag/drop + paste + file)
- [x] LLM auto-mapping pour import
- [x] **NEW**: NL Smart Search contacts (P2)

**Exigences (manquantes)**:
- [ ] **DELETE /api/contacts/[id]** — route absente, impossible de supprimer un contact
- [ ] **Pagination** — contacts >50 invisibles, pas de contrôles de pagination
- [ ] **Server-side sort** — colonnes non cliquables pour tri
- [ ] **Bulk actions** — pas de checkboxes, pas de delete/merge/export/tag/sequence en batch
- [ ] **SmartImport mapping review** — pas de step de validation avant commit, LLM foireux = données corrompues
- [ ] **SmartImport deduplication** — reimport crée des doublons purs
- [ ] **SmartImport events** — pas de `contact/created` event → contacts invisibles au chat/RAG
- [ ] **Contact detail edit** — page detail read-only, PUT orphelin

**Priorité gaps**: HIGH. Le DELETE absent + l'absence de pagination sont des blockers réels pour des usages au-delà de 50 contacts.

---

## Étape 9 — Sequences (Outbound)

**État actuel**: 80% complet. La série BUGFIX a ajouté le scheduler (`cronTriggerSequenceSteps`), l'email sending (`processOutboundEmails`, `sendSingleEmail`), le warmup, et les webhooks engagement.

**Exigences (atteintes)**:
- [x] Sequence CRUD (list, create, detail)
- [x] Campaign wizard 4-step (targets → generate → review → launch)
- [x] **Scheduler EXISTS** — `cronTriggerSequenceSteps` Inngest cron
- [x] **Email sending EXISTS** — `processOutboundEmails` + `sendSingleEmail`
- [x] **Engagement tracking EXISTS** — open/click tracking with signed tokens (M8)
- [x] **Reply handling EXISTS** — `handleReplyIntelligently`
- [x] **Warmup EXISTS** — daily reset, warmup progression
- [x] **Unsubscribe** — token-signed, one-click
- [x] **Mailbox health** — bounce/reply ratios, daily limits

**Exigences (manquantes)**:
- [ ] **Per-step analytics** — open/click/reply rates per step (pas juste global)
- [ ] **A/B testing** — pas de variant testing sur subject/body
- [ ] **Post-launch editing** — steps immutables après launch
- [ ] **Bulk unenroll** — pas de unenroll en batch

**Priorité gaps**: LOW. Le core fonctionne (scheduler + sending + tracking). Les gaps sont des améliorations.

---

## Étape 10 — Meetings

**État actuel**: 85% complet. Google Calendar sync, Recall.ai bots, transcript upload (Whisper), structured notes extraction, meeting prep, post-call actions.

**Exigences (atteintes)**:
- [x] Calendar sync (Google, 15min cron)
- [x] Recall.ai bot auto-scheduling (5min cron)
- [x] Transcript upload (audio + VTT/SRT + text)
- [x] AI extraction (structured notes, buying signals, sentiment)
- [x] Meeting prep on-demand (8-section doc)
- [x] Post-call actions (tasks, deal update, follow-up email)
- [x] SSRF allowlist on transcript download (M9)
- [x] Branded bot (WS-1)

**Exigences (manquantes)**:
- [ ] **Microsoft Calendar UI** — data synced via MS Graph mais pas exposée dans l'UI meetings
- [ ] **Follow-up email auto-send** — actuellement copy/paste, pas de send direct

**Priorité gaps**: MEDIUM. Microsoft Calendar UI est important pour les utilisateurs M365.

---

## Étape 11 — Opportunities (Pipeline)

**État actuel**: 80% complet. Dual-view (Kanban + Table), drag-drop, analytics, deal coaching, risk scoring.

**Exigences (atteintes)**:
- [x] Kanban view avec drag-drop stage transitions
- [x] Table view alternative
- [x] Analytics (win rate, avg deal value, velocity, value by stage)
- [x] Risk scoring (high/medium/low)
- [x] Deal coaching (contextual chat)
- [x] Activity timeline (50 max)
- [x] **NEW**: Deal briefing (C1)
- [x] **NEW**: 4 sales skills (scope-poc, draft-proposal, handle-objection, re-engage-stalled)
- [x] **NEW**: Autonomous pipeline (D2)
- [x] **NEW**: Insights dashboard (/insights) (C6)

**Exigences (manquantes)**:
- [ ] **Server-side filters** — actuellement client-side filter builder, pas de SQL
- [ ] **Deal audit log** — pas de historique stage changes avec timestamps
- [ ] **Intel extraction includes company activities** — actuellement deal-only
- [ ] **Time-windowed analytics** (Q/M/YTD) — actuellement all-time only
- [ ] **Forecast** — pas de projection revenue basée sur weighted pipeline

**Priorité gaps**: MEDIUM. Le core fonctionne, les gaps sont des améliorations analytiques.

---

## Étape 12 — Settings (18 pages)

**État actuel**: 90% complet. Les 3 bugs critiques identifiés dans l'audit sont fixés par la série BUGFIX.

**Exigences (atteintes)**:
- [x] Profile settings (name, language, timezone)
- [x] Billing (Stripe, plans, usage meters)
- [x] Data Model (custom fields, field types)
- [x] Evals (admin-gated, full dashboard)
- [x] ICP & Product
- [x] Knowledge base
- [x] **Mail & Calendar** — FIXED (BUGFIX-01: correct endpoint)
- [x] MCP integration (admin-gated)
- [x] **Members invite** — FIXED (BUGFIX-02: full invite flow)
- [x] Notifications (multi-channel)
- [x] Custom Objects
- [x] Recording (Recall.ai config)
- [x] Stages (pipeline stages)
- [x] **Workflows** — FIXED (BUGFIX-03: multi-action support)
- [x] Workspace
- [x] Agent (approval mode)
- [x] **Admin gates** — FIXED (BUGFIX-05: API-level 403)
- [x] **Security page** — password change with HIBP check

**Exigences (manquantes)**:
- [ ] **OAuth disconnect** — bouton "Disconnect" exists mais pourrait orphaner des données (hardening done, voir N15)
- [ ] **Workflow visual builder** — actuellement formulaire, pas de drag-drop node editor

**Priorité gaps**: LOW. Tout fonctionne.

---

## Étape 13 — Erreurs & Edge Cases

**État actuel**: 85% complet. BUGFIX-06 a adressé les silent failures. Error boundaries en place.

**Exigences (atteintes)**:
- [x] Error boundaries React (layout-level)
- [x] **Silent failures fixed** (BUGFIX-06)
- [x] Offline resilience (app shell survives)
- [x] Rate limiting (Upstash Redis + in-memory fallback)
- [x] CSRF protection (NextAuth)
- [x] XSS prevention on tracking URLs
- [x] Signed tracking tokens (M8)
- [x] Auth lockout (I6 + L4)
- [x] robots.txt expanded
- [x] E2E test infrastructure (Playwright + seed/cleanup)

**Exigences (manquantes)**:
- [ ] **Toast error feedback** systématique — certaines erreurs toujours silencieuses dans les pages
- [ ] **Sentry alerting** configuré (logger → Sentry pathway exists mais DSN peut ne pas être set)

**Priorité gaps**: LOW.

---

## Résumé Priorisation

| Priorité | Étapes | Action requise |
|----------|--------|----------------|
| **HIGH** | 8 (Contacts) | DELETE route, pagination, sort, bulk actions, SmartImport review step |
| **MEDIUM** | 4 (Onboarding), 7 (Accounts), 10 (Meetings), 11 (Opportunities) | Retry button, bulk feedback, MS Calendar UI, server filters |
| **LOW** | 1, 2, 3, 5, 6, 9, 12, 13 | Polish items, already functional |

**Conclusion**: L'étape 8 (Contacts) est le principal chantier restant. Le reste du parcours est fonctionnel pour un lancement prod.
