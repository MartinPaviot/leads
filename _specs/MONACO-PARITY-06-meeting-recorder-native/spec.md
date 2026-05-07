# MONACO-PARITY-06: Native Meeting Recorder (Zoom/Meet/Teams OAuth)

P2. XL effort (4-6 sem). Per `_research/monaco-bilan-et-classification-2026-05-06.md` Partie 4 Étape 4 — *"Meeting recording natif (sans Recall.ai) | Recall.ai dependency | Intégration directe Zoom/Meet/Teams API OAuth + Whisper STT. Plus robuste, moins coûteux à scale."*

Not blocking — Recall.ai works today. Cost-driven rewrite when call volume justifies the build effort.

## Requirements

### Story
As a founder at scale (100+ calls/month), I want Elevay to record my meetings via direct OAuth into Zoom/Meet/Teams instead of Recall.ai's bot-joining model, so (a) my calls are never disrupted by an unidentified bot in the room, (b) the transcript fidelity is higher (provider-native captions), and (c) the per-call cost drops by ~70% (Recall.ai charges per minute).

### Acceptance
- Zoom OAuth: post-meeting webhook fires; we pull `recording.completed` and `transcript.completed` artifacts.
- Google Meet: requires Workspace plan with Gemini-generated transcripts; OAuth scope `meetings.recordings.readonly`. Fall back to Recall.ai bot if Workspace plan absent.
- Microsoft Teams: Graph API `/me/onlineMeetings/{id}/recordings` + `/transcripts`. Requires Teams Premium for transcripts.
- Per-platform fallback to Recall.ai when native is unavailable (small Workspace tier, etc.).

### Edge cases
- User on personal Zoom (no native recording quota) → fall back to Recall.ai bot.
- Meeting not recorded by host → no transcript at all; surface "not recorded" in UI.
- Provider transcript quality lower than Whisper → optional re-transcription with Whisper on the audio file.

## Design

### Provider abstraction
```ts
interface MeetingTranscriptProvider {
  fetchTranscript(meetingId: string, providerCtx: any): Promise<TranscriptArtifact | null>;
  isAvailableForUser(userId: string): Promise<boolean>;
}
```
Implementations: `ZoomNativeProvider`, `GoogleMeetProvider`, `TeamsProvider`, `RecallAiProvider` (existing fallback).

### OAuth scopes
- Zoom: `meeting:read`, `recording:read`, `cloud_recording:read`.
- Google: `https://www.googleapis.com/auth/meetings.recordings.readonly` + `auth/calendar.readonly`.
- Microsoft: `OnlineMeetings.Read`, `OnlineMeetingTranscript.Read.All`.

### Webhook handlers (new routes)
- `app/api/webhooks/zoom/route.ts` — verifies Zoom signature; routes by event type.
- `app/api/webhooks/google-meet/route.ts` — Cloud Pub/Sub push receiver.
- `app/api/webhooks/teams/route.ts` — Graph subscription notifications.

### Storage
Reuse existing `meetings` + `transcript_chunks` (from MONACO-PARITY-05). Add `provider` column to track which path produced the transcript.

## Tasks (high-level)

1. Zoom App Marketplace listing + dev account.
2. Google Workspace Marketplace + admin consent flow.
3. Microsoft Teams app + admin consent.
4. Three webhook routes + signature verification.
5. Three provider impls.
6. Provider router (pick first available; Recall.ai last).
7. Transcript-quality eval: compare native vs Whisper re-transcribe on 50 sample meetings.
8. Per-user setting "always re-transcribe with Whisper" for fidelity-critical tenants.
9. Cost dashboard: $X saved vs Recall.ai baseline.
10. Doc + master plan ✅.

Defer until Recall.ai cost crosses $X/month threshold.
