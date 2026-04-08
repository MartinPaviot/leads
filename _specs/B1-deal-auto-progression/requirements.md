# B1: AI Auto-Progression of Deals

## User Story
As a founder, I want deals to automatically progress through pipeline stages based on activity signals so I don't have to manually update deal stages after every meeting or email.

## Acceptance Criteria

### Scenario: Deal auto-progresses after meeting
GIVEN a deal in "qualification" stage with aiFillMode "auto"
AND a meeting was completed yesterday with positive sentiment
WHEN the auto-progression cron runs
THEN the deal moves to "demo" stage
AND an activity "deal_stage_changed" is logged with AI reasoning
AND workflow triggers fire for deal_stage_changed

### Scenario: Deal suggests progression (suggest mode)
GIVEN a deal in "demo" stage with aiFillMode "suggest"
AND trial-related signals detected
WHEN the auto-progression cron runs
THEN a notification is created suggesting the stage change
AND the deal is NOT moved automatically

### Scenario: Deal with no new activity
GIVEN a deal with no activity in the last 7 days
WHEN the auto-progression cron runs
THEN the deal is skipped (no change, no notification)

## Edge Cases
- Stage descriptions are empty → skip that stage evaluation
- aiFillMode is "off" → skip entirely
- Deal in "won"/"lost" → skip (terminal stages)
- No stages configured → use defaults
- LLM fails → log error, skip deal, continue with next
