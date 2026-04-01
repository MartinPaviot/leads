# G1: Daily Dashboard — Design

## System Fit
Enhances the existing `(dashboard)/page.tsx` "Up next" page. No new pages needed.

## Layout (top to bottom)
1. **Greeting banner**: "Good morning, Martin" + date — full width
2. **Weekly summary**: One-line stats banner — full width
3. **Two-column layout** (60/40):
   - Left: Prioritized actions (auto-loaded)
   - Right: Today's schedule (tasks + meetings)
4. **Bottom**: Chat input bar (already exists)

## API Contracts

### GET /api/dashboard/summary
Returns weekly stats for the current user.
```json
{
  "greeting": "Good morning",
  "firstName": "Martin",
  "weekSummary": {
    "sequencesLaunched": 0,
    "responsesReceived": 0,
    "meetingsBooked": 0,
    "opportunitiesClosed": 0
  },
  "todayTasks": [
    {"id": "...", "title": "Follow up with Sarah", "dueDate": "2026-04-01", "account": "Meridian Labs", "overdue": false}
  ],
  "todayMeetings": [
    {"id": "...", "title": "Demo with NovaTech", "time": "14:00", "attendees": ["James Park"], "account": "NovaTech"}
  ]
}
```

### GET /api/actions (existing, enhanced)
Add `stalledDays` field to each action when deal has no activity for 3+ days.

## Data Model
No schema changes. Uses existing tables: deals, tasks, meetings, activities, sequenceEnrollments.

## Data Flow
1. Page loads → parallel fetch: /api/dashboard/summary + /api/actions
2. Summary endpoint queries activities this week, groups by type, counts
3. Actions endpoint runs existing AI action generation (auto, no button)
4. Render all sections

## Failure Handling
- API fails: Show section with "Unable to load" message, don't crash page
- Slow AI generation: Show actions section with loading skeleton while summary/tasks/meetings render immediately

## Security
- All endpoints check authenticated user session
- Data scoped to current tenant
