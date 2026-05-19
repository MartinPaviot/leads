# Voice bootstrap (Twilio + Deepgram)

Step-by-step setup for Call Mode. Plan on ~45 minutes the first time.

## 0. Prerequisites

- A workspace on https://www.twilio.com/console/ (free trial is fine for dev — buy a real number for production).
- A Deepgram account (https://console.deepgram.com).
- `pnpm` workspace at `app/apps/web`.
- For local dev: `ngrok` installed (`brew install ngrok` or download).

## 1. Install the packages

```bash
cd app/apps/web
pnpm add twilio @twilio/voice-sdk @deepgram/sdk
```

`twilio` powers the server-side calls and TwiML; `@twilio/voice-sdk` runs in the browser to attach the microphone; `@deepgram/sdk` is for the Phase 1.5 streaming transcription worker.

## 2. Create the Twilio credentials

1. https://console.twilio.com → grab `Account SID` and `Auth Token` from the Project Info card. Paste into `.env.local` as `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`.
2. https://console.twilio.com/us1/account/keys-credentials/api-keys → **Create API Key**, type "Standard". Save the SID and the secret immediately — Twilio shows the secret only once. `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET`.
3. https://console.twilio.com/us1/develop/voice/manage/twiml-apps → **Create new TwiML App**. Set:
   - Voice Request URL → `https://YOUR_NGROK.ngrok-free.app/api/calls/twiml`
   - Voice Method → POST
   - Voice Status Callback URL → `https://YOUR_NGROK.ngrok-free.app/api/calls/recording-status`
   - Voice Status Callback Method → POST

   Save the App SID into `TWILIO_APP_SID`.
4. `TWILIO_REGION=ie1` for EU media residency (production). `us1` if your prospects are all US.

## 3. Buy a phone number

For now this is a manual step — Phase 2 of voice-cold-call adds an in-app `Buy more` button.

1. https://console.twilio.com/us1/develop/phone-numbers/manage/search → pick a number in the country/area code you're targeting. Voice capability is mandatory.
2. After purchase, the number lands in https://console.twilio.com/us1/develop/phone-numbers/manage/incoming → click it → set:
   - A CALL COMES IN → TwiML App → select the App you just made (`TWILIO_APP_SID`).
3. Run the SQL one-off (psql or Drizzle Studio) to register the number in the pool table:

   ```sql
   INSERT INTO phone_number_pool (tenant_id, e164, twilio_sid, country_code, area_code, voice, sms, active)
   VALUES (
     'YOUR_TENANT_ID',
     '+33123456789',
     'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
     'FR',
     NULL,
     true, false, true
   );
   ```

## 4. Deepgram

1. https://console.deepgram.com → create an API Key, role "Member" is enough.
2. Paste into `DEEPGRAM_API_KEY`.
3. The streaming integration is wired in Phase 1.5; in Phase 1 the key is unused at runtime but required so the env validation passes.

## 5. Recording disclosure MP3

Two-party consent regions (France + US states CA, IL, FL, PA, MA, MD, NV, NH, WA) need a pre-recorded disclosure that plays the moment the call connects. ~5-10 seconds. Suggested script (FR):

> « Bonjour. Cet appel est susceptible d'être enregistré pour amélioration de la qualité de service. Vous pouvez demander à tout moment l'arrêt de l'enregistrement. »

Host the MP3 anywhere Twilio can reach over HTTPS (S3, Supabase Storage, R2). Paste the URL into `VOICE_DISCLOSURE_AUDIO_URL`.

## 6. ngrok (dev only)

```bash
ngrok http 3000
```

Copy the `https://*.ngrok-free.app` URL into `VOICE_PUBLIC_BASE_URL` and update the TwiML App's webhook URLs to match. Restart the Next.js dev server so the env reloads.

## 7. Sanity check

1. Open `http://localhost:3000/settings/sending-infrastructure` → the **Voice (Twilio)** card should say "Twilio connecté" and list the pool number.
2. Open `http://localhost:3000/call-mode` → the queue loads.
3. Add your own mobile to a test contact in the workspace (Contacts → New). Click `Appeler`.
4. The browser asks for microphone permission. Allow.
5. Your phone rings. Pick up, speak, hang up.
6. After hangup, `/calls/<id>` should populate within 30s with the summary + structured notes.

If any step fails, the most common causes are:
- TwiML App webhooks pointing to the wrong ngrok URL (rotates each restart unless on a paid plan)
- Phone number not bound to the TwiML App in the Incoming Numbers config
- `VOICE_PUBLIC_BASE_URL` not matching what Twilio actually called us at — the signature validation will reject

## 8. Production

When you cut over to a real domain (e.g. `elevay.ai`):

1. Update `VOICE_PUBLIC_BASE_URL` in production env.
2. Update the TwiML App webhooks to the production URL.
3. Set `TWILIO_REGION=ie1` for EU sovereignty (or `us1`).
4. Stop ngrok.

Phase 2 will move the Twilio config UI into the app and remove the SQL one-off.
