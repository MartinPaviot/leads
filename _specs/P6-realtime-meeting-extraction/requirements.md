# P6: Real-Time Meeting Extraction

## User Story
As a founder in a meeting, I want to see structured data (budget, team size, tools) being extracted in real-time as the conversation progresses, so I can prepare follow-up actions before the call even ends.

## Acceptance Criteria

### Scenario: Live extraction during call
GIVEN a Recall.ai bot is recording an active call
WHEN the bot sends transcript updates via webhook
THEN partial transcript is stored in the activity metadata
AND structured fields are progressively extracted
AND the meeting detail page shows "Updating..." with fields appearing

### Scenario: Meeting detail page during active call
GIVEN a meeting is currently recording (status "recording")
WHEN I view the meeting detail page
THEN I see a live extraction card with pulsing "Updating..." indicator
AND fields appear as they're detected (budget, team size, etc.)
AND the card auto-refreshes every 10 seconds

### Scenario: Call ends — final extraction
GIVEN a call has ended
WHEN the final transcript is processed
THEN the extraction card shows final values without "Updating..."
AND the data is written to both deal and account records

## Design
- Webhook handler: on `bot.transcription` event, store partial transcript in activity.metadata.partialTranscript
- Polling endpoint: GET /api/meetings/[id]/live returns latest extracted fields
- Frontend: MeetingLiveExtraction component polls every 10s during active calls
- LLM extraction runs on partial transcript (Claude Haiku, lightweight)
