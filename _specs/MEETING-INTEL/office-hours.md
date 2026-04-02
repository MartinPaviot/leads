# MEETING-INTEL: Office Hours

## Problem Statement (one sentence)
LeadSens has meeting intelligence processing (transcript -> notes -> CRM update) but no way to automatically acquire transcripts from calls, making the entire pipeline manual and useless for founder-led sellers who forget to upload.

## Premise Challenge
**Assumption**: "We need a meeting bot that joins calls to record and transcribe."
**Challenge**: Do we? Most founders already have Zoom/Teams/Meet recordings. Can we piggyback on native platform recordings instead of deploying a bot?

**Counter-argument**: Native recordings require manual export. A bot that auto-joins is the only way to achieve zero-touch. Gong, Fireflies, Fathom all use bots because it's the only reliable cross-platform approach. But bots have UX friction ("who's this bot joining my call?") and cost money per-minute.

**Resolution**: Hybrid approach. Start with the most impactful, cheapest path:
1. **Phase 1 (MVP)**: Paste/upload transcript + auto-processing + Microsoft calendar sync (we just set up Microsoft OAuth). This works TODAY with zero cost.
2. **Phase 2**: Recall.ai bot integration for auto-join (requires fixing Recall.ai account verification). This is the "magic" — zero-touch.
3. **Phase 3**: Native platform recording import (Zoom cloud recordings API, Teams Graph API).

## Alternatives Explored

### Alternative 1: Recall.ai Only
- **Pros**: Single API, supports Zoom/Teams/Meet/Webex. Bot joins automatically.
- **Cons**: $0.02-0.04/min transcription cost. Recall.ai account blocked (verification email). Bot appears in participant list (some prospects don't like this). Dependency on third-party.
- **Completeness**: 9/10 (full automation)
- **Cost**: ~$2-4/hour of meeting

### Alternative 2: Native Platform APIs
- **Pros**: No bot in participant list. Uses existing recordings. Free (user already pays for Zoom/Teams).
- **Cons**: Each platform is different API. Zoom requires admin approval for cloud recording access. Teams Graph API requires admin consent. Google Meet has no recording API. Fragmented, slow to build.
- **Completeness**: 6/10 (only works for platforms with recording APIs)
- **Cost**: Free but high dev effort

### Alternative 3: Browser Extension
- **Pros**: Works on any platform. No bot visible. Can capture audio directly.
- **Cons**: Requires user to install extension. Chrome only. Privacy concerns. Complex to build and maintain. Not mobile-friendly.
- **Completeness**: 7/10
- **Cost**: Free but massive dev effort

### Alternative 4: Hybrid (Recommended)
- **Phase 1**: Manual upload/paste + full post-processing pipeline + background calendar sync + meeting prep. Zero cost, works now.
- **Phase 2**: Recall.ai integration when account is unblocked. Auto-join from calendar events.
- **Phase 3**: Zoom/Teams cloud recording auto-import as fallback.
- **Completeness**: 10/10 (graduated, each phase adds value)
- **Cost**: Phase 1 = $0, Phase 2 = ~$2-4/hr meetings, Phase 3 = $0

## Layer Check
- **Layer 1 (tried and true)**: Transcript processing with LLMs (GPT-4/Claude) = well-established pattern. Calendar sync = standard OAuth. ✅
- **Layer 2 (new and popular)**: Recall.ai = popular among dev tools (Grain, Otter use it). Meeting bots = proven by Gong/Fireflies. ✅
- **Layer 3 (first principles)**: Our structured extraction schema (buying signals, action items, sentiment) is first-principles designed for sales. The auto-CRM-update from transcript is novel in the SMB space. ✅

## Completeness Target: 9/10

## What We're Building (Scope)
Given the existing foundation, the feature is about:

### Must Have (Phase 1 — this sprint)
1. **Microsoft Calendar sync** — We just set up Microsoft OAuth. Build calendar sync like Google.
2. **Background calendar sync** — Inngest job to auto-sync calendars every 15 min.
3. **Meeting upload UI** — Drag-drop transcript upload on the meetings page. Accept .txt, .vtt, .srt, audio files.
4. **Audio transcription** — When user uploads audio (mp3/m4a/webm), transcribe with Whisper API then process.
5. **Auto post-call workflow** — After transcript is processed: (a) update deal, (b) generate follow-up email draft, (c) create tasks from action items, (d) notify user.
6. **Meeting notes UI** — On meeting detail page: structured notes view (summary, key points, action items, buying signals, sentiment).
7. **Meeting prep auto-delivery** — Before a meeting, auto-generate prep and show in dashboard + optional email.

### Should Have (Phase 2 — next sprint)
8. **Recall.ai bot integration** — Auto-join meetings from calendar. Record. Transcribe. Push to pipeline.
9. **Real-time transcript display** — Live notes during call.
10. **Auto follow-up send** — Option to auto-send follow-up email X hours after call.

### Could Have (Phase 3)
11. **Zoom cloud recording import** — Detect when user has Zoom recording, auto-import transcript.
12. **Advanced analytics** — Talk ratio, objection patterns, win/loss call analysis.
13. **Video playback + synced transcript** — Split view with timestamp navigation.

## Decision
**Build Phase 1 this sprint.** It delivers massive value (background sync, upload flow, auto-processing, auto-CRM-update, meeting prep) with zero external dependencies. Phase 2 (Recall.ai) requires fixing the blocked account.
