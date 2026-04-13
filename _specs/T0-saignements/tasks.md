# T0 — Saignements arrêtés — Tasks

## Order (dependency-respecting)

### T0.1 — needsOnboarding fix
- [ ] T1.1 Edit `api/onboarding/status/route.ts:75` → `needsOnboarding: !onboardingCompleted` — verify: `grep needsOnboarding src/app/api/onboarding/status/route.ts` — test: `route.test.ts` regression.
- [ ] T1.2 Write `route.test.ts` with 3 describe cases — verify: `npx vitest run src/app/api/onboarding/status`

### T0.2 — Persist currentStep
- [ ] T2.1 Edit `api/onboarding/save/route.ts` → accept optional `currentStep` in body, persist `tenants.settings.onboardingCurrentStep`.
- [ ] T2.2 Edit `api/onboarding/status/route.ts` → return `onboardingCurrentStep`.
- [ ] T2.3 Edit `components/onboarding-wizard.tsx` → on mount restore step; on setStep save fire-and-forget; banner "Welcome back"; force "icp" if persisted = "building".
- [ ] T2.4 Tests vitest for save/status.

### T0.3 — Challenge label
- [ ] T3.1 Edit `(dashboard)/home/page.tsx:188-196` → "Finding leads".
- [ ] T3.2 Create migration `drizzle/0010_fix_challenge_label.sql`.

### T0.4 — Chat silent catch
- [ ] T4.1 Edit `(dashboard)/chat/page.tsx:~458` → replace silent catch with toast + status revert.
- [ ] T4.2 Add `!res.ok` branch with 409/422/500 handling.
- [ ] T4.3 Tests (if practical unit-test).

### T0.5 — Bulk cap 20
- [ ] T5.1 Create `lib/chunk-bulk.ts` helper.
- [ ] T5.2 Refactor `(dashboard)/accounts/page.tsx` enrichAll/scoreAll/detectSignals to use chunkedBulkCall.
- [ ] T5.3 Tests for chunkedBulkCall.

### T0.6 — Suggested badge
- [ ] T6.1 Edit `(dashboard)/accounts/page.tsx:~798` → guard badge by source/properties.suggestedBy.
- [ ] T6.2 Verify contact schema fields (`src/db/schema.ts`).

### T0.7 — Twitter link
- [ ] T7.1 Edit `(marketing)/page.tsx:427-437` → remove Twitter anchor block.

### T0.8 — Password reset
- [ ] T8.1 Create migration `drizzle/0009_password_reset_tokens.sql`.
- [ ] T8.2 Update `db/schema.ts` with `passwordResetTokens`.
- [ ] T8.3 Create `lib/password-reset.ts` helper.
- [ ] T8.4 Create `lib/rate-limit.ts` if absent.
- [ ] T8.5 Create `lib/emails/password-reset.ts` + `password-changed.ts`.
- [ ] T8.6 Create `api/auth/forgot-password/route.ts`.
- [ ] T8.7 Create `api/auth/reset-password/route.ts`.
- [ ] T8.8 Create `app/forgot-password/page.tsx`.
- [ ] T8.9 Create `app/reset-password/page.tsx`.
- [ ] T8.10 Add "Forgot password?" link to `/sign-in`.
- [ ] T8.11 Tests for `lib/password-reset.ts`.
- [ ] T8.12 Apply migration local DB.

## Post-tasks
- [ ] `npx tsc --noEmit -p .` green
- [ ] `npx vitest run` green
- [ ] Grep silent catches count unchanged or reduced
- [ ] Commit(s) avec Rippletide trailer
- [ ] Merge fast-forward main (or merge commit)
- [ ] Write `_reports/t0-completion.md`
