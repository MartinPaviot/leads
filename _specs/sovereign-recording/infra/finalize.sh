#!/usr/bin/env bash
#
# Jibri finalize hook — runs after a recording is written. Wire it via
# JIBRI_FINALIZE_RECORDING_SCRIPT_PATH in the Jibri container.
#
# It reads the Jitsi room from Jibri's metadata.json, uploads the recording to
# your (sovereign, CH/EU) storage, then POSTs a SIGNED finalize event to the
# app's /api/webhooks/jibri. The app then transcribes (self-hosted Whisper) and
# runs the meeting-intel pipeline. The prospect's voice only ever touches your
# infra + your Whisper.
#
# Env required:
#   JIBRI_WEBHOOK_SECRET  shared HMAC secret (must equal the app's)
#   WEBHOOK_URL           e.g. https://www.elevay.dev/api/webhooks/jibri
# Provide your own upload step (see TODO) — it must return a URL the app can GET.
#
# Args: $1 = the directory Jibri wrote the recording into.

set -euo pipefail

RECORDING_DIR="${1:?finalize.sh: recording directory arg missing}"
: "${JIBRI_WEBHOOK_SECRET:?set JIBRI_WEBHOOK_SECRET}"
: "${WEBHOOK_URL:?set WEBHOOK_URL}"

META="$RECORDING_DIR/metadata.json"

# Jibri's metadata.json carries the meeting URL, e.g.
# https://visio.pilae.ch/rdv-ab3k...  -> room name is the last path segment.
MEETING_URL="$(jq -r '.meeting_url // empty' "$META" 2>/dev/null || true)"
ROOM_NAME="$(printf '%s' "${MEETING_URL%%\#*}" | sed -E 's#.*/##')"
if [ -z "$ROOM_NAME" ]; then
  echo "finalize.sh: could not derive room name from $META" >&2
  exit 1
fi

# The recording file Jibri produced (newest mp4 in the dir).
REC_FILE="$(ls -t "$RECORDING_DIR"/*.mp4 2>/dev/null | head -n1 || true)"

# --- TODO: upload REC_FILE to YOUR sovereign storage and capture the URL. ---
# Must be a URL the Next app can fetch server-side. Examples: an Infomaniak
# Swiss Backup / kDrive public-but-unguessable link, a MinIO bucket on your VM,
# or an internal URL reachable from the app. Audio-only (mp3/m4a) keeps the
# Whisper payload small.
#   AUDIO_URL="$(your-upload-command "$REC_FILE")"
AUDIO_URL="${AUDIO_URL:-}"   # set by your upload step above
if [ -z "$AUDIO_URL" ]; then
  echo "finalize.sh: AUDIO_URL not set — implement the upload step." >&2
  exit 1
fi

# Build + sign the body. Signature = hex HMAC-SHA256 of the raw body.
BODY="$(jq -nc --arg r "$ROOM_NAME" --arg u "$AUDIO_URL" \
  '{roomName:$r, status:"finalized", audioUrl:$u}')"
SIG="$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$JIBRI_WEBHOOK_SECRET" -hex | sed 's/^.*= //')"

curl -fsS -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-jibri-signature: sha256=$SIG" \
  --data "$BODY"

echo "finalize.sh: posted finalize for room $ROOM_NAME"
