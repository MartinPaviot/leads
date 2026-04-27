# FINDING-008: 24h Auto-Briefing Trigger Before Meetings

## User Story
As a founder doing sales, I want to receive a deal briefing 24 hours before every scheduled meeting so that I walk into calls prepared without manual effort.

## Current State
- `deal-briefing.ts` and `inngest/deal-briefing.ts` can generate briefings on-demand and on a weekday morning cron.
- No mechanism watches the calendar for upcoming meetings and triggers preparation 24h ahead.
- The `scheduledDealDigest` (cron `0 7 * * 1-5`) briefs all open deals generically, not meeting-specific.

## Acceptance Criteria

### AC-1: Briefing generated 24h before meeting
**When** a calendar event with an associated deal exists 24h in the future  
**Then** an Inngest function generates a deal briefing for that specific deal

### AC-2: Notification delivered to user
**When** the pre-meeting briefing is generated  
**Then** a notification is inserted for the meeting owner with the brief summary and a link to the deal

### AC-3: No duplicate briefings
**When** the cron fires and a meeting already has a briefing generated within the last 24h  
**Then** the function skips that meeting

### AC-4: Graceful degradation
**When** no deal is linked to the upcoming meeting  
**Then** the function logs a skip and does not error
