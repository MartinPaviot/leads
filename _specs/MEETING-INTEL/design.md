# MEETING-INTEL: Design

## System Fit
Extends the existing meeting infrastructure (calendar.ts, process-transcript API, meetings page). Adds Microsoft calendar as a second source, background sync, upload UI, and post-call automation. No new tables needed — uses existing activities, tasks, deals tables.

## Data Model

### No schema changes needed
The existing schema supports everything:
- `activities` table: type=meeting_scheduled|meeting_completed|meeting_cancelled, metadata JSONB stores structured notes
- `tasks` table: auto-created action items from meetings
- `deals` table: properties JSONB for extracted intel
- `authAccounts` table: stores Microsoft OAuth tokens (already set up)

### Activity Metadata Structure (enhanced)
```typescript
{
  // Calendar data (existing)
  calendarEventId: string;
  startTime: string;
  endTime: string;
  attendees: Array<{ email: string; name?: string; contactId?: string }>;
  location: string;
  meetingLink: string;
  
  // Transcript data (new)
  hasTranscript: boolean;
  transcriptSource: 'manual_text' | 'file_upload' | 'audio_whisper' | 'recall_ai';
  transcriptLength: number;
  processedAt: string;
  
  // Structured notes (existing, from process-transcript)
  structuredNotes: {
    summary: string;
    keyPoints: string[];
    actionItems: Array<{ owner: string; task: string; deadline: string | null }>;
    decisions: string[];
    participants: Array<{ name: string; role: string | null }>;
    buyingSignals: { budget, timeline, currentStack, painPoints, objections, nextSteps, competitors, teamSize };
    sentiment: 'positive' | 'neutral' | 'negative';
  };
  matchedContacts: Array<{ name: string; contactId: string | null }>;
  
  // Auto-generated (new)
  generatedTaskIds: string[];   // Task IDs created from action items
  followUpEmailDraft: string;   // Auto-generated follow-up
  prepDocument: string;         // Meeting prep (for upcoming meetings)
}
```

## API Contracts

### POST /api/calendar/sync/microsoft
Mirror of existing Google calendar sync, using Microsoft Graph API.
- Auth: session required, Microsoft OAuth tokens from authAccounts
- Input: none (uses session user's Microsoft account)
- Output: `{ synced: number, created: number, skipped: number }`

### POST /api/meetings/upload-transcript
New endpoint for file upload (text or audio).
- Auth: session required
- Input: `FormData { file: File, meetingId?: string, dealId?: string }`
- Output: `{ success: true, notes: StructuredNotes, activityId: string }`
- If audio → calls Whisper API first, then process-transcript pipeline

### POST /api/meetings/[id]/post-call
Trigger post-call automation for a processed meeting.
- Auth: session required
- Input: `{ createTasks: boolean, generateFollowUp: boolean, updateDeal: boolean }`
- Output: `{ tasks: Task[], followUpDraft: string, dealUpdated: boolean }`

### GET /api/meetings/[id]/notes
Retrieve structured notes for a meeting.
- Auth: session required
- Output: `{ notes: StructuredNotes, followUpDraft: string, tasks: Task[] }`

## Data Flow

```
Calendar (Google/Microsoft)
    ↓ [Inngest: every 15 min]
  Sync meetings → activities table
    ↓
  User clicks meeting → sees prep doc (upcoming) or upload zone (past)
    ↓ [User uploads transcript OR audio]
  Audio? → Whisper API → text transcript
    ↓
  process-transcript API → Claude extracts structured notes
    ↓ [Auto post-call workflow]
  ├── Create tasks from action items
  ├── Update deal properties (buying signals)
  ├── Generate follow-up email draft
  ├── Embed transcript for RAG
  └── Notify user: "Meeting notes ready"
```

## Inngest Jobs

### calendar/sync (new)
- Trigger: cron every 15 minutes
- Logic: For each user with Google or Microsoft OAuth, sync calendar
- Idempotent: skip already-synced events (by calendarEventId)

### meeting/prep-auto (new)
- Trigger: cron every hour
- Logic: For meetings in the next 24h with external attendees, auto-generate prep
- Store prep in activity metadata

### meeting/post-call (new)
- Trigger: event "meeting/transcript-processed"
- Logic: Create tasks, update deal, generate follow-up, send notification

## Microsoft Calendar Integration
Uses Microsoft Graph API (already have OAuth + tokens):
```
GET /me/calendarview?startDateTime=...&endDateTime=...
```
Fields: subject, start, end, attendees, location, webLink, onlineMeeting, isCancelled

Token refresh: Use refresh_token from authAccounts, same pattern as Google.

## Audio Transcription
Use OpenAI GPT-4o Mini Transcribe (we already have OPENAI_API_KEY):
```
POST https://api.openai.com/v1/audio/transcriptions
model: gpt-4o-mini-transcribe
file: <audio file>
response_format: verbose_json (includes timestamps + speaker diarization)
```
Max file size: 25MB. For larger files, split client-side.
Cost: ~$0.003/min — 50% cheaper than Whisper, with speaker diarization.
Fallback: whisper-1 if gpt-4o-mini-transcribe unavailable.

## Failure Handling
- Calendar token expired: auto-refresh, log warning, retry once
- Whisper API down: show error, suggest manual text paste
- Process-transcript fails: save raw transcript, retry later via Inngest
- Deal not found for update: skip, log warning
- Task creation fails: non-blocking, continue with other post-call steps

## Security
- All endpoints require auth session
- Calendar data scoped to user's own calendar
- Transcript uploads limited to 25MB (audio), 5MB (text)
- Audio files deleted after transcription (not stored permanently)
- Structured notes stored in tenant-scoped activities
