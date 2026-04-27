# FINDING-014: Tasks

## Task 1: Fix S2 bugs 002 + 004 in onboarding wizard (~2h)
- BUG-002: Remove "Team" option from privacy step radio group; set default to "everyone"
- BUG-004: Add tone confirmation UI in the confirmation card step; show inferred tone with toggle to accept/reject
- Update `tenant-settings.ts` to remove "team" as valid value for `defaultDataVisibility`
- **Verify:** Wizard shows no "Team" option; tone change requires user confirmation; existing tests pass

## Task 2: Fix S2 bugs 003 + 007 (~2h)
- BUG-003: Either add text inputs below each confidence gap question or remove the panel entirely (recommend: remove)
- BUG-007: In `api/onboarding/find-contacts/route.ts`, replace hardcoded `["c_suite", "vp", "director"]` with `settings.targetSeniorities`
- **Verify:** Apollo call uses user-selected seniorities; confidence gaps panel either functional or removed

## Task 3: Fix S2 bug 008 — targetRoles desync (~1.5h)
- Remove `targetRoles` from stored settings in `api/onboarding/save/route.ts`
- Create `deriveTargetRoles(seniorities, departments)` utility
- Update all consumers to call `deriveTargetRoles()` instead of reading stored value
- **Verify:** Changing seniorities on settings page immediately reflects in downstream prompts

## Task 4: Fix S3 bugs 005, 006, 009, 011, 012 (~1.5h)
- BUG-005: Replace hardcoded `total={7}` with computed step count
- BUG-006: Delete `handleConnectSkip` function
- BUG-009: Extract ignored domains to shared constant in `tenant-settings.ts`, import in wizard
- BUG-011: Rewrite "Expansion signals" subtitle to generic copy
- BUG-012: Store `fullName` as-is; use for display without splitting
- **Verify:** Progress bar correct; no dead code; domains consistent; subtitles accurate

## Task 5: Fix S3 bug 010 + update bug tracker (~30min)
- BUG-010: Add `identifyUser` call with `salesMotion`, `primaryChallenge`, `onboardingRole` in onboarding save route
- Update `docs/bugs/WS-0-discovered.md` with fix status and PR references for all 11 bugs
- **Verify:** PostHog receives full profile properties; bug document updated
