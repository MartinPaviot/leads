# G32: Notification 3-Channel

## User Story
As a user, I want to receive important notifications about my pipeline and CRM activity through multiple channels (email, in-app, and Slack) so that I never miss critical updates.

## Scope
- **Email notifications**: Via Resend transactional email API
- **In-app notifications**: Via notifications table + UI component
- **Slack**: 🟡 BLOCKED — reCAPTCHA prevents automated app creation. Document integration point.

## Acceptance Criteria

### AC1: In-app notifications table + API
GIVEN a user is authenticated
WHEN a notification event occurs (deal risk, enrichment done, sequence reply, task due)
THEN a notification record is created in the database
AND the notification appears in the user's notification panel

### AC2: Email notification via Resend
GIVEN a user has email notifications enabled
WHEN a high-priority notification occurs
THEN a transactional email is sent via Resend API
AND the email is delivered to the user's inbox

### AC3: Notification preferences
GIVEN a user is on the notification settings page
WHEN they toggle notification channels on/off
THEN their preferences are saved
AND future notifications respect those preferences

### AC4: Mark as read
GIVEN a user has unread notifications
WHEN they view or click a notification
THEN it is marked as read
AND the unread count decreases

## Edge Cases
- User with no email configured
- Notification for deleted entity
- Rate limiting on email sends
- Duplicate notification prevention
