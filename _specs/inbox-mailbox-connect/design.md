# A1 — inbox-mailbox-connect · Design

Anchored on real files (file:line). Reuse-first: A1 adds ONE new server flow
(OAuth-LINK init + callback) and ONE shared upsert helper, plus a thin UI swap.
Everything else (smtp_custom connect, EmailEngine registration, encryption,
per-user scope, sync cron, webhook) already exists and is reused unchanged.

## 1. The actual gap (why signIn is wrong here)

Today the mail-calendar page connects Google/Outlook by calling
signIn("google", { callbackUrl: "/settings/mail-calendar" })
(src/app/(dashboard)/settings/mail-calendar/page.tsx:133-139). That is a
next-auth SIGN-IN, which:

1. Runs the full auth signIn callback (src/auth.ts:448-462) and jwt callback
   (src/auth.ts:463-559) — it mutates/rotates the SESSION and resolves a tenant
   for the signing-in identity. With a second, different mailbox address and
   allowDangerousEmailAccountLinking=false (src/auth.ts:241,262) the flow either
   errors (email already in use) or, worse, swaps identity.
2. Writes ONLY an auth_account row (the DrizzleAdapter linkAccount,
   src/auth.ts:212-225) and fires google/oauth-connected for sync. It NEVER
   writes a connected_mailboxes row.

Consequence chain proving the gap is real:
- getInboxScope (src/lib/inbox/user-scope.ts:95-112) reads ONLY
  connected_mailboxes. An OAuth-only account therefore has NO mailbox row and
  its mail is invisible to the per-user unified inbox.
- The mail-calendar GET synthesizes a virtual id oauth-provider-email for
  OAuth-only accounts (src/app/api/settings/mail-calendar/route.ts:133),
  confirming there is no real row to send-as from or scope on.

A1 closes this by adding an OAuth-LINK flow that runs consent for the CURRENT
user, then drives the EXISTING EmailEngine-OAuth registration + a
connected_mailboxes upsert — without going through signIn.

## 2. Architecture diff vs existing

### Already there (reused unchanged)
- connected_mailboxes table + indexes (src/db/schema/outbound.ts:224-284).
- smtp_custom connect path: verify -> encrypt -> insert -> sync
  (src/app/api/settings/mailboxes/route.ts:72-156).
- EmailEngine OAuth registration body + POST /v1/account (route.ts:158-209).
  A1 calls the SAME registration; only the caller is new.
- encryptSecret AES-256-GCM (src/lib/crypto/settings-encryption.ts:49-62).
- OAuth token read/refresh helpers (src/lib/integrations/gmail.ts:11-60;
  decrypt/encrypt at src/lib/crypto/oauth-token-crypto.ts).
- Sync orchestration: email/sync-requested, google|microsoft/oauth-connected,
  the 15-min cron (src/inngest/sync-functions.ts:109,798-868,880-973).
- Inbound webhook tenant-resolution by ee_account_id
  (src/app/api/webhooks/emailengine/route.ts:55-62).
- needs_reauth surfacing (src/inngest/sync-functions.ts:172-183;
  src/app/api/settings/mail-calendar/route.ts:142).
- Plan-limit gate checkPlanLimit (src/lib/billing/plan-limits.ts:88,131).
- Per-user scoping + auth-id convention: authCtx.userId == auth-user id ==
  connected_mailboxes.user_id (src/lib/auth/auth-utils.ts:9-71;
  src/lib/auth/user-id.ts:9-19).

### Added (new files)
- src/app/api/settings/mailboxes/oauth-link/route.ts
  - GET (init): the R1 flow. Validates session + plan limit, mints a signed
    single-use state binding authUserId/tenantId/provider/nonce/exp, persists it
    (signed cookie + server nonce), and 302-redirects to the provider authorize
    URL with link-specific scopes and a fixed callback redirect_uri. NOT signIn.
- src/app/api/settings/mailboxes/oauth-link/callback/route.ts
  - GET (callback): the R2/R7 flow. Verifies state (R7.5), handles provider
    error/denied (R7.1), exchanges code for tokens server-side (R2.1), reads the
    verified email from userinfo (R2.4), calls the shared upsert helper, then
    redirects to /settings/mail-calendar with a linked=STATUS query param.
- src/lib/integrations/link-mailbox.ts
  - linkOAuthMailbox(authUserId, tenantId, provider, email, displayName,
    accessToken, refreshToken): the shared, idempotent core (R2.2-R2.5, R4,
    R6.1-R6.2, R7.3). Registers with EmailEngine, upserts the
    connected_mailboxes row on the (tenant,email) key, fires the initial sync.
    Returns the mailbox + a created flag and NEVER returns tokens.
- src/lib/auth/oauth-link-state.ts
  - signLinkState / verifyLinkState (HMAC over ELEVAY_APP_SECRET; single-use
    nonce; short TTL). Pure + unit-testable (R1.2, R7.5).
- Provider authorize/token/userinfo descriptors for google + microsoft-entra-id
  reused from existing env (GOOGLE_CLIENT_ID/SECRET, MICROSOFT_CLIENT_ID/SECRET,
  src/auth.ts:230-276). No new env beyond a fixed callback path.

### Changed (existing files)
- src/app/(dashboard)/settings/mail-calendar/page.tsx
  - connectGoogle/connectMicrosoft (lines 133-139): replace signIn(provider)
    with a navigation to /api/settings/mailboxes/oauth-link?provider=...
    Reconnect buttons (lines 437-445) and the setup chooser (lines 540-561)
    point at the SAME link flow. Reads the linked query param on return to
    surface success/cancel/error (R2.6, R7.1) via the existing error/badge slots.
- src/app/api/settings/mailboxes/route.ts
  - POST OAuth branch (lines 158-230): route OAuth links through
    linkOAuthMailbox so the idempotent upsert + dead-row refusal (R7.3) replace
    the bare insert (route.ts:215) and the console.warn+save-anyway
    (route.ts:210-212). The smtp_custom branch (72-156) is unchanged except it
    too adopts the idempotent upsert (R4) for re-connect parity.

## 3. Data model diff

NONE. No Drizzle CREATE/ALTER, no migration. Every column A1 needs already
exists on connected_mailboxes (src/db/schema/outbound.ts:224-284):
userId, tenantId, shared, emailAddress, displayName, provider, eeAccountId,
imap/smtp/secretEncrypted, imapLastUid, caldavUrl, domain, status,
warmupStartedAt. Idempotency keys already exist:
- uniqueIndex mailbox_tenant_email_idx on (tenant_id, email_address) (line 282).
- ee_account_id .notNull().unique() (line 243).

Verified no column is missing for A1. (If A2 send-as later needs a default-flag
it is out of scope here.)

## 4. Orchestration (Inngest)

No NEW Inngest function. A1 REUSES existing triggers:
- email/sync-requested (sync-functions.ts:109) — fired by linkOAuthMailbox after
  a successful link for an immediate first poll (R6.2), mirroring the smtp_custom
  POST (route.ts:141-153).
- google/oauth-connected + microsoft/oauth-connected (sync-functions.ts:
  798,859-868) — already fired on token grant; the link flow ensures the
  auth_account/EmailEngine tokens exist so these resolve.
- Cron: Sync All Email every 15 min (sync-functions.ts:880-973) — picks up the
  new active mailbox on the next tick (R6.3), no change.

## 5. Integrations (confirm vs locked stack)

| Concern | Provider | Confirmed at |
|----|----|----|
| OAuth identity (Google, Microsoft Entra) | next-auth client id/secret + scopes reused; A1 drives authorize/token directly (link, not signIn) | src/auth.ts:230-276 |
| OAuth mailbox token custody + send/read | EmailEngine (POST /v1/account, webhooks) | route.ts:158-209; webhooks/emailengine/route.ts |
| OAuth token read/refresh (server-side) | googleapis + oauth-token-crypto | gmail.ts:11-60 |
| smtp_custom transport | imapflow (IMAP poll) + smtp-send | imap.ts; smtp-send.ts |
| Password-at-rest | settings-encryption AES-256-GCM | settings-encryption.ts:49-62 |
| Background sync | Inngest | sync-functions.ts |

No new dependency, no new provider. All [LOCKED]. (package.json already carries
next-auth 5.0.0-beta.30, googleapis 171, imapflow 1.4, mailparser 3.7.)

## 6. Idempotent upsert design (linkOAuthMailbox + smtp_custom parity)

Pseudostep (R2.3, R4.1-R4.4, R7.3):
1. email = lowercased verified address; eeAccountId = tenantId + underscore +
   email with non-alphanumerics replaced by hyphens (same rule as route.ts:64).
2. EmailEngine register/upsert the account. If EE returns a hard failure -> THROW
   (caller maps to linked=error); do NOT write a dead row (R7.3). EE-unreachable
   is treated as a registration failure for the OAuth link entry point (unlike
   the legacy save-anyway at route.ts:210-212).
3. db upsert keyed on (tenantId, emailAddress): INSERT ... ON CONFLICT
   (tenant_id, email_address) DO UPDATE SET provider, ee_account_id,
   display_name, status (reactivate if was error/disabled, R4.3), updated_at.
   One row guaranteed (R4.2). Because ee_account_id is also UNIQUE and derived
   deterministically from (tenant,email), the two unique keys never disagree.
4. shared stays false; userId = authUserId (R5.1).
5. fire email/sync-requested (R6.2). Return the mailbox + created flag.

Concurrency: two simultaneous links of the same address both hit the ON CONFLICT
and converge; the loser updates rather than throwing (R4.2).

## 7. Security design (R8)

- Tokens never touch the client: the callback runs server-side, exchanges the
  code, and hands tokens straight to EmailEngine; the redirect back carries only
  a status enum, never a token (R8.1, R2.1).
- connected_mailboxes stores NO OAuth token (schema has no token column for the
  OAuth path; custody is EmailEngine + encrypted auth_account, src/auth.ts:
  212-225). smtp_custom password only as secretEncrypted ciphertext (R8.2).
- state is HMAC-signed over ELEVAY_APP_SECRET with a single-use nonce + short
  TTL; replay/forge/cross-user mismatch is rejected (R1.2, R7.5).
- Error paths log a redacted reason only — never the token, code, or password
  (R8.3). Reuse logger with an explicit field allow-list.
- Every endpoint requires getAuthContext (401 otherwise), same as the existing
  POST (route.ts:36-39) (R8.4).

## 8. G-design (UI gate, R9) — copy of F1 section 8

The add-mailbox surface (mail-calendar/page.tsx setup card + result states)
passes G-design when ALL 12 hold (cite the failing token on any miss); recorded
per-item in tasks.md B9:
1. Tokens only — no raw hex/rgb for color (the setup card already uses
   var(--color-*); the new linked-result banners must too).
2. One accent gradient — single --gradient-brand CTA; no second gradient.
3. One button system — shared Button (the provider buttons at page.tsx:540-561
   are hand-styled today; the gate flags them).
4. Type scale snaps — 13/12/11 as used; status copy on the scale.
5. Density — card padding/rhythm on the 4px grid.
6. Radius family — cards rounded-lg, chips/buttons rounded-md, one CTA 10px.
7. Elevation via --shadow-* only.
8. Contrast AA; state not conveyed by hue alone.
9. Dark-mode parity via .dark for every new banner.
10. lucide-only, no emoji (provider brand SVGs are allowed; no emoji).
11. Focus-visible ring + 100-150ms transitions; respects reduced-motion.
12. State coverage — empty/loading/error already present (loading skeleton
    page.tsx:302-318; empty 509-522; error slots 620,766); the new link-result
    (success/cancel/error) banners complete it.

No G-eval: A1 has no LLM surface, no model call, no eval bar — stated in the
requirements non-goals.

## 9. Guardrails (one line each)

- OAuth add-mailbox uses the link flow, never next-auth signIn (no session mutation).
- The callback exchanges tokens server-side; no token/code/password ever reaches the client or logs.
- One row per (tenant, email): all creates go through the idempotent upsert on the existing unique keys.
- Linked mailbox is personal: userId = authCtx.userId, shared = false, unless team-shared elsewhere.
- A failed EmailEngine registration on an OAuth link aborts with an error — never a dead saved row.
- smtp_custom password persists only as AES-256-GCM ciphertext (secretEncrypted).
- state is HMAC-signed, single-use, short-TTL, user+tenant bound; mismatches are rejected.
- Plan-limit gate runs before consent and before any row write.
- Every new endpoint is auth-gated (401 without a session).
- The add-mailbox UI passes the F1 12-item G-design checklist (R9).
