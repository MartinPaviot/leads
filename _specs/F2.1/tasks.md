# F2.1: Email Sync — Tasks

## Task 1: Add Gmail scope to Google OAuth
- [ ] Update auth.ts to request `https://www.googleapis.com/auth/gmail.readonly` scope
- [ ] Update Auth.js config to store access_token and refresh_token
- [ ] Verify: Sign in with Google → token stored in auth_account table
- [ ] Test: `auth_account` table has access_token after Google sign-in

## Task 2: Install Gmail API client
- [ ] `pnpm add googleapis`
- [ ] Create `src/lib/gmail.ts` with Gmail client factory using stored OAuth tokens
- [ ] Verify: Can instantiate Gmail client from stored tokens
- [ ] Test: Unit test for Gmail client creation with mock tokens

## Task 3: Build email sync API route
- [ ] Create `POST /api/email/sync` route
- [ ] Fetch message list from Gmail API (query: `after:30d`)
- [ ] For each message, fetch headers (From, To, Subject, Date, Message-ID)
- [ ] Parse email addresses from headers
- [ ] Verify: API returns list of fetched message headers
- [ ] Test: Mock Gmail API, verify correct parsing of email headers

## Task 4: Contact matching
- [ ] For each email, look up From/To addresses in contacts table
- [ ] If match found → link activity to contact
- [ ] If no match → create unlinked activity
- [ ] Verify: Email from known contact has entityId set
- [ ] Test: Mock data with matching and non-matching contacts

## Task 5: Create activity records
- [ ] For each synced email, create activity with:
  - activityType: "email_sent" (if from user) or "email_received" (if to user)
  - channel: "email"
  - direction: "outbound" or "inbound"
  - summary: email subject
  - metadata: { gmailMessageId, from, to, snippet, threadId }
- [ ] Dedup by gmailMessageId (skip if activity with same ID exists)
- [ ] Verify: Activities appear in database after sync
- [ ] Test: Verify dedup on re-sync

## Task 6: Sync status API
- [ ] Create `GET /api/email/status` returning last sync time and count
- [ ] Store sync metadata (last sync timestamp, total synced) in tenant settings or separate table
- [ ] Verify: Status endpoint returns accurate data after sync
- [ ] Test: Status before and after sync

## Task 7: Settings UI for email connection
- [ ] Add "Email & Calendar" section to Settings page
- [ ] Show "Connect Gmail" button when not connected
- [ ] Show connection status (email, last sync, count) when connected
- [ ] Add "Sync now" button to trigger manual sync
- [ ] Verify: Full flow works in browser
- [ ] Test: Screenshot evidence of connected state
