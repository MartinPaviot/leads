# G1: Daily Dashboard — Tasks

## Task 1: Create /api/dashboard/summary endpoint
- Create `app/apps/web/src/app/api/dashboard/summary/route.ts`
- Query activities from this week (Monday 00:00 to now)
- Count by type: sequence enrollments, email replies, meetings, won deals
- Query tasks due today + overdue
- Query meetings for today
- Return greeting based on time of day
- **Verify**: GET /api/dashboard/summary returns correct JSON structure
- **Test**: Unit test for greeting logic (morning/afternoon/evening) and empty state

## Task 2: Enhance /api/actions to include stalledDays
- Modify existing `/api/actions/route.ts`
- For each action linked to a deal, check last activity date
- If no activity for 3+ days, add `stalledDays: N` to the action object
- **Verify**: Actions with stalled deals include stalledDays field
- **Test**: Test that stalledDays is calculated correctly

## Task 3: Rebuild dashboard page UI
- Replace `app/apps/web/src/app/(dashboard)/page.tsx`
- Add greeting section (time-based)
- Add weekly summary banner
- Convert actions to auto-load (useEffect, no button)
- Add stall badges to action cards ("Stalled 3 days" in red)
- Replace task/meeting stubs with real data from summary endpoint
- Two-column layout: actions left, schedule right
- **Verify**: Page renders with all sections populated
- **Test**: Visual verification with seeded data

## Task 4: Write tests
- Test greeting logic
- Test weekly summary calculation
- Test stall detection
- Test empty states
- **Verify**: All tests pass
