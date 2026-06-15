# Sovereign recording — infrastructure (ops)

This is the **ocean** the app code (T1–T8) deliberately leaves to you. The app
is inert until these endpoints exist and `SOVEREIGN_RECORDING_ENABLED=true`.

Goal: the prospect's voice never leaves CH/EU infrastructure you control.
Pipeline: **Jitsi room → Jibri (records) → finalize.sh → /api/webhooks/jibri →
Whisper (self-host) → applyTranscript (existing intel).**

## Quick start (one script)
On a fresh EU/CH VM (Debian/Ubuntu + Docker), from this `infra/` folder:
```bash
sudo bash setup.sh visio.pilae.ch you@pilae.ch
```
It does host prep (snd-aloop), fetches the pinned official `docker-jitsi-meet`,
enables TLS + recording + Jibri, drops in `disableDeepLinking`, installs the
finalize hook with a generated `JIBRI_WEBHOOK_SECRET`, starts Jitsi+Jibri, and
brings up Whisper. It then prints the exact app env vars. **Only two things stay
manual** (credentials/physical, see below): pointing DNS, and the upload step in
`finalize.sh`.

## Prerequisites (host)
- A CH/EU VM you control (Infomaniak, Exoscale, Hetzner-EU…).
- DNS: `visio.pilae.ch` → that VM (matches `VIDEO_MEET_BASE_URL`).
- **Jibri needs the ALSA loopback kernel module on the host**: `modprobe snd-aloop`
  and persist it in `/etc/modules`. Jibri records via a virtual sound device, so
  this is non-negotiable and is why Jibri is its own box, not just a container flag.
- Start from the official `docker-jitsi-meet` release (it generates the shared
  passwords in `.env` via `gen-passwords.sh`). The compose here layers our
  specifics on top; it is **not** a from-scratch Jitsi cluster.

## App env vars (Vercel / the Next app)
| Var | Purpose |
|---|---|
| `SOVEREIGN_RECORDING_ENABLED` | `true` to arm the Jibri webhook + suppress Recall for Jitsi rooms |
| `JIBRI_WEBHOOK_SECRET` | shared secret; `finalize.sh` signs the POST, the webhook verifies (HMAC-SHA256) |
| `WHISPER_BASE_URL` | self-hosted Whisper, OpenAI-compatible, e.g. `https://whisper.pilae.ch/v1` |
| `WHISPER_MODEL` | optional, default `gpt-4o-mini-transcribe`; self-host e.g. `Systran/faster-whisper-large-v3` |
| `VIDEO_MEET_BASE_URL` | your Jitsi host, e.g. `https://visio.pilae.ch` (already used by booking) |

## Sovereignty levels (config, not code)
- **Middle (recommended)**: set `WHISPER_BASE_URL` (self-host). Raw voice stays in CH/EU; only the text transcript goes to the existing LLM.
- **Total**: also point `lib/ai/ai-provider` at an EU model (Mistral) for the intel extraction.
- **Pragmatic**: leave `WHISPER_BASE_URL` unset → OpenAI Whisper (US). Same code.

## Steps
1. Provision the VM; `modprobe snd-aloop`; point `visio.pilae.ch` at it.
2. Deploy Jitsi from `docker-jitsi-meet`, enable the **jibri** profile, and apply
   `config.disableDeepLinking = true` (frictionless mobile join — see the app's
   `video-meeting.ts`; setting it server-side lets the join URL stay clean).
3. Mount `finalize.sh` into the Jibri container as its finalize script
   (`JIBRI_FINALIZE_RECORDING_SCRIPT_PATH`). Give it `JIBRI_WEBHOOK_SECRET`,
   `WEBHOOK_URL`, and your upload target.
4. Run a Whisper service (see `docker-compose.whisper.yml`); set `WHISPER_BASE_URL`.
5. In the app: set the env vars above and `SOVEREIGN_RECORDING_ENABLED=true`.
6. Verify with `_specs/sovereign-recording/requirements.md` eval steps (signed
   POST → activity gets `structuredNotes`, `transcriptSource: "jibri"`).

## How a recording becomes CRM intel
`finalize.sh` reads the room from Jibri's `metadata.json`, uploads the recording
to your storage, then POSTs a signed `{ roomName, status:"finalized", audioUrl }`.
The webhook resolves the meeting by `roomName`, checks consent, transcribes the
audio via `WHISPER_BASE_URL`, and runs the same `applyTranscript` writer as the
phone-call path → summary, BANT/buying-signals, coaching, deal update.
