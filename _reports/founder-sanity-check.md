# Founder Sanity Check Report

**Date:** 2026-04-01
**Branch:** main (merged from feat/fix-chat-data-pipeline)
**Status:** Pre-verification — documenting fixes applied

---

## Fixes Applied (6 commits, 1,652 lines added)

### FIX 1: Chat Data Pipeline (CRITICAL)

**Problem:** Chat showed "Analyzed data" then "I don't have access to CRM data."

**Root causes found:**
1. `searchSimilar()` had NO tenantId filter — security hole + returned wrong data
2. Chat relied solely on RAG with no direct DB context
3. No tool use — chat couldn't query DB or create records
4. Inngest enrichment hardcoded "default" as tenantId for embeddings

**Fixes applied:**
- `searchSimilar()` now accepts and filters by tenantId
- Chat builds CRM snapshot (counts + recent records) in system prompt
- Added 11 AI tools: searchCRM, queryContacts/Accounts/Deals/Activities, createContact/Account/Deal, getDealCoaching, getAccountIntelligence
- Uses AI SDK v6 `stopWhen(stepCountIs(5))` for multi-step tool use
- Fixed embedEntity calls to use real tenantId

**Files:** `chat/route.ts`, `embeddings.ts`, `functions.ts`, `search/route.ts`, `search/tam/route.ts`

### FIX 2: Auto-Sync Pipeline

**Problem:** OAuth scopes existed. Sync APIs existed. Nothing triggered.

**Fixes applied:**
- Google OAuth completion fires `google/oauth-connected` Inngest event
- Initial sync does 2-year email backfill + calendar sync
- Email sync auto-creates contacts from unknown senders (skips noreply)
- Every synced email/meeting creates an activity record + auto-embedded in pgvector
- Cron every 15 min syncs new emails/events for all connected users

**New Inngest functions:** syncEmails, syncCalendar, onGoogleOAuthConnected, cronSyncEmails

**Files:** `sync-functions.ts`, `inngest/route.ts`, `auth.ts`

### FIX 3: Onboarding Day 1 TAM

**Problem:** New user signs up and sees empty pages.

**Fixes applied:**
- Dashboard detects new user (0 accounts, 0 contacts)
- Shows onboarding wizard: Welcome → ICP Questions → Building → Connect Gmail → Done
- ICP answers → Apollo Org Search → real companies created
- Auto-scores all accounts (fit + engagement scoring)
- Auto-embeds all companies for RAG search
- User sees populated product in ~2 minutes

**Files:** `onboarding/status/route.ts`, `onboarding-wizard.tsx`, `page.tsx`

### FIX 4: Customer Memory

**Problem:** Infrastructure existed (4%) but nothing worked together.

**Fixes applied:**
- Contact creation API fires enrichment + auto-embeds for RAG
- Account detail API returns contacts + merged activity timeline (company + related contact activities)
- Chat citations with clickable links: `[Name](/contacts/{id})`
- Chat instructed to use queryActivities for exact date lookups

**Files:** `contacts/route.ts`, `accounts/[id]/route.ts`, `chat/route.ts`

### FIX 5: Coaching

**Problem:** Generic sales advice, not data-driven coaching.

**Fixes applied:**
- getDealCoaching tool: fetches deal + contact + company + ALL activities, calculates risk level
- getAccountIntelligence tool: score breakdown, real signals (funding, tech stack), contacts, activity
- System prompt coaching behavior: references SPECIFIC dates, interactions, data points
- "Why this account" uses real score_fit_reasons and score_engagement_reasons

**Files:** `chat/route.ts`

### FIX 6: Remaining Audit Failures

**Fixes applied:**
- Contextual page titles for all 9 routes (Accounts, Contacts, Chat, Pipeline, etc.)
- Sidebar overflow fix (min-h-0 on nav)
- In-memory rate limiter with cleanup (chat: 30 req/min/user)
- Feature flags API: /api/features shows which integrations are configured
- Graceful degradation: missing env vars don't break the product

**Files:** 9 layout files, `rate-limit.ts`, `features/route.ts`, `layout.tsx`

---

## Expected Improvements by Category

| Category | Before | Expected After |
|----------|--------|----------------|
| 6. UX/UI | 39% (9/23) | ~57% (13/23) |
| 7. Onboarding | 0% (0/8) | ~62% (5/8) |
| 8. Customer Memory | 4% (0.5/12) | ~42% (5/12) |
| 9. Coaching | 0% (0/6) | ~50% (3/6) |
| 10. Chat & AI | 20% (4/20) | ~60% (12/20) |
| 21. Founder Sanity | 0% (0/11) | ~36% (4/11) |

**Overall estimated:** 17% → ~50% (significant but requires real data + Gmail connection for full validation)

---

## What Still Needs Real Testing

These fixes build the pipelines and tools. Full validation requires:
1. **Gmail OAuth connection** — to test email sync end-to-end
2. **Apollo API key** — to test TAM building with real companies
3. **Inngest running** — to test background job execution
4. **Real data in DB** — to test chat responses, coaching, citations

## Items Deferred to Martin (Manual)

- Azure app registration (Microsoft OAuth)
- Slack app creation (reCAPTCHA blocks automation)
- Recall.ai email verification
- Stripe account activation
- Vercel + PostHog account setup

All integration code assumes API keys exist in .env.local. Feature flags hide unavailable integrations.

---

## Architecture Summary

```
User signs up
  → resolveUserTenant() creates tenant + user
  → Dashboard loads, detects new user (0 accounts)
  → OnboardingWizard appears:
      1. ICP questions (product, buyer, size, geography)
      2. POST /api/tam → Apollo search → companies created
      3. POST /api/score → fit+engagement scoring
      4. POST /api/embed → pgvector embeddings
  → Prompts Gmail connection
  → auth.ts fires google/oauth-connected
  → Inngest: syncEmails (2yr backfill) + syncCalendar
      → Auto-creates contacts from email senders
      → Creates activity records for every email/meeting
      → Embeds all activities in pgvector
  → Cron: every 15 min, syncs new emails/events

Chat:
  → Builds CRM snapshot (counts + recent records)
  → RAG search with tenantId filter
  → 11 tools for querying/creating/coaching
  → Citations with clickable links
  → Rate limited (30/min/user)
```
