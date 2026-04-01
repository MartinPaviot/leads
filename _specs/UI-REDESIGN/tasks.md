# UI-REDESIGN Tasks

## T1: Create lib/ui-utils.ts with shared utilities
- [x] Extract badgeColorIndex() from accounts/contacts pages
- [x] Create BADGE_COLORS array referencing CSS vars (--color-badge-N / --color-badge-N-bg)
- [x] Create LIFECYCLE_CONFIG record referencing CSS vars
- [x] Create STAGE_COLORS record referencing CSS vars
- [x] Create letterGrade(), heatLabel(), formatScore() functions
- [x] Handle null/empty edge cases
- Verify: File compiles with tsc --noEmit
- Commit: "refactor: extract shared UI utilities to lib/ui-utils.ts"

## T2: Replace hardcoded colors in accounts/page.tsx
- [x] Import from lib/ui-utils
- [x] Remove inline badgeColors array (~10 entries)
- [x] Remove inline lifecycleConfig (~7 entries)
- [x] Remove inline badgeColorIndex function
- [x] Replace all hardcoded hex in stage/score rendering with CSS vars
- Verify: Accounts page renders, badges colored, scores display
- Commit: "refactor: accounts page uses design system tokens"

## T3: Replace hardcoded colors in contacts/page.tsx
- [x] Import from lib/ui-utils
- [x] Remove inline badgeColors array
- [x] Remove inline badgeColorIndex, letterGrade, heatColor functions
- [x] Replace hardcoded hex in score rendering with CSS vars
- Verify: Contacts page renders, enrichment badges, score display
- Commit: "refactor: contacts page uses design system tokens"

## T4: Replace hardcoded colors in opportunities/page.tsx
- [x] Import STAGE_COLORS from lib/ui-utils
- [x] Remove inline STAGE_DOT_COLORS
- [x] Replace Tailwind arbitrary colors (bg-red-500/15, text-red-400) with CSS vars
- Verify: Kanban renders, stage dots colored, risk badges visible
- Commit: "refactor: opportunities page uses design system tokens"

## T5: Fix Lightfield text in meetings/page.tsx
- [x] Change "Lightfield" → "LeadSens" on line 19
- Verify: Meetings page shows "LeadSens" in empty state
- Commit: "fix: replace Lightfield reference with LeadSens in meetings"

## T6: Add auth to chat/route.ts
- [x] Import auth from @/auth
- [x] Add session check at top of POST handler
- [x] Return 401 if no session
- Verify: Unauthenticated request to /api/chat returns 401
- Commit: "security: add auth check to chat API route"

## T7: Add error.tsx and loading.tsx files
- [x] Create app/(dashboard)/error.tsx — error boundary with retry
- [x] Create app/(dashboard)/loading.tsx — skeleton loading
- Verify: Error boundary catches thrown errors, loading skeleton appears
- Commit: "ui: add error boundaries and loading states"

## T8: Add favicon
- [x] Create app/favicon.ico (or app/icon.tsx for dynamic SVG)
- Verify: No 404 on favicon.ico
- Commit: "ui: add favicon"

## T9: Write tests for shared utilities
- [x] Test badgeColorIndex with various strings, empty string, special chars
- [x] Test letterGrade boundary values (0, 49, 50, 59, 60, 69, 70, 79, 80, 89, 90, 100)
- [x] Test heatLabel returns correct label/color/icon for each range
- [x] Test formatScore with null, 0, 50, 100
- Verify: All tests pass with vitest
- Commit: "test: add unit tests for shared UI utilities"
