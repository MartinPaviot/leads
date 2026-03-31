# F4.5: Reply Detection — Requirements

## User Story
As a founder, I want the system to detect when a prospect replies to my outreach and automatically stop the sequence.

## Acceptance Criteria

### AC1: Reply webhook/API
GIVEN a reply to a sequence email
WHEN the reply is detected
THEN the enrollment status changes to "replied" and sequence stops

### AC2: Reply classification
GIVEN a detected reply
WHEN processing
THEN classify as positive/negative/OOO/unsubscribe

## Note
Full implementation requires email webhook integration. For now, building the API endpoint and classification logic that will be connected when email sending is live.
