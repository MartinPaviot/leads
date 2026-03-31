# F2.1 Email Sync — Office Hours

## Problem statement
Founders doing founder-led sales send/receive emails from their personal Gmail/Outlook. The CRM needs to automatically capture these emails and attach them to the right contacts and accounts — without manual data entry.

## Premise challenge
**Assumption**: We need to sync emails via Google/Microsoft OAuth APIs.
**Challenge**: Is there a simpler approach?
- Could we use IMAP instead? — Yes, but OAuth is the modern standard and gives us calendar too. IMAP is a fallback.
- Could we use email forwarding/BCC? — Simpler but less complete. Misses inbound emails.
- Could we start with manual email logging via the chat? — Lower scope but doesn't solve the "zero manual entry" promise.

**Verdict**: OAuth email sync is the right approach. It's what Lightfield and Monaco both do. It's the foundation for auto-capture.

## Alternatives explored
1. **Google Gmail API via OAuth** — read user's sent/received emails, create watches for real-time updates. Most founders use Gmail.
2. **Microsoft Graph API via OAuth** — same for Outlook. Needed for enterprise customers.
3. **IMAP polling** — connect directly to mailbox. Works with any provider but less reliable, no webhooks.

**Decision**: Start with Google Gmail API. Add Microsoft later.

## Layer check
- Layer 1 (tried and true): NextAuth Google provider (already have it). Gmail API is well-documented.
- Layer 2 (new and popular): Not applicable.
- Layer 3 (first principles): The email sync flow itself is custom.

## Completeness target: 8/10
- 10 would include: full 2-year backfill, real-time webhooks, duplicate detection, thread grouping, attachment handling
- 8 covers: OAuth connect, initial sync (last 30 days), periodic polling, contact matching, activity creation
- Missing for 8: real-time webhooks (use polling instead), attachment content (store metadata only)

## Scope for M2
1. Google OAuth consent + token storage
2. Initial sync: fetch last 30 days of sent/received emails
3. Match emails to existing contacts by email address
4. Create activity records for each email
5. Store email subject, snippet, from/to, date
6. Periodic re-sync (manual trigger for now, background job later)
