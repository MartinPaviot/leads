# FINDING-014: Design — WS-0 Bug Batch Fix

## Strategy
Group bugs by affected file to minimize changes. Prioritize S2 bugs. For each bug, choose the simplest correct fix (remove deceptive UI > implement missing feature).

## Fix Plan

### S2 Fixes (must do)

| Bug | Fix | File(s) |
|-----|-----|---------|
| 002 | Remove "Team" option from privacy step; default to "everyone" | `onboarding-wizard.tsx`, `tenant-settings.ts` |
| 003 | Wire confidenceGaps panel to input controls OR remove the panel entirely | `onboarding-wizard.tsx` |
| 004 | Surface aiTone change in confirmation card with explicit toggle; do not silently override | `onboarding-wizard.tsx` |
| 007 | Pass `settings.targetSeniorities` to Apollo `person_seniorities` param | `api/onboarding/find-contacts/route.ts` |
| 008 | Delete stored `targetRoles`; derive on read from seniorities + departments | `api/onboarding/save/route.ts`, `tenant-settings.ts`, consumers |

### S3 Fixes (should do)

| Bug | Fix | File(s) |
|-----|-----|---------|
| 005 | Compute `total` dynamically from visible steps | `onboarding-wizard.tsx` |
| 006 | Delete `handleConnectSkip` dead code | `onboarding-wizard.tsx` |
| 009 | Move ignored domains to shared constant | `tenant-settings.ts`, `onboarding-wizard.tsx` |
| 010 | Call `identifyUser` with full profile after onboarding save | `api/onboarding/save/route.ts` |
| 011 | Rewrite subtitle to match available features | `home/page.tsx` |
| 012 | Use `fullName` verbatim for display; stop splitting | `api/onboarding/save/route.ts` |

## Risk
Low per fix, but cumulative changes to `onboarding-wizard.tsx` require careful regression testing.
