# G28: Microsoft OAuth Email Sync

## Status: 🟡 BLOCKED — Martin must register Azure app manually

## Blocker
Microsoft blocked automated account creation for azure-signup@elevay.dev (unusual activity).
Martin must register an app manually via portal.azure.com with his existing MS account.

## Required Azure App Config
1. Go to portal.azure.com → Azure Active Directory → App registrations → New registration
2. Name: "LeadSens"
3. Redirect URI: `https://app.leadsens.com/api/auth/callback/microsoft-entra-id` (or localhost for dev)
4. API permissions: `User.Read`, `Mail.Read`, `Calendars.Read`, `offline_access`
5. Generate client secret

## Env Vars Needed
```
MICROSOFT_CLIENT_ID=<from azure app>
MICROSOFT_CLIENT_SECRET=<from azure app>
```

## Implementation Plan (once unblocked)
1. Add `microsoft-entra-id` provider to NextAuth config in `auth.ts`
2. Create `lib/microsoft-graph.ts` with email + calendar sync
3. Create `app/api/email/sync-outlook/route.ts`
4. Reuse existing activity creation logic from Gmail sync

## Acceptance Criteria
GIVEN a user connects their Microsoft account
WHEN the OAuth flow completes
THEN their Outlook emails and calendar events are synced to activities
