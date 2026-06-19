#!/usr/bin/env bash
#
# One-shot deploy of sovereign Jitsi + Jibri + Whisper on a fresh EU/CH VM
# (Debian/Ubuntu with Docker + Docker Compose). It layers our overlays onto the
# OFFICIAL docker-jitsi-meet release — we don't fork it — then prints the exact
# env vars to set on the Elevay app.
#
#   sudo bash setup.sh visio.pilae.ch you@pilae.ch
#
# What it does: host prep (snd-aloop for Jibri), fetch the pinned Jitsi release,
# generate passwords, enable TLS + recording + Jibri, drop in disableDeepLinking,
# install the finalize hook + a generated webhook secret, start everything, and
# bring up the self-hosted Whisper service.
#
# What stays yours: pointing DNS (visio.pilae.ch -> this VM), opening 80/443 (and
# 10000/udp for media) in the firewall, and the upload step inside finalize.sh
# (it must publish the recording at a URL the app can fetch). These are flagged
# below. Verify against the release README if a key has moved between versions.

set -euo pipefail

DOMAIN="${1:?usage: sudo bash setup.sh <domain> <letsencrypt-email>}"
EMAIL="${2:?usage: sudo bash setup.sh <domain> <letsencrypt-email>}"
JITSI_TAG="${JITSI_TAG:-stable-9646}"   # pin a known-good docker-jitsi-meet release
APP_WEBHOOK_URL="${APP_WEBHOOK_URL:-https://www.elevay.dev/api/webhooks/jibri}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="${DIR:-$HOME/jitsi-sovereign}"

echo "==> 1/6 Host prep: ALSA loopback (required by Jibri)"
modprobe snd-aloop || true
grep -qx 'snd-aloop' /etc/modules 2>/dev/null || echo 'snd-aloop' >> /etc/modules

echo "==> 2/6 Fetch docker-jitsi-meet ${JITSI_TAG}"
mkdir -p "$DIR" && cd "$DIR"
curl -fsSL "https://github.com/jitsi/docker-jitsi-meet/archive/refs/tags/${JITSI_TAG}.tar.gz" \
  | tar xz --strip-components=1
cp -n env.example .env
./gen-passwords.sh

echo "==> 3/6 Configure .env (domain, TLS, recording, Jibri)"
set_env() { # set_env KEY VALUE  (uncomment + set, or append)
  local k="$1" v="$2"
  if grep -qE "^#?${k}=" .env; then
    sed -i -E "s|^#?${k}=.*|${k}=${v}|" .env
  else
    echo "${k}=${v}" >> .env
  fi
}
set_env PUBLIC_URL "https://${DOMAIN}"
set_env LETSENCRYPT_DOMAIN "${DOMAIN}"
set_env LETSENCRYPT_EMAIL "${EMAIL}"
set_env ENABLE_LETSENCRYPT 1
set_env ENABLE_RECORDING 1
set_env HTTP_PORT 80
set_env HTTPS_PORT 443

echo "==> 4/6 Overlays: disableDeepLinking + finalize hook + secret"
mkdir -p ~/.jitsi-meet-cfg/{web,jibri,prosody,jicofo,jvb}
cp "$HERE/custom-config.js" ~/.jitsi-meet-cfg/web/custom-config.js

JIBRI_WEBHOOK_SECRET="$(openssl rand -hex 32)"
install -m 0755 "$HERE/finalize.sh" ~/.jitsi-meet-cfg/jibri/finalize.sh
set_env JIBRI_FINALIZE_RECORDING_SCRIPT_PATH /config/finalize.sh
# finalize.sh reads these from its environment (passed into the jibri container):
set_env JIBRI_WEBHOOK_SECRET "${JIBRI_WEBHOOK_SECRET}"
set_env WEBHOOK_URL "${APP_WEBHOOK_URL}"

echo "==> 5/6 Start Jitsi + Jibri"
# jibri.yml is the official Jibri profile shipped in the release.
docker compose -f docker-compose.yml -f jibri.yml up -d

echo "==> 6/6 Start self-hosted Whisper (OpenAI-compatible STT)"
docker compose -f "$HERE/docker-compose.whisper.yml" up -d

cat <<MSG

============================================================
Deployed. Two manual steps remain (only you can do these):

  1) DNS  : A record  ${DOMAIN}  ->  $(curl -fsS ifconfig.me 2>/dev/null || echo '<this VM public IP>')
            Open ports 80/tcp, 443/tcp, 10000/udp in the firewall.
  2) finalize.sh upload step: implement the TODO so the recording is published
     at a URL the app can GET (your storage / MinIO / kDrive).

Set these on the Elevay app (Vercel, production):

  VIDEO_MEET_BASE_URL=https://${DOMAIN}
  SOVEREIGN_RECORDING_ENABLED=true
  JIBRI_WEBHOOK_SECRET=${JIBRI_WEBHOOK_SECRET}
  WHISPER_BASE_URL=https://${DOMAIN}/whisper/v1   # or wherever you expose Whisper

Then reconnect your Google/Microsoft account (Settings -> Mail & Calendar) to
grant the calendar WRITE scope, and book a meeting from Call Mode to verify.
============================================================
MSG
