# FINDING-009: Consent Notification Before Meeting Bot Joins

## User Story
As a meeting host, I want all participants to be notified before the recording bot joins so that Elevay complies with bilateral consent laws (12 US states + GDPR).

## Current State
- `lib/recording/bot-deployment.ts` calls `createBot()` which sends a Recall.ai bot directly into the meeting.
- No consent notification is sent to attendees before the bot joins.
- The branding decision logic (`decideBrandingMode`) handles display name but not consent.
- 12 US states (CA, CT, FL, IL, MD, MA, MI, MT, NH, OR, PA, WA) require all-party consent for call recording.

## Acceptance Criteria

### AC-1: Pre-join consent notification sent
**When** a bot is about to be deployed to a meeting with external attendees  
**Then** a consent email is sent to all attendees at least 5 minutes before the scheduled meeting time, stating that the meeting will be recorded

### AC-2: Opt-out link functional
**When** a meeting attendee clicks the opt-out link in the consent email  
**Then** the bot deployment is cancelled for that meeting and the host is notified

### AC-3: Host can override
**When** the host explicitly confirms recording despite an opt-out  
**Then** the bot is deployed with an audit log entry noting the override

### AC-4: Consent record persisted
**When** a consent notification is sent  
**Then** a record is stored in the database with attendee email, timestamp, meeting ID, and response status
