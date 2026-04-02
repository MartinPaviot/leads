# MEETING-INTEL: Requirements

## User Story
As a founder doing founder-led sales, I want my CRM to automatically capture every meeting, transcribe it, extract key intelligence, update my deals, and draft follow-ups — so I never lose context from a sales call again.

## Scope (Phase 1 — this sprint)

### Feature 1: Microsoft Calendar Sync
**AC1.1**: GIVEN a user connected Microsoft OAuth
WHEN the calendar sync runs
THEN all meetings from the past 30 days and next 14 days are synced as activities
AND attendees are matched to existing contacts

**AC1.2**: GIVEN a synced meeting has external attendees
WHEN the meeting is created as an activity
THEN attendee emails, names, and CRM contact IDs are stored in metadata

### Feature 2: Background Calendar Sync (Inngest)
**AC2.1**: GIVEN a user has Google or Microsoft OAuth connected
WHEN 15 minutes have passed since last sync
THEN an Inngest job auto-syncs their calendar
AND new meetings are created, cancelled meetings are updated

**AC2.2**: GIVEN a meeting was scheduled and then cancelled
WHEN the sync detects the cancellation
THEN the activity status is updated to meeting_cancelled

### Feature 3: Transcript Upload UI
**AC3.1**: GIVEN a user is on the meetings page
WHEN they click on a past meeting
THEN they see a "Upload Transcript" button and drag-drop zone
AND they can upload .txt, .vtt, .srt files

**AC3.2**: GIVEN a user uploads an audio file (mp3, m4a, webm, wav)
WHEN the file is received
THEN it is transcribed using OpenAI Whisper API
AND the transcript is processed through the existing pipeline

**AC3.3**: GIVEN a user pastes a transcript in the text area
WHEN they click "Process"
THEN the transcript goes through the AI extraction pipeline

### Feature 4: Auto Post-Call Workflow
**AC4.1**: GIVEN a transcript has been processed with structured notes
WHEN the processing completes
THEN action items are created as tasks in the CRM (assigned to the user)
AND linked to the relevant deal/contact

**AC4.2**: GIVEN structured notes contain buying signals
WHEN the transcript is linked to a deal
THEN the deal's properties are auto-updated (budget, timeline, team size, competitors, pain points)
AND a "Deal Updated" notification is shown

**AC4.3**: GIVEN a transcript has been processed
WHEN the user views the meeting
THEN a draft follow-up email is auto-generated
AND the user can edit and send it with one click

### Feature 5: Meeting Notes Detail View
**AC5.1**: GIVEN a meeting has processed notes
WHEN the user clicks on the meeting
THEN they see: summary, key points, action items, decisions, buying signals, sentiment
AND each section is collapsible

**AC5.2**: GIVEN notes contain matched participants
WHEN the user views participants
THEN CRM contacts are linked (clickable to contact page)
AND unmatched participants show a "Create Contact" button

### Feature 6: Meeting Prep Auto-Delivery
**AC6.1**: GIVEN a meeting is scheduled in the next 24 hours with external attendees
WHEN the background sync runs
THEN a meeting prep document is auto-generated
AND it appears on the dashboard and meetings page

**AC6.2**: GIVEN a meeting prep is generated
THEN it includes: account snapshot, key attendees, recent interactions, active deals, open items, talking points

### Feature 7: Chat Integration
**AC7.1**: GIVEN meetings have been synced and processed
WHEN the user asks "What did we discuss with [company] last call?"
THEN the AI returns accurate information from the meeting notes with citations

**AC7.2**: GIVEN the user asks "Prepare me for my call with [contact] tomorrow"
WHEN the AI generates a response
THEN it includes the meeting prep document content

## Edge Cases
- User uploads transcript for a meeting not in calendar → create meeting activity on the fly
- Audio file too large (>100MB) → reject with clear error message
- Whisper API unavailable → fallback to manual text upload with message
- Meeting with no external attendees → skip prep generation (internal meeting)
- Duplicate transcript upload → detect and warn "Notes already exist, overwrite?"
- Calendar OAuth token expired → auto-refresh, if fails show reconnect prompt

## Evaluation Steps
1. Connect Microsoft OAuth, verify calendar meetings appear
2. Upload a sample transcript (.txt), verify structured notes are extracted
3. Upload an audio file, verify transcription + processing
4. Verify action items become tasks, deal gets updated
5. Verify follow-up email is auto-generated
6. Check meeting prep appears for tomorrow's meeting
7. Ask the chat about a processed meeting, verify citations
8. Test with real meeting transcript for accuracy
