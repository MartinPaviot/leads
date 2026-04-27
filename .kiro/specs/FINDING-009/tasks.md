# FINDING-009: Tasks

## Task 1: Create recording_consents table and schema (~1h)
- Add `recordingConsents` table to `db/schema.ts` with columns: id, activityId, tenantId, participantEmail, notificationSentAt, response, respondedAt, hostOverride, createdAt
- Create Drizzle migration
- **Verify:** Migration runs; table visible in database

## Task 2: Implement consent notification flow (~2h)
- Modify `createBotForActivity` in `bot-deployment.ts` to check consent before deploying
- If external attendees present and consent not collected, create consent records and dispatch `recording/send-consent` event
- Return `{ status: "awaiting_consent" }` as new DeploymentOutcome variant
- **Verify:** Unit test confirms bot not deployed when consent missing

## Task 3: Create consent API endpoints (~1.5h)
- Create `api/recording/consent/[id]/opt-out/route.ts` — public, token-authenticated
- Create `api/recording/consent/[id]/override/route.ts` — host-only, session-authenticated
- Both update `recording_consents` table and dispatch follow-up events
- **Verify:** Integration tests for opt-out and override flows

## Task 4: Create Inngest consent-check function (~1.5h)
- Create `inngest/recording-consent-check.ts`
- Triggered by delayed event (meeting time - 5 min)
- Checks all consent records: if any opted_out without host override, cancel bot
- Otherwise deploy bot via existing `createBot()`
- **Verify:** Test: all accepted -> deploys; one opted out -> cancels; opted out + override -> deploys

## Task 5: Consent email template (~1h)
- Create email template with meeting details, recording notice, and opt-out link
- Opt-out link includes signed token for unauthenticated access
- **Verify:** Email renders correctly; opt-out link resolves to correct endpoint
