# FINDING-008: Design — 24h Auto-Briefing Trigger

## Approach
Add a new Inngest cron function that runs every hour, queries for meetings in the 23-25h window, and dispatches `deal/brief-requested` events for each match.

## New Inngest Function
```typescript
// inngest/meeting-prep-trigger.ts
export const meetingPrepTrigger = inngest.createFunction(
  {
    id: "meeting-prep-24h-trigger",
    triggers: [{ cron: "0 * * * *" }], // hourly
  },
  async ({ step }) => {
    // 1. Query activities where activityType='meeting', 
    //    occurredAt BETWEEN now+23h AND now+25h
    // 2. For each meeting with a linked dealId:
    //    a. Check if briefing already generated (metadata.briefedAt)
    //    b. If not, dispatch deal/brief-requested event
    //    c. Mark metadata.briefedAt = now
    // 3. Insert notification for the meeting owner
  }
);
```

## Data Flow
1. Hourly cron fires `meeting-prep-24h-trigger`
2. Query `activities` table: `activityType = 'meeting'` AND `occurredAt` in 23-25h window
3. Join to `deals` via `entityId` (where `entityType = 'deal'`) or via `metadata.dealId`
4. For each match, dispatch `deal/brief-requested` (existing handler in `inngest/deal-briefing.ts`)
5. Insert into `notifications` table with brief summary

## Deduplication
Store `metadata.briefedAt` on the activity row. Skip if already set within last 24h.

## Registration
Add to `app/apps/web/src/app/api/inngest/route.ts` serve() array.
