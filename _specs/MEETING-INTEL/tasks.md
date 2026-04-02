# MEETING-INTEL: Tasks

## Task 1: Microsoft Calendar Sync (`lib/calendar-microsoft.ts` + API route)
- [ ] Create `lib/calendar-microsoft.ts` with `getMicrosoftCalendarClient()` and `fetchMicrosoftMeetings()`
- [ ] Use Microsoft Graph API: GET /me/calendarview with OAuth tokens from authAccounts
- [ ] Handle token refresh (same pattern as Google)
- [ ] Create `api/calendar/sync/microsoft/route.ts` — mirror of Google sync
- [ ] Match attendees to CRM contacts by email
- [ ] Dedup by calendarEventId (Microsoft event ID)
- **Verify**: Connect Microsoft OAuth, trigger sync, see meetings in activities table
- **Test**: Calendar sync returns meetings with attendees matched to contacts

## Task 2: Background Calendar Sync (Inngest)
- [ ] Create Inngest function `calendar/auto-sync` triggered by cron `*/15 * * * *`
- [ ] Query all users with Google or Microsoft OAuth tokens
- [ ] For each user, call the appropriate sync (Google or Microsoft)
- [ ] Add error handling: skip user if token expired, log warning
- [ ] Register the function in `inngest/functions.ts`
- **Verify**: Wait 15 min, check new meetings appear automatically
- **Test**: Inngest function runs without error, creates meeting activities

## Task 3: Transcript Upload API (`api/meetings/upload-transcript`)
- [ ] Create `api/meetings/upload-transcript/route.ts`
- [ ] Accept FormData: file (required), meetingId (optional), dealId (optional)
- [ ] Detect file type: .txt/.vtt/.srt → extract text; .mp3/.m4a/.webm/.wav → Whisper
- [ ] For VTT/SRT: parse and extract plain text (strip timestamps)
- [ ] For audio: call OpenAI Whisper API, get transcript text
- [ ] Pipe transcript text to existing `process-transcript` pipeline (reuse logic)
- [ ] If meetingId provided: update existing activity. Otherwise: create new activity
- [ ] Return structured notes
- **Verify**: Upload .txt file, get structured notes back. Upload .mp3, get transcription + notes.
- **Test**: Text upload returns notes. Audio upload transcribes then processes.

## Task 4: Post-Call Automation (`api/meetings/[id]/post-call`)
- [ ] Create `api/meetings/[id]/post-call/route.ts`
- [ ] Read structured notes from activity metadata
- [ ] Create tasks from action items (insert into tasks table, linked to deal/contact)
- [ ] Update deal properties with buying signals (if dealId in metadata)
- [ ] Generate follow-up email draft using Claude (context: notes + attendees + deal)
- [ ] Store generated task IDs + follow-up draft in activity metadata
- [ ] Emit Inngest event for notification
- **Verify**: Process a transcript, call post-call, see tasks created + deal updated + follow-up draft
- **Test**: Tasks match action items count. Deal properties updated. Follow-up email is relevant.

## Task 5: Meeting Notes Detail View (UI)
- [ ] Create `/meetings/[id]/page.tsx` — meeting detail page
- [ ] Show: meeting title, date, attendees, location, meeting link
- [ ] If notes exist: show collapsible sections (summary, key points, action items, decisions, buying signals, sentiment)
- [ ] If no notes: show upload zone (drag-drop + paste textarea)
- [ ] Action items section: show checkboxes, link to created tasks
- [ ] Buying signals: visual cards (budget, timeline, team size, pain points, competitors)
- [ ] Sentiment: color-coded badge (green/gray/red)
- [ ] Follow-up email: show draft with "Edit & Send" button
- [ ] Participants: linked to CRM contacts, "Create Contact" for unmatched
- **Verify**: Navigate to meeting with notes, all sections render correctly
- **Test**: Visual inspection of all sections with real data

## Task 6: Transcript Upload UI on Meeting Detail
- [ ] Add drag-drop zone component to meeting detail page (when no transcript)
- [ ] File picker: accept .txt, .vtt, .srt, .mp3, .m4a, .webm, .wav
- [ ] Paste textarea as alternative input
- [ ] Upload progress indicator + transcription progress for audio
- [ ] After processing: auto-refresh to show structured notes
- [ ] "Overwrite" confirmation if notes already exist
- **Verify**: Drag .txt file, see notes appear. Upload .mp3, see transcription progress then notes.
- **Test**: Upload flow works for text and audio files

## Task 7: Meeting Prep Auto-Generation (Inngest)
- [ ] Create Inngest function `meeting/auto-prep` triggered by cron `0 * * * *` (hourly)
- [ ] Find meetings in next 24h with external attendees and no prep yet
- [ ] For each: call existing `/api/meetings/prep` logic (refactor into shared util)
- [ ] Store prep in activity metadata.prepDocument
- [ ] Show prep on dashboard "Upcoming" section and meetings page
- **Verify**: Schedule a meeting for tomorrow, wait for cron, see prep generated
- **Test**: Prep document contains account snapshot, attendees, recent interactions

## Task 8: Chat Tool Integration
- [ ] Add `getMeetingNotes` tool to chat route — fetches structured notes for a company/contact/deal
- [ ] Add `prepareMeeting` tool — generates meeting prep on demand
- [ ] Update system prompt to mention meeting intelligence capabilities
- **Verify**: Ask "What did we discuss with Acme last call?" — get accurate answer
- **Test**: Chat returns meeting notes with correct information

## Task 9: Integration Tests + Regression
- [ ] Test: Microsoft calendar sync creates activities
- [ ] Test: Text transcript upload → structured notes
- [ ] Test: Audio upload → Whisper → structured notes
- [ ] Test: Post-call creates tasks + updates deal
- [ ] Test: Follow-up email is generated
- [ ] Test: Meeting prep includes account context
- [ ] Test: Chat retrieves meeting notes
- [ ] Run full regression.sh
- **Verify**: All tests pass
