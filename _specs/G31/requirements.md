# G31: Meeting Recording + AI Notes

## Status: 🟡 PARTIAL — infrastructure built, recording integration blocked

## Blocker
Recall.AI account created but verification email not arriving. Martin may need to verify manually.

## What's Built
1. Transcript processing API (`/api/meetings/process-transcript`)
2. Structured notes extraction from transcripts using Claude
3. Meeting notes table/schema support (via activities metadata)

## Acceptance Criteria

### AC1: Process transcript into structured notes
GIVEN a meeting transcript (text)
WHEN the user submits it for processing
THEN Claude extracts: key points, action items, decisions, participants, budget mentions, next steps, objections
AND the structured notes are saved as meeting activity metadata

### AC2: Transcript from manual upload
GIVEN a user has a meeting transcript file
WHEN they upload it through the API
THEN it is processed and structured notes are generated

### AC3: Integration point for Recall.ai (future)
GIVEN the Recall.ai account is verified
WHEN a meeting is recorded
THEN the transcript is automatically sent to the processing pipeline
