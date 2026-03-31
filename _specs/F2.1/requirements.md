# F2.1: Email Sync — Requirements

## User Story
As a founder, I want to connect my Gmail account so that all my sent and received emails are automatically captured in the CRM and attached to the right contacts.

## Acceptance Criteria

### AC1: Connect Gmail
GIVEN an authenticated user on Settings page
WHEN they click "Connect Gmail"
THEN Google OAuth consent screen appears
AND after authorization, the account shows as connected

### AC2: Initial email sync
GIVEN a connected Gmail account
WHEN sync runs for the first time
THEN emails from the last 30 days are fetched
AND each email creates an activity record in the database

### AC3: Contact matching
GIVEN synced emails
WHEN an email is from/to an address matching an existing contact
THEN the activity is linked to that contact

### AC4: Email display
GIVEN synced activities
WHEN viewing a contact's detail
THEN their email history appears in the activity timeline

### AC5: Sync status
GIVEN a connected account
WHEN viewing Settings
THEN the last sync timestamp and email count are shown

## Edge Cases
- Gmail account with no emails in last 30 days → show "No emails found"
- Email from unknown contact → create activity without contact link (orphaned)
- Duplicate sync (re-run) → skip already-synced emails (idempotent by message ID)
- OAuth token expires → refresh automatically using refresh token
- User revokes access in Google → show "Reconnect" in Settings
- Rate limit from Gmail API → back off and retry

## Evaluation Steps
1. Navigate to Settings → click "Connect Gmail"
2. Complete Google OAuth
3. Trigger sync
4. Navigate to Contacts → click a contact → verify email history
5. Check database for activity records
6. Re-sync → verify no duplicates
