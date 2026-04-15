# WS-1 — Recon notes (T4 output)

## Bot creation entry point

- Low-level API : `lib/recall.ts:87` → `createBot(meetingUrl, { botName?, webhookUrl? })`
- Default bot_name : "Elevay" (hardcoded at `recall.ts:98` — **bug: recordingBotName from tenant settings is never read**)

### Call sites (3 — all need to switch to the new wrapper)

1. `inngest/recall-functions.ts:58` — scheduled bot deployment cron
2. `inngest/meeting-functions.ts:128` — calendar sync, if meeting starts within 30min
3. `api/meetings/route.ts:188` — manual scheduling from UI

### Strategy

Create `lib/recording/bot-deployment.ts` exporting `createBotForActivity(activityId)`:
- Loads activity, tenant (with settings), attendees from activity.metadata.attendees
- Calls `decideBrandingMode`
- If `opted_out` → return null, set activity.metadata.brandingDecision for observability
- Else → calls lib/recall.ts createBot with `decision.botDisplayName`
- After bot success, batch INSERT exposures in transaction
- Returns bot + decision

Each of the 3 call sites switches from `createBot(link)` to `createBotForActivity(activityId)`.

## Tenant creation entry point

- `auth.ts:20-46` → `resolveUserTenant(authUserId, email)`
- On first login : creates row in `tenants` (line 31-34) then `users` (line 36-43)
- Called from NextAuth callbacks (Google / Microsoft / Credentials providers)

### Strategy

After tenant is inserted (line 34), before returning, call
`attributeSignupFromExposure(tenant.id, email)` from new
`lib/recording/channel.ts`. Non-blocking — if it throws, log but return normally.

## Test-mode seed

`api/test-e2e/seed/route.ts:49` also creates tenants for E2E tests. Use the
same attribution hook (or skip via `skipAttribution` flag) for deterministic tests.

## Drizzle schema additions

In `app/apps/web/src/db/schema.ts` after the existing tables (line ~229 has
`tenants`), add :
- `notetakerExposures` (pgTable)
- `tenantReferralCredits`
- `referralCreditEvents`

Schema file already imports `pgTable, text, timestamp, jsonb, integer, uniqueIndex, index`.

## Migration file path

`app/apps/web/drizzle/0016_notetaker_channel.sql` (next after `0015_comments.sql`).

Also a drizzle meta JSON snapshot will be generated — run `pnpm drizzle-kit generate`
to produce the `meta/0016_snapshot.json`.
