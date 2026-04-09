# P1+P2: Dashboard Inline Email Preview + Auto-Nudge

## User Story
As a founder, when I click a priority card on the dashboard (e.g., "Nudge Alex Shan — stalled 3 days"), I want to see the last email thread and an AI-drafted follow-up right there, so I can respond without navigating away.

## Acceptance Criteria

### Scenario: Click a contact priority → see email preview
GIVEN a priority card with entityType "contact" and entityId
WHEN I click the card
THEN a slide-over panel opens on the right
AND it shows: contact name, title, company, last email subject + snippet
AND an AI-drafted nudge email with pre-filled subject and body
AND a "Send" button that opens the full EmailComposer

### Scenario: Click a deal priority → see deal context
GIVEN a priority card with entityType "deal"
WHEN I click the card
THEN a slide-over shows: deal name, value, stage, days stalled
AND the last interaction summary
AND a "Draft email" button

### Scenario: Priority with no email history
GIVEN a contact priority with no email activity
WHEN the panel opens
THEN it shows "No email history" and a "Compose new email" button

## Edge Cases
- Contact has no email address → show "No email on file"
- API fails to generate nudge → show manual compose button
- Multiple actions open → only one panel at a time
