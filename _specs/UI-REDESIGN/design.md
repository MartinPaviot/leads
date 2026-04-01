# UI-REDESIGN Design

## System Fit
This feature touches ALL dashboard pages but changes NO business logic. It's a pure presentation-layer refactor that:
- Extracts duplicated code into shared utilities
- Replaces hardcoded values with existing CSS custom properties
- Adds missing Next.js framework files (error.tsx, loading.tsx)
- Fixes critical bugs (Lightfield text, chat auth, favicon)

## Data Model
No data model changes. All existing APIs remain unchanged.

## Shared Utility: lib/ui-utils.ts

### badgeColorIndex(str: string): number
Hash string to 0-9 index. Already exists in 3 files — extract once.

### BADGE_COLORS: Array<{bg: string, text: string}>
Reference CSS custom properties:
```ts
{ bg: "var(--color-badge-0-bg)", text: "var(--color-badge-0)" }
```

### LIFECYCLE_CONFIG: Record<string, {bg: string, text: string}>
All 7 lifecycle stages with CSS var references.

### STAGE_COLORS: Record<string, string>
Pipeline stage dot colors using CSS vars.

### letterGrade(score: number): string
A+/A/B/C/D/F mapping.

### heatLabel(score: number): {label: string, color: string, icon: string}
Maps score → Burning/Warm/Cool/Cold with CSS var color + emoji.

### formatScore(score: number | null): {grade: string, heat: string, color: string, icon: string} | null
Combined score display utility. Returns null for null/undefined input.

## File Changes

### New Files
- `lib/ui-utils.ts` — shared utilities
- `app/(dashboard)/error.tsx` — dashboard error boundary
- `app/(dashboard)/loading.tsx` — dashboard loading skeleton
- `app/(dashboard)/accounts/error.tsx` — accounts error boundary
- `app/(dashboard)/contacts/error.tsx`
- `app/(dashboard)/opportunities/error.tsx`
- `app/favicon.ico` — simple indigo favicon

### Modified Files
- `app/(dashboard)/accounts/page.tsx` — remove inline badgeColors/lifecycle, import from ui-utils
- `app/(dashboard)/contacts/page.tsx` — remove inline badgeColors/letterGrade/heatColor, import from ui-utils
- `app/(dashboard)/opportunities/page.tsx` — remove inline STAGE_DOT_COLORS, import from ui-utils
- `app/(dashboard)/meetings/page.tsx` — "Lightfield" → "LeadSens"
- `app/api/chat/route.ts` — add auth() check

## Security
- Chat route gets auth check (fixes CRITICAL vulnerability)
- No other security changes

## Failure Handling
- Error boundaries catch rendering errors and show retry UI
- Loading states prevent blank pages during data fetch
- Badge utilities handle null/empty inputs without crashing
