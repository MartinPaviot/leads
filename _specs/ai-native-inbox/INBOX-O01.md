# INBOX-O01 — Connect mailbox (Google / Microsoft / IMAP / Zimbra)
> Theme: T12 · Autonomy rung: passive · Priority: P0
> Pillar: P1 fidelity / cross (the gate to every other inbox feature)

## User story
As a new user, I want to connect my real mailbox — Google or Microsoft by OAuth, or any
IMAP/SMTP host (Zimbra, Infomaniak, OVH, Gandi) by entering its server details — in under a
minute and with a clear sense of what Elevay will and won't see, so the inbox fills with my
actual mail and every downstream AI feature has data to work on.

## Why (audit anchor)
Superhuman's signup is **OAuth-only** ("Continue with Google / Microsoft") then a card —
it can only serve Google/MS mailboxes on US SaaS (`ai-native-mailbox-audit.md` §Method;
`teardown-superhuman/feature-inventory.md` "My Account → Add Accounts"). That excludes the
sovereign segment entirely. Our connect flow already supports OAuth **and** raw IMAP/SMTP +
CalDAV (Zimbra/Infomaniak/OVH), which is the Pilae wedge — a category Superhuman cannot
serve. O01 hardens and de-risks the existing flow so "no mailbox → empty inbox"
(`lib/inbox/user-scope.ts`) is a one-step, trustworthy fix, not a dead end.

## Requirements (EARS)
- The system SHALL offer three connect paths from one surface: Continue with Google (OAuth),
  Continue with Microsoft (OAuth), and Other provider (IMAP/SMTP + optional CalDAV).
- WHEN the user picks Google or Microsoft, the system SHALL run the existing OAuth consent
  (`signIn("google" | "microsoft-entra-id")`) and return to `/settings/mail-calendar`.
- WHEN the user picks Other provider, the system SHALL require email + IMAP host/port + SMTP
  host/port + password, accept an optional CalDAV URL, and POST to `/api/settings/mailboxes`
  with `provider:"smtp_custom"`.
- The system SHALL store IMAP/SMTP credentials **encrypted** (`secret_encrypted`) and never
  echo the password back to the client.
- The system SHALL **verify the connection before persisting** an IMAP/SMTP mailbox (attempt
  an IMAP login + SMTP handshake) and return a specific, non-leaky error on failure.
- The system SHALL auto-detect the CalDAV collection from the same login when the URL is left
  blank, and fall back to "no calendar connected" rather than failing the whole connect.
- The system SHALL show each connected account's live state (Syncing / Active / Warming up /
  Reconnect needed) and a per-account remove/disconnect that revokes access.
- The system SHALL scope mailboxes to the connecting user (`connected_mailboxes.user_id =
  authCtx.userId`) so the inbox stays personal, never workspace-shared.
- The system SHALL state, in plain language at the point of connect, that OAuth never exposes
  the password and that IMAP/SMTP credentials are stored encrypted and used only to sync/send.
- WHEN no account is connected, the system SHALL render the "No accounts connected" empty
  state with a single Add-account CTA (the inbox empty state already deep-links here).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a user with no mailbox WHEN they click Continue with Google and consent THEN they
  return to `/settings/mail-calendar`, the account lists as "Syncing emails", and the inbox
  begins to populate within one sync cycle.
- GIVEN a Zimbra user WHEN they enter `mail.org.ch` IMAP 993 / SMTP 465 + password and submit
  THEN the connection is verified, the mailbox persists as `smtp_custom`, and calendar shows
  connected if a CalDAV collection was discovered.
- GIVEN wrong IMAP credentials WHEN the user submits THEN no row is written and the form shows
  "Couldn't connect the mailbox — double-check the server, port and password.", not a stack
  trace or provider-internal message.
- GIVEN an IMAP host that is unreachable WHEN the user submits THEN the form shows "Couldn't
  reach that server. Check the host and try again." and the user can retry without re-typing.
- GIVEN a connected OAuth account whose token has died WHEN the page loads THEN it shows
  "Reconnect needed" with a Reconnect button that re-runs consent.
- GIVEN a connected IMAP mailbox WHEN the user removes it THEN sync + sending stop and the
  credential row is deleted.
- GIVEN user A's mailbox WHEN user B in the same tenant loads settings THEN B does not see A's
  account (per-user scope).

## Edge cases & failure handling
- Same address connected twice (OAuth then IMAP, or vice-versa) → the unified view dedupes by
  lowercased email (`mailboxByEmail`), never two rows for one address.
- App-specific-password mailboxes (2FA on) → the password hint already tells the user to use
  one; a generic auth failure must not imply the wrong server.
- CalDAV URL points elsewhere (Infomaniak `sync.infomaniak.com`, Zimbra `/dav`) → honored when
  provided; auto-detect only when blank.
- OAuth consent denied / closed mid-flow → return to settings with no partial row; offer retry.
- Verify step times out on a slow host → bounded timeout, surface "couldn't reach", never hang
  the request.
- Self-hosted / Pilae: the IMAP/SMTP path is the sovereign route — no Google/MS dependency, EU/CH
  residency (INBOX-P04); credentials encrypted at rest.
- Multi-tenant: a mailbox is bound to one user; removing it never touches another user's rows.

## Best-in-class bar
- We connect **any IMAP/SMTP + CalDAV** host, not just Google/MS — the sovereign segment
  (Zimbra/Infomaniak/OVH, EU/CH residency, self-hostable) that Superhuman structurally cannot
  serve. The connect copy names those exact hosts, so a Pilae-type buyer self-serves.
- We **verify before persisting** and return human, non-leaky errors with the field to fix —
  cleaner than a generic "connection failed".
- The mailbox is **personal by construction** (per-user scope), matching the "inbox is personal"
  doctrine, so a connected account never leaks another teammate's mail.

## Design sketch
- **Data:** `connected_mailboxes` (`db/schema/outbound.ts`): `id, tenant_id, user_id,
  email_address, display_name, provider(gmail|outlook|smtp_custom), imap_host/port,
  smtp_host/port, secret_encrypted, caldav_url, status(warming_up|active|needs_reauth|…)`.
  OAuth tokens live on `auth_account` (`db/schema/auth.ts`), id_token decoded for the address.
- **API:** reuse `signIn(...)` (next-auth) for OAuth; `POST /api/settings/mailboxes`
  (`provider:"smtp_custom"`, encrypts via the OAuth/secret crypto helpers) + `DELETE
  /api/settings/mailboxes?id=` + `PATCH ?action=skip-warmup`; `DELETE /api/settings/oauth`
  for OAuth disconnect; the unified `GET/PUT /api/settings/mail-calendar` assembles accounts
  + sync prefs. Add an explicit verify step in the POST handler before insert.
- **UI:** `app/(dashboard)/settings/mail-calendar/page.tsx` — already the connect surface:
  `SettingsHeader`, `Card`/`CardBody`, `Button`, `Input`, `Badge`/`Tag`, `ConfirmDialog`, the
  `LabeledField` IMAP form with where-to-find hints. Tokens throughout (`--color-bg-card`,
  `--color-accent-soft`, status colors `--color-success/-warning/-error`). lucide: `Mail`,
  `Plus`, `Shield`, `RefreshCw`, `Calendar`, `Send`, `Trash2`, `ChevronDown`. The Google/MS
  brand SVGs are vendor *auth* buttons (allowed: they're the provider's own consent button,
  not a "sourced by Apollo"-style data-provenance label). No keyboard shortcut (settings form).
  Light + dark via tokens, no emoji, no data-provider name, every credential note stated plainly.
- **AI:** none (pure connection). It is the precondition for every AI inbox feature.
- **Security/perf:** OAuth = no password seen; IMAP/SMTP secret encrypted at rest; verify with a
  bounded timeout; per-user + tenant scope on read and delete; remove revokes access.

## Tasks (ordered, each with a verify step + test to write)
1. Add a pre-insert **verify** in `POST /api/settings/mailboxes` (IMAP login + SMTP handshake;
   bounded timeout) returning specific non-leaky errors. (verify: bad creds → 4xx + message, no
   row) (test: `mailboxes-connect.test.ts` — bad creds/unreachable host → no insert + message)
2. Confirm CalDAV auto-detect-on-blank vs honor-when-provided, and that calendar failure does
   not fail the mailbox connect. (verify: blank URL still connects mail) (test: connect-with/
   without-caldav cases)
3. Harden the unified `GET /api/settings/mail-calendar` dedupe by lowercased email + per-user
   scope. (verify: dual-connected address shows one row; B can't see A) (test: route scope test)
4. Empty-state + Reconnect/Disconnect/Remove paths exercised end-to-end. (verify: browser —
   connect Google, connect a Zimbra IMAP box, remove one) (test: page render of each state)
5. Connect-copy review: name Zimbra/Infomaniak/OVH, state OAuth-no-password + encrypted-creds.
   (verify: copy present, no data-provider names) (test: copy assertion / no-emoji lint)

## Current-state notes (VERIFY before building — code moves)
- `app/(dashboard)/settings/mail-calendar/page.tsx` is the live connect surface: `connectGoogle`
  (`:133`) / `connectMicrosoft` (`:137`) call `signIn`; `connectCustom` (`:141`) POSTs to
  `/api/settings/mailboxes` with `provider:"smtp_custom"` + optional `caldavUrl`; the IMAP form
  with where-to-find hints is `:578-635`; Shield privacy note `:570-576`.
- `app/api/settings/mail-calendar/route.ts` GET merges OAuth accounts (`auth_account`, id_token
  decoded `:113-123`) with `connected_mailboxes` (`:55-64`, user-scoped) and tenant sync prefs;
  `needs_reauth` via `isNeedsReauth` (`:141`). **No explicit pre-insert verify step lives in the
  GET route** — the verify belongs in the `POST /api/settings/mailboxes` handler (confirm it
  exists / add it).
- `connected_mailboxes` schema (`db/schema/outbound.ts`) carries `secret_encrypted`, `caldav_url`,
  `provider`, `status`; crypto via `lib/crypto/oauth-token-crypto` (`decryptOAuthToken` used in
  the route). VERIFY the POST handler at `app/api/settings/mailboxes/route.ts` encrypts the
  password and that a verify-before-insert is present (this spec adds it if missing).
- Inbox empty state already deep-links here (`app/(dashboard)/inbox/page.tsx` → `/settings/mail-calendar`).
- The onboarding flow has a "step 5 — Mail & Calendar sync" (`_research/.../onboarding/015-…png`);
  O01 is the same connect contract reused in onboarding and in settings.
