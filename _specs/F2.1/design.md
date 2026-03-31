# F2.1: Email Sync — Design

## System Fit
Email sync feeds the Memory Engine. Every captured email becomes an activity that's searchable, queryable via NL, and shows in contact/account timelines. It's the data foundation for F2.5 (summarization), F2.6 (embeddings), and F2.7 (NL queries).

## Technology
- **Google Gmail API** via `googleapis` npm package
- **Auth.js Google provider** already configured with OAuth
- Need additional scopes: `gmail.readonly` for email access
- **Drizzle ORM** for database operations

## Data Flow
1. User clicks "Connect Gmail" → Auth.js Google OAuth with gmail.readonly scope
2. OAuth callback stores access_token + refresh_token in auth_account table
3. Sync job runs:
   a. Fetch message list from Gmail API (last 30 days)
   b. For each message, fetch headers (From, To, Subject, Date)
   c. Match From/To emails to contacts in database
   d. Create activity record with type "email_sent" or "email_received"
   e. Store gmail message ID for dedup
4. Re-sync skips messages with existing gmail_message_id

## Data Model
Uses existing `activities` table:
- `activityType`: "email_sent" or "email_received"
- `channel`: "email"
- `direction`: "outbound" or "inbound"
- `summary`: email subject line
- `metadata`: { gmailMessageId, from, to, snippet, threadId }
- `entityType` + `entityId`: linked contact if matched

New columns needed on `auth_account` table:
- Already stores access_token, refresh_token via Auth.js adapter
- Add `gmail_sync_cursor` to track last sync position (store in metadata or separate table)

## API Contracts
- `POST /api/email/connect` → triggers OAuth flow (redirects to Google)
- `POST /api/email/sync` → runs sync job (authenticated)
- `GET /api/email/status` → returns sync status (last sync, count)

## Security
- OAuth tokens encrypted in database (Auth.js handles this)
- Gmail API calls use user's own token (not a service account)
- Only reads emails (gmail.readonly scope) — never sends
- Refresh token rotation handled by Auth.js

## Failure Handling
- Gmail API rate limit → exponential backoff with max 3 retries
- Token expired → auto-refresh via refresh token
- Token revoked → mark account as disconnected, show reconnect UI
- Network error → retry once, then fail gracefully with error message
