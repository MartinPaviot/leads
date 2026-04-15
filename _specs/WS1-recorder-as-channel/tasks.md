# WS-1 — Tasks

Ordered execution. Each task has verify step + test to write.
Match TaskList IDs where applicable.

## T1 — Migration 0016_notetaker_channel.sql

**Code** :
- Create `app/apps/web/drizzle/0016_notetaker_channel.sql` with:
  - `notetaker_exposures` table + 3 indexes
  - `tenant_referral_credits` table
  - `referral_credit_events` table
- Add drizzle schema entries in `app/apps/web/src/db/schema.ts` exporting:
  - `notetakerExposures`
  - `tenantReferralCredits`
  - `referralCreditEvents`
- Regenerate meta via `pnpm drizzle-kit generate` (confirm no diff surprises)

**Verify** :
- `pnpm drizzle-kit migrate` succeeds on dev DB
- `\d notetaker_exposures` in psql shows 10 columns + 3 indexes
- Drizzle types compile

**Test** : migration up+down round trip (if regression harness exists)

## T2 — normalizeEmail() util

**Code** : create `app/apps/web/src/lib/util/email.ts` exporting
`normalizeEmail(email: string): string` per design.md.

**Verify** : used nowhere else yet.

**Test** : `app/apps/web/src/__tests__/lib/util/email.test.ts` with ≥20 cases :
- lowercase conversion
- +tag strip
- Gmail dot removal
- Googlemail.com aliasing
- Trim whitespace
- Unicode local part
- Multiple + in local
- Empty → throws
- Missing @ → throws
- Multiple @ → throws
- Plus at end `foo+@x.com`
- Dots at boundaries
- Max length (254 chars RFC)
- Case in domain
- Subdomain preservation

## T3 — decideBrandingMode() + fuzzy domain match

**Code** : create `app/apps/web/src/lib/recording/branding.ts` with:
- `decideBrandingMode(input): BrandingDecision` per design.md
- `fuzzyDomainMatch(domainA, domainB): boolean` (Levenshtein ≤2 on root + same TLD)
- Types exported

**Verify** : pure functions, no I/O.

**Test** : `__tests__/lib/recording/branding.test.ts` with 6 scenarios :
1. `recordingEnabled=false` → `opted_out`
2. `recordingPolicy='always_silent'` with externals → `silent`
3. All internal attendees → `silent`, name='Notes'
4. Mixed internal + external → `full`, name='X (via Elevay)', externals populated
5. Fuzzy alias (`acme.com` vs `acme-corp.com` in `domainAliases`) → `silent`
6. Meeting override to silent despite externals → `silent`

## T4 — Read bot creation + signup hooks (recon)

**Code** : no code change, just locate entry points for T5 and T6.

**Verify** :
- Identify exact function that calls Recall.ai `POST /api/v1/bot` (grep `createBot` in lib/recall.ts)
- Identify exact function that creates a new `tenants` row on signup (likely Clerk webhook or api/auth/invite/accept)
- Document in a short note `_specs/WS1-recorder-as-channel/notes.md`

## T5 — Hook branding into bot creation

**Code** :
- In `lib/recall.ts` (or wherever `createBot` lives), before calling Recall.ai API :
  - Load tenant + settings
  - Load meeting attendees (from activity.metadata.attendees)
  - Call `decideBrandingMode`
  - If `opted_out` → skip bot creation, update activity.metadata.brandingDecision, return early
  - Else : pass `decision.botDisplayName` as `bot_name` to Recall.ai
  - After bot creation success : insert N rows into `notetaker_exposures` in a single transaction (one per external attendee), with UNIQUE on (activity_id, participant_email_normalized) to prevent duplicates
  - Store `activity.metadata.brandingDecision` JSON blob for observability

**Verify** :
- Manual : create test meeting on staging with external attendee → bot joins with branded name, row appears in `notetaker_exposures`
- Internal meeting → name is "Notes", no rows
- Opt-out tenant → no bot, no rows

**Test** : integration test with mocked Recall client + test DB

## T6 — Hook signup attribution

**Code** :
- At tenant creation entry point (identified in T4) :
  - Call `attributeSignup(tenant, ownerEmail)` from new `lib/recording/channel.ts`
  - Function implements the attribution flow per design.md
- Feature flag check : only runs if `process.env.WS1_CHANNEL_ENABLED !== 'false'`

**Verify** :
- Signup with no prior exposure → `tenant.settings.acquisitionSource = 'direct'` (or whatever default)
- Signup with 1 prior exposure → settings populated, exposure row updated
- Signup with 3 prior attributions to same referrer → credit_granted event emitted

**Test** : integration test with seed exposures + signup simulation

## T7 — CTA redirect endpoint

**Code** :
- Create `app/apps/web/src/app/r/exposure/[id]/route.ts` (GET handler)
- Implements flow per design.md (404, update cta_clicked_at, EU check, redirect or opt-in page)
- Create `app/apps/web/src/app/marketing/notetaker-landing/page.tsx` (simple landing)

**Verify** :
- Click test link → cta_clicked_at updated, 302 landing
- Invalid ID → 404
- EU prospect → banner rendered before redirect

**Test** : E2E with Playwright + integration test on route handler

## T8 — Summary email footer injection

**Code** :
- Locate summary send path (`api/meetings/[id]/notes/send-follow-up/route.ts`)
- If the meeting's exposure rows exist with `branding_mode='full'`, for each external recipient:
  - Append CTA footer with their specific exposure ID tracked link
- Render via existing React Email infra (or mailer template)

**Verify** :
- External recipient sees footer
- Internal recipient (same domain) sees NO footer
- Snapshot test of rendered email HTML

**Test** : snapshot test email render + integration test send path

## T9 — Admin dashboard page

**Code** :
- Create `app/apps/web/src/app/(admin)/admin/flywheel/recorder/page.tsx` (or mirror in admin app under `app/apps/admin/`)
- Implement 5 widgets per design.md queries
- Use existing chart lib (recharts / tremor — check admin codebase)

**Verify** :
- Visual : page renders with staging data
- All widgets have correct numbers (manually compute from DB sample)

**Test** : E2E Playwright visits page, asserts widgets present and non-zero

## T10 — Settings UI opt-out flow

**Code** :
- Extend `app/(dashboard)/settings/recording/page.tsx` :
  - Add radio group : "Branded (default)" | "Always silent" | "Per-meeting choice"
  - When "Always silent" selected, show required reason radio
  - Extend API `/api/settings/workspace` PUT to accept `recordingPolicy`, `recordingOptOutReason`
- Add `primaryDomain` editable field (auto-filled from owner email on load)
- Add `domainAliases` multi-input

**Verify** :
- Settings persist across reload
- API request payload contains new fields

**Test** : E2E Playwright + API unit test

## T11 — E2E verify + regression + commit

**Code** : no new code, just validation pass.

**Verify** :
- Run full E2E scenario from requirements.md §Evaluation steps 1-10
- Run `regression.sh`
- Manual smoke test on staging
- Check admin dashboard shows realistic data

**Commit** : one commit per major task (T1, T2+T3, T5, T6, T7, T8+T10, T9, T11). Include `Co-Authored-By: Rippletide <admin@rippletide.com>` per CLAUDE.md.

## Task dependency graph

```
T1 (migration) ──┬── T2 (normalizeEmail) ──┐
                 │                          │
                 └── T3 (branding) ─────────┤
                                            │
T4 (recon) ──────────┬──── T5 (bot hook) ──┤
                     │                      │
                     └──── T6 (signup) ────┤
                                            │
                                            ├── T7 (CTA redirect)
                                            │
                                            ├── T8 (email footer)
                                            │
                                            ├── T9 (admin dashboard)
                                            │
                                            ├── T10 (settings UI)
                                            │
                                            └── T11 (E2E + regression)
```

T2, T3 can run in parallel after T1. T5 and T6 depend on T2/T3/T4. T7/T8/T9/T10 are independent branches after T5/T6.
