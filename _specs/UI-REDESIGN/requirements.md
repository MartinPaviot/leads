# UI-REDESIGN Requirements

## User Story
As a founder using LeadSens, I want the interface to feel polished, consistent, and trustworthy so that I can confidently use it as my primary CRM without feeling like I'm using a prototype.

## Acceptance Criteria

### AC1: Design system token adoption
- GIVEN the design system tokens in globals.css
- WHEN I view any page in the app
- THEN all colors, borders, and text colors use CSS custom properties — zero hardcoded hex values in TSX components (except external brand colors like Google's #4285f4)

### AC2: Shared utility extraction
- GIVEN badge rendering exists on accounts, contacts, and opportunities pages
- WHEN I check the codebase
- THEN badgeColorIndex(), badgeColors[], lifecycleConfig, letterGrade(), heatColor() are defined ONCE in lib/ui-utils.ts and imported by all consumers

### AC3: Lightfield copy removed
- GIVEN the meetings empty state
- WHEN I navigate to /meetings
- THEN the text says "LeadSens automatically syncs meetings from your calendar activity." — NOT "Lightfield"

### AC4: Error boundaries exist
- GIVEN any unhandled error in a dashboard page
- WHEN the error occurs
- THEN an error.tsx boundary catches it and shows a "Something went wrong" message with a retry button — NOT a white screen

### AC5: Loading states exist
- GIVEN a slow API response
- WHEN a dashboard page is loading
- THEN a loading.tsx skeleton appears — NOT a blank page

### AC6: Chat route authenticated
- GIVEN an unauthenticated request to POST /api/chat
- WHEN the request is made
- THEN the response is 401 Unauthorized

### AC7: Favicon present
- GIVEN any page load
- WHEN the browser requests /favicon.ico
- THEN a valid favicon is returned (no 404)

## Edge Cases
- Badge colors must handle empty strings, null values, and very long category names
- Error boundaries must not break the sidebar navigation
- Loading states must not flash (minimum display time or CSS transition)
- Score display must handle null/undefined scores gracefully (show "—" not NaN)
- Lifecycle config must handle unknown stage values (fallback to default style)
