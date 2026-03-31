# F4.4: Email Sending Infrastructure — Requirements

## User Story
As a founder, I want a reliable email sending system that handles warm-up, rotation, and deliverability so my outreach actually reaches inboxes.

## Acceptance Criteria

### AC1: Send email API
GIVEN a valid email address
WHEN I call the send API
THEN the email is queued and sent (or logged in development mode)

### AC2: Sequence step execution
GIVEN enrolled contacts with nextStepAt in the past
WHEN the Inngest job runs
THEN it generates and "sends" the email, advances to next step

### AC3: Development mode
GIVEN no email provider configured
WHEN sending an email
THEN it's logged to console and stored in activities table

## Edge Cases
- No email provider → development mode (log only)
- Invalid email address → skip, mark bounced
- Rate limiting → respect provider limits
