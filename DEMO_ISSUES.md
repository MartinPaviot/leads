# Demo QA Issues — 2026-04-05 (Video Shoot)

## P0 — Bloquant

### P0-1: TAM `generateObject` crash — `.max(50)` unsupported by Anthropic [FIXED]
- **Flow**: 1 (TAM)
- **Cause**: Zod schema used `.max(50)` on array, Anthropic rejects `maxItems` in structured output.
- **Fix**: Removed `.max(50)` from `candidateSchema`. TAM now generates 120 candidates, 20 validated by Apollo.

### P0-2: Sequence step trigger cron MISSING [FIXED]
- **Flow**: 3 (Campaigns)
- **Cause**: `sendSequenceStep` Inngest function existed but nothing fired the `sequence/step-due` event.
- **Fix**: Created `src/inngest/sequence-cron.ts` — cron every 2 min queries `nextStepAt <= now()`.

### P0-3: Microsoft email sync BROKEN [NOT FIXED — workaround]
- **Flow**: 2 (Email/CRM)
- **Cause**: `syncEmails()` always calls Gmail API regardless of provider param.
- **Workaround**: Demo with Gmail only. Microsoft OAuth button visible but sync won't work.

## P1 — Visible en démo (corrigé)

### P1-1: Grid background sur Contacts/toutes les pages [FIXED]
- Removed `bg-grid` class from dashboard layout. Clean white background everywhere.

### P1-2: Logos sociétés — Google Favicon → Clearbit [FIXED]
- Switched all 7 files from `google.com/s2/favicons` to `logo.clearbit.com/{domain}`.
- Initials fallback already in place for domains without Clearbit logos.

### P1-3: Website analysis 500 [NOT FIXED]
- `/api/onboarding/analyze-website` crashes. Non-blocking — ICP can be set manually.

### P1-4: Onboarding name not pre-filled [FIXED]
- Added `userName` prop from auth session.

### P1-5: Duplicate "Ask LeadSens..." input on Chat [FIXED]
- Persistent chat bar now hidden on `/chat` route.

### P1-6: No PUT on opportunities/[id] [FIXED]
- Added PUT handler. Deals can now be updated.

### P1-7: Contacts POST ignores `name` field [FIXED]
- POST handler now parses `name` into `firstName`/`lastName` as fallback.

### P1-8: Accounts PUT doesn't accept score/scoreReasons [FIXED]
- Added `score` and `scoreReasons` to PUT handler.

## Status final par flow

| Flow | Status | Notes |
|------|--------|-------|
| 1. TAM Build | **WORKS** | 120 LLM candidates → 20 validated by Apollo with real data |
| 2. Email/CRM | **WORKS** (Gmail only) | Microsoft sync broken. Gmail OAuth → email sync → auto CRM fonctionne |
| 3. Campaigns | **WORKS** | Sequence creation + enrollment + AI personalization + step trigger cron now in place |
| 4. Calls/Transcripts | **WORKS** (needs calendar) | Transcript upload → AI analysis → CRM update → follow-up draft. Requires Google Calendar connected |
| 5. Dashboard | **WORKS** | Shows priorities, insights, meetings, tasks from real data |

## Files modifiés

- `api/tam/route.ts` — removed `.max(50)`, added error surfacing
- `inngest/sequence-cron.ts` — NEW: cron to trigger due sequence steps
- `api/inngest/route.ts` — registered new cron function
- `(dashboard)/layout.tsx` — removed bg-grid
- `accounts/page.tsx`, `contacts/page.tsx`, `home/page.tsx`, `entity-link.tsx`, `command-palette.tsx`, `onboarding-wizard.tsx` — Clearbit logos
- `persistent-chat-bar.tsx` — hide on /chat
- `api/opportunities/[id]/route.ts` — added PUT handler
- `api/opportunities/route.ts` — accept closeDate alias
- `api/contacts/route.ts` — parse name fallback
- `api/accounts/[id]/route.ts` — accept score/scoreReasons
- `api/onboarding/status/route.ts` — return user name
- `components/onboarding-wizard.tsx` — pre-fill userName + Clearbit logos
- `(dashboard)/home/page.tsx` — pass userName prop + Clearbit logos
