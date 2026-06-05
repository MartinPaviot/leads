# Entry Funnel Code Analysis
**Date:** 2026-06-05  
**Scope:** Acquisition → activation + ICP setup  
**Methodology:** Static source analysis; every claim cites file:line from the actual code.

---

## Per-Route Analysis

### Landing page — route `/`

- **Purpose:** Marketing surface; drives visitors to `/sign-up` or Calendly.
- **Reads/Writes (data):** None — fully static client component. No API calls, no auth checks.
- **States handled in code:** Single render state (no loading/error branches). Mobile menu open/close is the only conditional. `file:app/apps/web/src/app/(marketing)/page.tsx:167`
- **Primary CTAs / outbound (edges OUT):**
  - "Build my target list" (×2) → `/sign-up` (lines 332, 532)
  - "Try free" → `/sign-up` (line 238, 313)
  - "Log in" → `/sign-in` (lines 237, 306)
  - "Book a demo" → `https://calendly.com/contact-elevay/30min` (lines 234, 333, 488)
  - Footer "Privacy" / "Terms" → `/privacy`, `/terms` (lines 554–557)
- **Inbound expectations (edges IN):** None; no query params consumed.
- **Seam risks:**
  - The root path `/` redirects authenticated users to `/home` (middleware line 100), but the marketing page itself is `"use client"` and has no auth check, so an authenticated user who lands on `/` via direct navigation (before middleware) sees a flash of the marketing page before redirect. Minor.
  - `?firstTime=true` is mentioned in `home/page.tsx:168` but the landing page sets up no mechanism to pass it; it originates at post-onboarding.
- **Notable gaps:**
  - `TODO(martin): confirm this copy is true to you` at line 418 — founder quote not yet confirmed.
  - Founder photo at `/martin_paviot.jpg` is a production asset that must exist.

---

### Sign-in — route `/sign-in`

- **Purpose:** Authenticate existing users via credentials or OAuth (Google, Microsoft).
- **Reads/Writes (data):**
  - Reads: `auth()` session check (server, NextAuth). No direct DB query in the page.
  - Writes: session cookie via NextAuth `signIn()` server action.
- **States handled in code:** `file:app/apps/web/src/app/sign-in/page.tsx`
  - Success: redirect via `callbackUrl` (line 45 for already-authed bounce; NextAuth redirect for successful sign-in).
  - `registered=true` banner (line 48–88): shown after sign-up email confirm.
  - `reason=*` banner (line 49, 89–101): named banners (e.g. `password-reset-success`).
  - `error=*` banner (line 50, 102–113): NextAuth error codes rendered as friendly copy.
  - Missing: no loading skeleton while auth submission is pending (only `AuthSubmitButton` handles its own busy state at line 269).
- **Primary CTAs / outbound (edges OUT):**
  - Google OAuth → NextAuth provider, then `callbackUrl` (line 123).
  - Microsoft OAuth → NextAuth provider, then `callbackUrl` (line 162).
  - Credentials form → NextAuth, then `callbackUrl` (line 205).
  - "Forgot password?" → `/forgot-password` (line 253).
  - "Sign up" → `/sign-up` (preserving `callbackUrl` at line 276–280).
- **Inbound expectations (edges IN):**
  - `?callbackUrl=` — sanitized to same-origin path by `sanitizeCallbackUrl()`, defaults to `/home` (line 40).
  - `?registered=true` — show "Account created" banner.
  - `?reason=*` — show named reason banner.
  - `?error=*` — show NextAuth/credential error.
- **Seam risks:**
  - No check for `emailVerified` in the sign-in gate; a credentials user who signed up but never clicked the email can log in and access the full dashboard. Verification is only encouraged (soft gate via `/verify-email-sent` and the `?verified=1` banner on home).
- **Notable gaps:** None observed.

---

### Sign-up — route `/sign-up`

- **Purpose:** Create a new credentials account or OAuth sign-up; kick off email verification.
- **Reads/Writes (data):** `file:app/apps/web/src/app/sign-up/page.tsx`
  - Reads: `authUsers` table for duplicate check (line 129).
  - Writes: inserts `authUsers` row (line 146), inserts `authAccounts` credentials binding (line 153), issues `emailVerificationTokens` row via `createVerifyTokenForUser` (line 165), attempts `sendVerifyEmail` (line 166 — best-effort).
- **States handled in code:**
  - `EmailExists` error → inline email field error with "Sign in instead" link (lines 33–49, 415–435).
  - `PasswordTooShort` / `PasswordPwned` → inline password field error (lines 37–49, 451–460).
  - `MissingFields` → global alert banner (line 51, 310–322).
  - `OAuthUnavailable` → provider-named warning (lines 59–66, 323–337).
  - Unknown error → generic global banner (lines 69–71, 338–350).
  - Invite context → notice banner (lines 352–364).
  - Missing: no inline "password strength meter" despite minLength=10 hint in placeholder (line 447).
- **Primary CTAs / outbound (edges OUT):**
  - Google OAuth → NextAuth, then `oauthRedirectTo` (line 227): for invite = `/accept-invite?token=`, otherwise `callbackUrl` (default `/home`).
  - Microsoft OAuth → same.
  - Credentials form → `handleSignUp` server action → on success, auto-signs-in and redirects to `/verify-email-sent?next=<callbackUrl>` (line 188) or `/accept-invite` for invites.
  - "Sign in" link → `/sign-in` (preserving `callbackUrl`, line 471).
- **Inbound expectations (edges IN):**
  - `?invite=` — invite token; carried through all paths; causes post-signup redirect to `/accept-invite`.
  - `?email=` — pre-fills email field (line 73, `defaultValue={presetEmail}` at line 401).
  - `?callbackUrl=` — same-origin post-auth redirect.
  - `?error=` / `?provider=` — error display from OAuth failure redirect.
- **Seam risks:**
  - OAuth sign-up skips `/verify-email-sent` entirely; OAuth accounts are auto-verified by NextAuth (see `auth.ts:301`), so the chain correctly differs. No gap here.
  - Credentials sign-up: email send is best-effort and may silently fail (Resend testing-mode limitation noted in memory). Code correctly does not block on it (lines 163–175). Token row is persisted even if send fails.
- **Notable gaps:**
  - `callbackUrl` hidden input is omitted when `callbackUrl === "/home"` (line 462–464), which is correct to avoid URL pollution but means the invite + callbackUrl combination can't be carried together cleanly.

---

### Verify email — route `/verify-email`

- **Purpose:** Consume a one-time verification token from an emailed link; stamp `emailVerified`; redirect to app or sign-in.
- **Reads/Writes (data):** `file:app/apps/web/src/app/verify-email/page.tsx`
  - Reads: `validateVerifyToken(token)` — checks `emailVerificationTokens` table (line 36).
  - Writes: `markEmailVerified(row.userId)` — stamps `authUsers.emailVerified` (line 40). `consumeVerifyToken(row.id)` — deletes/invalidates the token (line 41).
- **States handled in code:**
  - `missing` token → `VerifyError` with "open the link" message (line 32–33).
  - `invalid`/expired token → `VerifyError` with "link expired" + resend CTA (line 37–38).
  - Signed-in and matches userId → redirect `/home?verified=1` (line 45).
  - Signed-out (verified from different browser) → redirect `/sign-in?reason=email-verified` (line 47).
  - Missing: no loading state (server component; renders inline on each request).
- **Primary CTAs / outbound (edges OUT):**
  - Error path: "Sign in" → `/sign-in` (line 80). "Resend" → `/verify-email-sent` (line 89).
  - Success: redirect to `/home?verified=1` or `/sign-in?reason=email-verified`.
- **Inbound expectations (edges IN):**
  - `?token=` — required; UUID from the verification email link.
- **Seam risks:**
  - The `?verified=1` query param lands on `/home` but `home/page.tsx` does not handle it explicitly (no verified banner on home). The sign-in page does handle `?reason=email-verified` correctly via `SIGN_IN_REASON_COPY`. The `/home?verified=1` branch is therefore a silent success — no user feedback after verification when already signed in.
- **Notable gaps:** None critical.

---

### Verify email sent — route `/verify-email-sent`

- **Purpose:** "Check your inbox" interstitial; shown immediately after credentials sign-up.
- **Reads/Writes (data):** `file:app/apps/web/src/app/verify-email-sent/page.tsx`
  - Reads: `auth()` session (line 29); `resolveInboxDeepLinks(email)` to compute webmail links.
  - Writes: `signOut()` via server action on "Sign out" button (line 110).
- **States handled in code:**
  - Signed-out → redirect `/sign-in` (line 33).
  - Signed-in: displays email, webmail deep-link buttons, resend button, "Skip for now" link.
  - Resend button (`ResendVerifyButton`): idle / sending / sent / error with 30s cooldown (resend-button.tsx lines 13, 23–76).
- **Primary CTAs / outbound (edges OUT):**
  - Webmail deep-links → external provider inboxes.
  - "Skip for now" → `next` param (sanitized; default `/home`) at line 107. This is the soft-gate bypass.
  - "Sign out" → `/sign-in`.
  - Resend → `POST /api/auth/verify-email/send` (resend-button.tsx line 31).
- **Inbound expectations (edges IN):**
  - `?next=` — destination after skipping or completing verification; sanitized by `sanitizeCallbackUrl`.
- **Seam risks:**
  - "Skip for now" link at line 106 sends the user directly to `next` (default `/home`) without checking `emailVerified`. This means unverified users who skip can access the full dashboard indefinitely. Email verification is purely advisory (no enforced gate in middleware or dashboard routes).
- **Notable gaps:** None.

---

### Forgot password — route `/forgot-password`

- **Purpose:** Request a password reset email.
- **Reads/Writes (data):** `file:app/apps/web/src/app/forgot-password/page.tsx`
  - Reads: none in page.
  - Writes: `POST /api/auth/forgot-password` (line 18); the API issues a reset token (not audited in detail here).
- **States handled in code:**
  - Pre-submit: email input + "Send reset link" button (line 80–113).
  - Loading: button shows "Sending…", disabled (line 109).
  - Submitted (always shows success, even on network error): "Check your inbox" message (lines 52–68). This is intentional — avoids email enumeration (comment at line 22).
  - Missing: no field-level validation error before submit (only `disabled` when email is empty at line 108).
- **Primary CTAs / outbound (edges OUT):**
  - "Send reset link" → `POST /api/auth/forgot-password`.
  - "Back to sign in" (×2) → `/sign-in`.
- **Inbound expectations (edges IN):** None.
- **Seam risks:** None.
- **Notable gaps:** `console.warn` on network error at line 24 — no user-visible error path (intentional for anti-enumeration).

---

### Reset password — route `/reset-password`

- **Purpose:** Set a new password using a one-time token from the reset email.
- **Reads/Writes (data):** `file:app/apps/web/src/app/reset-password/page.tsx`
  - Reads: `?token=` from `useSearchParams` (line 11).
  - Writes: `POST /api/auth/reset-password` (line 36); API validates token and hashes new password.
- **States handled in code:**
  - Missing token → "Invalid reset link" with link to `/forgot-password` (lines 51–70).
  - Passwords don't match → inline error (line 20–22).
  - Client-side weak password → inline error (lines 23–29). NOTE: `clientAcceptable` requires length >= 10 (line 196) but the label says "at least 12 characters" (line 79). The `isPasswordStrong` server-side validator (imported in sign-up) requires >= 12. This is a validation mismatch — client allows 10, server may reject 11.
  - Loading: "Updating…" button (line 150).
  - Success: redirect to `/sign-in?reason=password-reset-success` (line 39).
  - Server error: inline alert from `data.error` or generic (line 42–44).
- **Primary CTAs / outbound (edges OUT):**
  - "Update password" → `POST /api/auth/reset-password`.
  - "Back to sign in" → `/sign-in`.
  - On success → `/sign-in?reason=password-reset-success`.
- **Inbound expectations (edges IN):**
  - `?token=` — reset token from email link; client-only via `useSearchParams`.
- **Seam risks:**
  - Client-side `clientAcceptable` allows passwords of length 10 (line 196) while the UI copy says "at least 12" (line 79) and the server validator used in sign-up enforces 12. If the server-side reset API also validates via `isPasswordStrong` (which requires 12), a user entering an 11-char password will pass client validation, fail server validation, and get a generic error — poor UX.
- **Notable gaps:** The Suspense boundary around `ResetPasswordForm` (line 186) is correct for SSR safety with `useSearchParams`.

---

### Accept invite — route `/accept-invite`

- **Purpose:** Validate an invite token, show workspace details, and switch the signed-in user's tenant context.
- **Reads/Writes (data):** `file:app/apps/web/src/app/accept-invite/page.tsx`
  - Reads: `GET /api/auth/invite/:token` on mount (line 33).
  - Writes: `POST /api/auth/invite/accept` (line 53); server-side switches tenant membership.
- **States handled in code:** Full state machine (lines 18–26):
  - `loading` → "Verifying invitation…" (line 89).
  - `valid` → workspace name, role, invitee email, two action buttons (lines 101–124).
  - `invalid` → error reason from `friendlyReason()` (lines 92–98, 163–172).
  - `accepting` → "Accepting invitation…" (line 126).
  - `accepted` → "You're in!" + auto-redirect to `/home` after 1200ms (lines 128–133, 81–83).
  - `wrong_account` → "Wrong account" message (lines 135–146).
  - Missing: `needs_signin` state type is declared (line 23) but never transitioned to; the 401 path redirects to `/sign-in` directly instead (lines 59–63).
- **Primary CTAs / outbound (edges OUT):**
  - "Sign in & accept" → `accept()` function → `POST /api/auth/invite/accept`.
  - "Create account" → `/sign-up?email=<invite email>` (line 117).
  - On 401 → `/sign-in?callbackUrl=/accept-invite?token=...` (lines 61–63).
  - On success → `window.location.href = "/home"` (line 82).
- **Inbound expectations (edges IN):**
  - `?token=` — invite token; required; missing token sets `invalid` state.
- **Seam risks:**
  - The page uses raw inline styles (lines 174–231) inconsistent with the design system (`var(--color-*)` tokens) used everywhere else — it visually stands out as unpolished.
  - `needs_signin` state is declared but never reached — dead code. The 401 handler navigates before setting it (lines 59–63).
- **Notable gaps:** No "resend invite" option from the invalid state.

---

### Onboarding v3 — route `/onboarding-v3`

- **Purpose:** 7-phase structured onboarding wizard (Monaco-parity). NOT the active onboarding path for new sign-ups; the home page triggers v1/v2/v3 chat via `useOnboardingVersion()`. This route exists at a separate URL as a parallel implementation.
- **Reads/Writes (data):** `file:app/apps/web/src/app/(dashboard)/onboarding-v3/page.tsx` + `file:app/apps/web/src/components/onboarding-7phase/wizard.tsx`
  - Reads: `GET /api/onboarding/state` on mount and after each phase submission (wizard.tsx line 183).
  - Writes: `POST /api/onboarding/phase/:n` per phase (wizard.tsx line 263); `POST /api/onboarding/complete` at the end (wizard.tsx line 332).
- **States handled in code:** (wizard.tsx)
  - Loading (no `state`): spinner (line 424).
  - First-load error (no `state` + `error`): error panel with Retry (lines 382–423).
  - Active: 7-phase stepper + phase body + live checklist sidebar.
  - Phase submission error: inline alert below phase body (lines 499–514).
  - Finalize: "Finalise onboarding" button shown only when `canFinalize()` passes AND on phase 7 (lines 516–543).
  - Completion → `router.replace("/home")` (wizard.tsx line 364).
- **Fields collected per phase and downstream consumers:**

  | Phase | Fields collected | Downstream consumer |
  |-------|-----------------|---------------------|
  | 1 — Diagnostic | `situation`, `dealsToDate`, `icp.industry`, `icp.sizeRange`, `icp.buyerPersona`, `icp.raw` | `icp.industry` is read by Phase 4 (playbook resolution, wizard.tsx:1101) and Phase 6 (wizard.tsx:1469). `icp.*` stored in `onboarding_progress.phase_data["1"]`. **NOT written to `tenants.settings`** — the TAM build via `/api/tam/build` reads `getTenantSettings()` which reads `tenants.settings`, NOT `onboarding_progress.phase_data`. See Seam Risks. |
  | 2 — ICP & TAM | `bestCustomers[]`, `antiIcp[]`, `relevanceConfirmed` | Stored in `onboarding_progress.phase_data["2"]`. `bestCustomers` seeds the `checklist.tamRelevance` gate. `antiIcp` stored but no downstream consumer found in TAM build or scoring — collected but not read. |
  | 3 — Email & Calendar | `emailProvider`, `calendarProvider`, `recallConnected` | Checklist gate `email_sync` / `calendar_sync` checks real DB state (mail sync counts), not this field. This field is essentially a self-reported checkbox with no system enforcement. |
  | 4 — Signals | `customSignals[{question, rationale}]` | Stored in phase_data. The checklist gate `custom_signals` counts them. No evidence the stored signals are consumed by the signal-scoring engine (which reads from a separate `signals` table). |
  | 5 — Voice & Sequences | `voiceSamples.emails[]`, `voiceSamples.loomUrl`, `approvedSequenceIds[]` | `approvedSequenceIds` is checked by `active_sequence` gate. `voiceSamples` is stored in phase_data but no downstream consumer found — the email-drafting system reads tone from `settings.aiTone`, not from onboarding voice samples. |
  | 6 — Pipeline | `stages[{id, name}]` | Stored in phase_data only. No evidence stages are written to `pipeline_stages` table. The checklist gate `pipeline_stages` presumably checks the table, not phase_data. |
  | 7 — Coaching | `firstQueryDone` boolean | Checklist gate `coaching_query` counts chat messages from `chat_messages` table — it does NOT read this self-reported boolean. The boolean is stored in phase_data and ignored. |

- **Primary CTAs / outbound (edges OUT):**
  - "Save & continue" per phase → `POST /api/onboarding/phase/:n`.
  - "Finalise onboarding" → `POST /api/onboarding/complete` → `router.replace("/home")`.
- **Inbound expectations (edges IN):** Auth session required (dashboard layout). No query params consumed.
- **Seam risks:**
  - **Critical: Phase 1 ICP is NOT synced to `tenants.settings`.** The `/api/tam/build` route reads `getTenantSettings()` → `tenants.settings` (build/route.ts:222). Phase 1 data lives in `onboarding_progress.phase_data["1"]`. There is no code path that copies `icp.industry` / `icp.sizeRange` / `icp.buyerPersona` from `onboarding_progress` to `tenants.settings`. A user who completes the 7-phase wizard will have empty `settings.targetIndustries` (unless they also visit `/settings/icp`). The TAM build triggered from `/settings/icp-profiles` uses ICP criteria (separate `icps` + `icpCriteria` tables). The legacy TAM build (no `icpId`) falls back to `settings.targetIndustries` — which is empty if wizard was used.
  - **`antiIcp` collected but never read.** Phase 2 collects a list of anti-ICP companies; there is no code in the TAM build, scoring, or filtering that reads this field from `onboarding_progress.phase_data`.
  - **`voiceSamples` collected but not consumed downstream.** No code reads `phase_data["5"].voiceSamples` to seed the email drafting tone or any LLM prompt.
  - **Pipeline stages not persisted to `pipeline_stages` table.** Only written to `phase_data`; unclear if the checklist gate actually passes when stages are only in phase_data.
  - **Phase 7 `firstQueryDone` ignored.** Checklist counts real `chat_messages`; the boolean from the wizard is never read.
  - This route is NOT linked from the main post-signup flow. New users land on `/home`, which triggers the modal via `useOnboardingVersion()` (v1/v2/v3 chat). The `/onboarding-v3` route is only reachable via `OnboardingIncompleteBanner` on the home page (incomplete-banner.tsx). Two parallel onboarding paths coexist.
- **Notable gaps:**
  - Comment at wizard.tsx:9: "Once the new flow is proven, the route can be promoted to `/welcome` or the home page can redirect new tenants directly to it" — this promotion has not happened.
  - Phase 3 connection step is purely declarative; it does not initiate OAuth.

---

### ICP settings — route `/settings/icp`

- **Purpose:** Edit the legacy single-profile ICP stored in `tenants.settings`.
- **Reads/Writes (data):** `file:app/apps/web/src/app/(dashboard)/settings/icp/page.tsx`
  - Reads: `GET /api/settings/icp` → `tenants.settings` (icp/route.ts:12–32).
  - Writes: `PUT /api/settings/icp` → `tenants.settings` (icp/route.ts:35–65).
- **States handled in code:**
  - `loaded = false` → `return null` (line 76) — invisible loading state with no spinner.
  - Load error → `setError("Failed to load ICP settings")` shown in save area (line 43).
  - Save success: 3s "Saved" badge, then clears (lines 59–62).
  - Save error: inline error message (line 281).
  - Missing: no confirmation dialog before overwriting existing settings.
- **Fields collected:**
  - `productDescription` — consumed by LLM prompt in `tam/build` (line 538 of build/route.ts via `settings.productDescription`).
  - `salesMotion` — stored; downstream consumer not found in TAM build (not in the prompt template visible in build/route.ts lines 520–570).
  - `primaryChallenge` — stored; downstream consumer not found.
  - `aiTone` — stored; consumed by email drafting (likely in sequences/compose API — not audited here but referenced in confirmation card).
  - `targetIndustries` — consumed by `tam/build` route (build/route.ts:303, 537–538) for strategy planning and signal context.
  - `targetCompanySizes` — consumed by `tam/build` via `parseSizeRange(settings)` (build/route.ts:304).
  - `targetRoles` — consumed by `tam/build` via `parseRoleKeywords(settings)` (build/route.ts:311) and by `inngest/onboarding-functions.ts:47` for contact discovery.
  - `targetGeographies` — consumed by `tam/build` (build/route.ts:305, 539).
- **Primary CTAs / outbound (edges OUT):**
  - "Save changes" → `PUT /api/settings/icp`.
- **Inbound expectations (edges IN):** Auth + admin role check in the API (`requireAdmin` at icp/route.ts:40).
- **Seam risks:**
  - `salesMotion` and `primaryChallenge` are collected and persisted but no downstream consumer was found in the TAM build or scoring prompts. These may feed other surfaces not audited here (deal coaching, chat), but within the TAM/scoring chain they appear to be dead fields.
  - Loading state renders null (invisible), not a skeleton — layout shift on slow connections.
- **Notable gaps:** No "Reset to defaults" option.

---

### ICP profiles — route `/settings/icp-profiles`

- **Purpose:** Multi-ICP rule builder; each ICP profile has criteria that score companies and can trigger a TAM build via Apollo.
- **Reads/Writes (data):** `file:app/apps/web/src/app/(dashboard)/settings/icp-profiles/page.tsx`
  - Reads: `GET /api/icps` (list), `GET /api/icp-catalog` (field catalog), `GET /api/icps/:id` (edit).
  - Writes: `POST /api/icps` (create), `PATCH /api/icps/:id` (update), `DELETE /api/icps/:id`.
  - TAM build: `POST /api/tam/build` with `{icpId, targetCount: 200}` (line 86); streams NDJSON.
- **States handled in code:**
  - Loading: "Loading…" text (line 253).
  - Empty: "No ICP profiles yet" (line 257–262).
  - List view: cards with criteria count + fit count (lines 261–306).
  - Editor: inline `IcpEditor` (lines 309–320).
  - TAM building: live inserted count stream per ICP id (lines 78–136).
  - Error: toast notifications (lines 89, 148).
- **Primary CTAs / outbound (edges OUT):**
  - "New ICP" → opens `IcpEditor` with empty draft.
  - "Build TAM" → `POST /api/tam/build` with `icpId`.
  - "Save changes" / "Create ICP" → `PATCH` or `POST /api/icps`.
  - Delete → `DELETE /api/icps/:id`.
- **Inbound expectations (edges IN):** Auth session. No query params.
- **Seam risks:**
  - "Build TAM" is disabled when `criteriaCount === 0` (line 283). A new ICP with no criteria cannot be sourced — correct behavior.
  - The ICP profiles system (`icps` + `icpCriteria` tables) is completely separate from the legacy settings (`tenants.settings.targetIndustries`). The two ICP systems coexist without cross-pollination: onboarding data → `settings.*`; this page → `icps` table. A new user who only fills out `/settings/icp` will have no profiles here, and vice versa.
- **Notable gaps:** No way to promote a profile's criteria to `settings.targetIndustries` (and vice versa).

---

## Entry funnel — seam summary

### Sign-up → verify-email → home chain

| Step | Status |
|------|--------|
| Landing `/` → `/sign-up` | Wired. Multiple CTAs. |
| `/sign-up` (credentials) → auto-sign-in → `/verify-email-sent?next=<callbackUrl>` | Wired (sign-up/page.tsx:188). |
| `/verify-email-sent` → email click → `/verify-email?token=` → `/home?verified=1` | Wired (verify-email/page.tsx:45). |
| `/verify-email-sent` → "Skip for now" → `next` (default `/home`) | Wired as soft bypass. |
| `/verify-email-sent` — enforce verification before dashboard? | **Not enforced.** Middleware (middleware.ts) has no `emailVerified` check. Unverified users access the full dashboard permanently. |
| `/home?verified=1` — show verification success banner? | **Not handled.** `home/page.tsx` does not read `?verified=1`. Silent success. |
| OAuth sign-up → callbackUrl (default `/home`) | Wired. OAuth skips verify-email-sent; OAuth providers stamp `emailVerified` automatically (auth.ts:301). |

### Onboarding modal → home (v1/v2/v3 chat paths)

| Step | Status |
|------|--------|
| `/home` detects `needsOnboarding` via `/api/home/hydrate` or `/api/onboarding/status` | Wired (home/page.tsx:192–203). |
| Modal shows correct version (v1/v2/v3) via `useOnboardingVersion()` | Wired (home/page.tsx:150, 971–1011). |
| Onboarding complete → `window.location.href = "/?firstTime=true"` | Wired (home/page.tsx:980, 989, 1007). |
| `/?firstTime=true` → middleware redirects authenticated users to `/home` (middleware.ts:100) | **Seam:** The `/?firstTime=true` destination becomes `/home` via middleware redirect, losing the `firstTime` query param. Home page reads `new URLSearchParams(window.location.search).has("firstTime")` (line 421) after hydration — by that time the URL is `/home`, not `/?firstTime=true`. This may suppress the TAMRevealNotification. |
| `/onboarding-v3` (7-phase wizard) completion → `router.replace("/home")` | Wired but this path is only reached via `OnboardingIncompleteBanner`, not the main sign-up flow. |

### ICP data → TAM consumption chain

| Data source | Written to | Read by TAM build | Status |
|-------------|------------|-------------------|--------|
| `/settings/icp` — `targetIndustries`, `targetCompanySizes`, `targetGeographies`, `targetRoles` | `tenants.settings` | `/api/tam/build` via `getTenantSettings()` (build/route.ts:222) | **Wired.** This is the live path. |
| `/settings/icp-profiles` — criteria per ICP | `icps` + `icpCriteria` tables | `/api/tam/build` when `?icpId=` is passed (build/route.ts:264–296) | **Wired.** "Build TAM" button on icp-profiles page passes `icpId`. |
| Onboarding v3 Phase 1 — `icp.industry`, `icp.sizeRange`, `icp.buyerPersona` | `onboarding_progress.phase_data["1"]` | **NOWHERE** in the TAM build chain | **DROPPED.** Critical seam gap. Phase 1 ICP data is stored but never propagated to `tenants.settings` or `icps`. A user who only uses the 7-phase wizard will have empty settings and no ICP profiles → TAM build produces no results. |
| Onboarding v3 Phase 2 — `antiIcp[]` | `onboarding_progress.phase_data["2"]` | **NOWHERE** | **DROPPED.** Anti-ICP exclusions are collected and never read by TAM or scoring. |
| Onboarding v3 Phase 5 — `voiceSamples` (emails / Loom) | `onboarding_progress.phase_data["5"]` | **NOWHERE** (email drafting uses `settings.aiTone`) | **DROPPED.** Voice calibration is collected but has no consumer. |
| Onboarding confirmation card (`onboarding-confirmation-card.tsx`) | Calls `onConfirm({identity, targeting})` | Parent (`onboarding-v2-wrapper.tsx`) handles — writes to `settings` via `/api/onboarding/save` | **Wired** (v2 onboarding path only). |

### Summary of critical funnel gaps

1. **No email verification gate.** Unverified credentials users bypass `/verify-email-sent` via "Skip for now" and have full dashboard access forever. Middleware has no `emailVerified` check.

2. **Phase 1 ICP → tenants.settings gap.** The 7-phase wizard collects `icp.industry/sizeRange/buyerPersona` in Phase 1 but does NOT write them to `tenants.settings`. The TAM build reads `tenants.settings`. A user who completes the wizard has no TAM unless they also fill `/settings/icp` or create an ICP profile.

3. **`antiIcp` dead field.** Phase 2 collects "companies you do NOT want as customers" — this data has no downstream consumer in TAM filtering, scoring, or outbound suppression.

4. **`voiceSamples` dead field.** Phase 5 collects email samples / Loom URL for voice calibration — no downstream reader found. Email drafting uses `settings.aiTone`, not onboarding voice data.

5. **`firstTime` param lost via middleware redirect.** The `/?firstTime=true` URL used by onboarding completion redirects through middleware to `/home` (losing the param), which may suppress the TAMRevealNotification on home.

6. **`/home?verified=1` has no UI handler.** Email verification success when already signed in redirects to `/home?verified=1` but the home page does not display a confirmation banner for this state.

7. **Parallel onboarding systems.** Three onboarding variants coexist (v1 wizard modal, v2 confirmation card, v3 7-phase at `/onboarding-v3`) with no automatic promotion path. The v3 route is only reachable via `OnboardingIncompleteBanner` on home, not as the primary new-user flow.

8. **Reset password client/server validation mismatch.** Client `clientAcceptable()` requires >= 10 chars (reset-password/page.tsx:196) while the UI label says "at least 12" (line 79). If the server-side reset API also enforces 12, passwords of length 10–11 pass client validation but fail server validation with a generic error.
