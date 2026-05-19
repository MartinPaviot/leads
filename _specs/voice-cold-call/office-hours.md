# Office hours — voice-cold-call

## Problem statement

A founder doing cold call today does 27 distinct tasks. 26 are mechanical and steal time from the only one that matters — the conversation. Elevay must automate the 26, surface intelligence during the conversation without interrupting it, and capture everything that happens after.

## Premise challenge

**Premise we are accepting**: cold call is still worth doing in 2026 for B2B founder-led sales.

Reality check:
- Connect rate on cold B2B mobile in 2026 is ~5-10% (Orum benchmark, Nooks 2025 report). Connect-to-meeting is ~15-25% of connected calls.
- A founder doing 60 calls in 90 minutes (with power dialing + good list) books 1-2 qualified meetings — comparable to a week of cold email replies.
- The differentiator vs cold email: real-time signal, on-the-spot objection handling, immediate booking. Email loses on velocity, call wins on velocity.

**Premise we reject**: "AI should do the call too". Voice agents (Vapi, Bland) work for transactional flows. They fail for discovery and pricing conversations because trust requires a human voice. Cohesion with the `ae-human-principle` memory.

## Alternatives explored

1. **Integrate a third-party dialer (Aircall, JustCall, Kixie)**.
   - Pro: ship in 2 weeks via an iframe + Zapier wiring.
   - Con: 3-5× the cost (they wrap Twilio at ~$80/seat/mo), zero ownership of the data flow, no live coaching, no compliance hooks. Dead end at $1M ARR.
   - Rejected.

2. **Build on Twilio directly (this path)**.
   - Pro: own the data, own the UX, integrate native with the brain/sequences/coaching pipelines that already exist in Elevay.
   - Con: 11 weeks build, ongoing maintenance, telephony compliance complexity.
   - Selected.

3. **Voice-only AI agent (Vapi/Retell does the whole call)**.
   - Pro: zero human time per call.
   - Con: kills trust on a first conversation, fails discovery, dissolves the founder→prospect relationship. Wrong tool for founder-led sales.
   - Rejected. Kept as optional Phase 5 for *post*-conversation booking flow only.

4. **Power dialer only, no coaching, no transcription**.
   - Pro: ships in 4 weeks.
   - Con: leaves 70% of the value on the table — transcription + coaching + auto-CRM is what makes Elevay's voice product worth paying for.
   - Rejected as a final destination, but **accepted as the Phase 1 shape** (we ship the dialer first, layer coaching in Phase 3).

## Layer check (3-layer knowledge)

- **Layer 1 — tried and true**: Twilio Programmable Voice + WebRTC SDK. Used by Outreach, Salesloft, Apollo. Don't reinvent.
- **Layer 2 — new and popular**: Deepgram Nova-3 streaming for live transcription. Adopted by Gong, Chorus replacements. Solid but watch latency at scale.
- **Layer 3 — first principles**: the coaching loop (transcript → classifier → playbook surface → learn from accepted responses). Nobody nails this in the call-recording space — Gong does post-hoc, not live. Worth building bespoke.

## Completeness target

10/10. Every cold caller task except the voice must be covered. Anything less and we ship a "phone in a CRM" — commodity. Lake is boilable: the integrations are all REST/WebSocket, the schemas are well-bounded.

What we *deliberately leave for later*:
- Cold call in multiple languages other than FR/EN (Deepgram supports it, we don't expose it Phase 1)
- Mobile app (web-first, founder uses laptop)
- Co-pilot mode where two humans listen to one call (manager + AE)

## Why now

- Sovereignty pack just shipped (commit `f41af03`) — EU pinning is in. Voice is the next vertical that needs the same scrutiny (recording storage location, transcript residency).
- Cold email sequences already mature in Elevay. Cold call closes the channel matrix.
- Lightfield trial expires 2026-04-13 (already passed) — competitive pressure to ship the channel-completeness story.
