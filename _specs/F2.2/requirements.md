# F2.2: Calendar Sync

## Status: ✅ ALREADY IMPLEMENTED

## Evidence
- `lib/calendar.ts`: `getCalendarClient()` + `fetchRecentMeetings()` using Google Calendar API
- `app/api/calendar/sync/route.ts`: Syncs meetings to activities, matches attendees to contacts
- Auth scope: `calendar.readonly` configured in `auth.ts`
- Deduplicates by calendarEventId
- Extracts: meeting ID, title, description, attendees, location, meeting links

## What's Working
- Google Calendar event fetching (past 30 days + future 7 days)
- Meeting → activity record creation
- Attendee → contact matching
- Conference data extraction (Google Meet links)

## Remaining Gap
- 🟡 Background auto-sync (currently manual trigger only)
- 🟡 Additional calendar providers (Microsoft — see G28)
