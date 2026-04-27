# FINDING-008: Tasks

## Task 1: Create meeting-prep-trigger Inngest function (~1.5h)
- Create `app/apps/web/src/inngest/meeting-prep-trigger.ts`
- Implement hourly cron that queries activities for meetings 23-25h in the future
- For meetings with linked deals, dispatch `deal/brief-requested` event
- Add deduplication via `metadata.briefedAt` timestamp
- **Verify:** Unit test with mock activities confirms correct window filtering and dedup

## Task 2: Add notification delivery (~1h)
- After briefing dispatch, insert a notification row for the meeting owner
- Title: "Meeting prep ready: {dealName} with {contactName}"
- Body: first 200 chars of the brief summary
- Link to the deal detail page
- **Verify:** Integration test confirms notification created with correct content

## Task 3: Register function and deploy (~30min)
- Add `meetingPrepTrigger` to the Inngest serve() function list in `api/inngest/route.ts`
- Ensure the function appears in Inngest dashboard
- **Verify:** `npm run build` succeeds; Inngest dev server shows the new function

## Task 4: Write tests (~1h)
- Test: meeting in window with linked deal triggers briefing
- Test: meeting already briefed is skipped
- Test: meeting with no linked deal is skipped gracefully
- Test: meeting outside 23-25h window is not picked up
- **Verify:** All tests pass
