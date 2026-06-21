# A1 — inbox-mailbox-connect · Requirements (EARS)

**Feature:** OAuth-LINK "add another mailbox" (attach to the CURRENT signed-in
user, not a sign-in) + direct IMAP/SMTP connect. The multi-mailbox
centralization entry point: one user, many connected mailboxes, one unified inbox.

**Prio:** P0. **Deps:** none. **Track:** A (multi-mailbox centralization).

## Ground-truth inventory (verified 2026-06-19, worktree app/apps/web)

| Capability | State | Evidence |
|----|----|----|
| connected_mailboxes table (userId, tenantId, shared, provider, eeAccountId, imap/smtp, secretEncrypted, imapLastUid, caldavUrl, domain, status) | [DONE] | src/db/schema/outbound.ts:224-284 |
| Direct IMAP/SMTP connect (verify, encrypt password, row provider=smtp_custom, userId=authCtx.userId, first sync) | [DONE] | src/app/api/settings/mailboxes/route.ts:72-156 |
| EmailEngine OAuth registration in the same POST when accessToken/refreshToken are passed | [DONE] (path exists) | route.ts:158-230 |
| AES-256-GCM secret encryption (encryptSecret) | [DONE] | src/lib/crypto/settings-encryption.ts:49-62 |
| Per-user inbox scope reads ONLY connected_mailboxes rows the user owns (+shared) | [DONE] | src/lib/inbox/user-scope.ts:95-112 |
| Poll cron enumerates status=active mailboxes; smtp_custom via imap_last_uid, OAuth via auth_account | [DONE] | src/inngest/sync-functions.ts:880-973; src/lib/integrations/imap.ts |
| EmailEngine inbound webhook resolves tenant by ee_account_id | [DONE] | src/app/api/webhooks/emailengine/route.ts:55-62 |
| authCtx.userId IS the auth-user id (= connected_mailboxes.user_id space) | [DONE] | src/lib/auth/auth-utils.ts:9-71; src/lib/auth/user-id.ts:9-19 |
| Plan-limit gate on mailbox count | [DONE] | route.ts:42-54; src/lib/billing/plan-limits.ts:11-14,131 |
| OAuth-LINK flow (run consent for an ADDITIONAL mailbox of the CURRENT user, persist a connected_mailboxes row, WITHOUT mutating the auth session/identity) | [NEW] | gap: UI calls signIn("google"...) (mail-calendar/page.tsx:133-139), a SIGN-IN that swaps/links the session identity and never writes a connected_mailboxes row |
| OAuth-only mail in the unified inbox | [NEW] | gap: getInboxScope (user-scope.ts:107) reads only connected_mailboxes; an OAuth-only auth_account has no row, so its mail never appears in the per-user inbox |
| De-dup on link (idempotent re-link of an already-connected address) | [NEW] | gap: POST does a bare insert (route.ts:114,215); mailbox_tenant_email_idx + ee_account_id.unique() make a re-link throw a 500 instead of no-op |

[LOCKED] stack (do NOT reopen): next-auth v5 (src/auth.ts), EmailEngine for
OAuth-mailbox token custody (route.ts:158-209, webhook), imapflow for
smtp_custom (src/lib/integrations/imap.ts), settings-encryption AES-256-GCM
for the smtp_custom password, Inngest for sync. No new provider/dependency.

## Scope decision (read before requirements)

The smtp_custom path and the EmailEngine-OAuth registration helper are
[DONE] and reused as-is. A1's real work is the OAuth-LINK initiation +
callback: a server flow that (a) runs provider consent attributed to the
current user, (b) hands the resulting tokens to the existing EmailEngine
registration, (c) writes/upserts a connected_mailboxes row, and (d) returns
to settings — all WITHOUT calling next-auth signIn (which mutates the
session). De-dup is hardened to idempotent. Non-goals are tracked to A2/A3/A4.

---

## R1 — OAuth-LINK initiation (add-to-current-user, not sign-in)

- **R1.1 [NEW]** WHEN a signed-in user requests to add a Google or Outlook
  mailbox, THE SYSTEM SHALL begin a provider OAuth authorization attributed to
  the current authCtx.userId/authCtx.tenantId, NOT a next-auth signIn.
- **R1.2 [NEW]** THE SYSTEM SHALL carry a CSRF-resistant, single-use state
  that binds the callback to the initiating user and tenant, signed/stored
  server-side so it cannot be forged or replayed.
- **R1.3 [NEW]** WHILE the OAuth-LINK flow runs, THE SYSTEM SHALL NOT mutate the
  next-auth session, JWT, auth_user, or the user's primary identity — the user
  remains signed in as themselves after the round-trip.
- **R1.4 [NEW]** THE SYSTEM SHALL request the mail + calendar scopes EmailEngine
  needs (Gmail read+send+calendar; Outlook Mail.ReadWrite/Mail.Send) with
  access_type=offline + prompt=consent so a refresh token is always returned.
- **R1.5 [NEW]** WHEN the user is over their plan's mailbox limit, THE SYSTEM
  SHALL refuse to start the link flow with the same PLAN_LIMIT_EXCEEDED
  contract the smtp_custom POST already returns (route.ts:42-54).

## R2 — OAuth-LINK callback to connected_mailboxes row

- **R2.1 [NEW]** WHEN the provider redirects back with a valid authorization
  code and a matching state, THE SYSTEM SHALL exchange the code for access +
  refresh tokens server-side and never expose them to the client.
- **R2.2 [NEW]** THE SYSTEM SHALL register the mailbox with EmailEngine via the
  existing OAuth body (account + oauth2 provider/accessToken/refreshToken,
  route.ts:163-198), deriving eeAccountId exactly as today
  (tenantId_email-sanitised, route.ts:64).
- **R2.3 [NEW]** THE SYSTEM SHALL upsert a connected_mailboxes row with
  userId = authCtx.userId, tenantId = authCtx.tenantId, provider in
  {gmail, outlook}, eeAccountId, emailAddress (lowercased), displayName, and
  domain — matching the existing insert shape (route.ts:215-228).
- **R2.4 [NEW]** THE SYSTEM SHALL resolve the mailbox's verified email from the
  provider OIDC/userinfo (Google email, MS mail/userPrincipalName), never from
  client input, so a user cannot link an address they do not control.
- **R2.5 [NEW]** WHEN the OAuth mailbox is registered, THE SYSTEM SHALL set
  status to the same value the existing OAuth path uses (warming_up with
  warmupStartedAt, route.ts:225-226) — A1 does NOT change warmup policy.
- **R2.6 [NEW]** WHEN the callback completes (success or handled error), THE
  SYSTEM SHALL redirect back to /settings/mail-calendar with a status the page
  can surface, and the new account SHALL appear in the connected-accounts list.

## R3 — Direct IMAP/SMTP connect (reuse-first)

- **R3.1 [DONE]** WHEN a user submits IMAP host/port + SMTP host/port +
  password for provider=smtp_custom, THE SYSTEM SHALL verify IMAP and SMTP for
  real before persisting (route.ts:72-89; imap.ts:111-131).
- **R3.2 [DONE]** THE SYSTEM SHALL encrypt the password with AES-256-GCM
  (encryptSecret) into secretEncrypted and SHALL NOT persist it in plaintext
  (route.ts:91-97).
- **R3.3 [DONE]** THE SYSTEM SHALL store the row with userId = authCtx.userId,
  provider=smtp_custom, status=active, and discovered caldavUrl (route.ts:114-133).
- **R3.4 [DONE]** WHEN a smtp_custom mailbox is created, THE SYSTEM SHALL fire
  email/sync-requested with mailboxId for an immediate first poll (route.ts:141-153).
- **R3.5 [NEW]** WHERE IMAP or SMTP verification fails, THE SYSTEM SHALL return
  the actionable human-readable error (imap.ts:257-273) AND SHALL NOT create a
  row — confirmed end-to-end as an A1 acceptance test (path exists; A1 pins it).

## R4 — De-duplication & idempotency

- **R4.1 [NEW]** WHEN a user links a provider+address that is already an active
  connected_mailboxes row for the same (tenantId, emailAddress), THE SYSTEM
  SHALL treat the link as idempotent: refresh the EmailEngine registration/
  tokens, update displayName/provider if changed, and return the existing row —
  NOT create a duplicate and NOT throw.
- **R4.2 [NEW]** THE SYSTEM SHALL key idempotency on the existing unique
  constraints (mailbox_tenant_email_idx on (tenant_id, email_address),
  outbound.ts:282; ee_account_id UNIQUE, outbound.ts:243) so two concurrent
  links of the same address converge on one row.
- **R4.3 [NEW]** IF a re-link arrives for a mailbox currently in status=error or
  status=disabled, THEN THE SYSTEM SHALL reactivate it (re-register + restore the
  prior status policy) rather than duplicating it.
- **R4.4 [NEW]** WHERE the same email exists under a DIFFERENT provider (e.g. was
  smtp_custom, now OAuth), THE SYSTEM SHALL update the single (tenant,email) row
  to the new provider + credentials in place (still one row).

## R5 — Ownership & tenancy

- **R5.1 [NEW]** THE SYSTEM SHALL persist every linked mailbox as PERSONAL:
  userId = authCtx.userId, shared = false (default, outbound.ts:239) — unless
  explicitly shared via the team-inbox surface (out of A1 scope).
- **R5.2 [NEW]** THE SYSTEM SHALL only ever attribute a linked mailbox to the
  initiating signed-in user — a link request SHALL NOT attach a mailbox to any
  other user or to a bare tenant.
- **R5.3 [DONE]** THE SYSTEM SHALL surface, list, mutate, and delete a mailbox
  only to/for its owner (route.ts:21-32, 249, 312) — A1 keeps this invariant.

## R6 — Appears in unified inbox + starts syncing

- **R6.1 [NEW]** WHEN a mailbox is linked (OAuth or smtp_custom), THE SYSTEM
  SHALL make it readable by getInboxScope for its owner — i.e. a
  connected_mailboxes row exists, so OAuth mail is no longer invisible to the
  per-user inbox (closes the gap at user-scope.ts:107).
- **R6.2 [NEW]** WHEN an OAuth mailbox is linked, THE SYSTEM SHALL trigger an
  initial sync for it (fire the provider oauth-connected / email/sync-requested
  path, sync-functions.ts:798-868) so mail begins flowing without waiting for
  the 15-min cron.
- **R6.3 [DONE]** THE SYSTEM SHALL let the recurring poll cron pick up the new
  active mailbox on its next tick (sync-functions.ts:880-973).
- **R6.4 [NEW]** THE SYSTEM SHALL ensure inbound EmailEngine webhooks for the new
  mailbox resolve to the correct tenant via ee_account_id (emailengine/route.ts:
  55-62) — i.e. the linked row eeAccountId matches the EmailEngine account.

## R7 — Error & edge states

- **R7.1 [NEW]** IF the user denies consent at the provider, THEN THE SYSTEM
  SHALL redirect back to /settings/mail-calendar with a connection-cancelled
  status and SHALL NOT create or mutate any row.
- **R7.2 [NEW]** IF the OAuth token exchange fails (bad code, network, provider
  5xx), THEN THE SYSTEM SHALL surface a recoverable error and leave no
  half-written connected_mailboxes row.
- **R7.3 [NEW]** IF EmailEngine registration fails for an OAuth link, THEN THE
  SYSTEM SHALL NOT silently persist a dead mailbox row — it SHALL report the
  failure (parity with the smtp_custom path which refuses dead rows,
  route.ts:72-89), unlike the legacy console.warn+save-anyway branch at
  route.ts:210-212 which A1 SHALL replace for the OAuth-link entry point.
- **R7.4 [DONE]** IF IMAP authentication fails, THEN THE SYSTEM SHALL return the
  classified message (IMAP login failed..., imap.ts:259-262) and create no row.
- **R7.5 [NEW]** IF the state is missing, expired, replayed, or its bound user no
  longer matches the session, THEN THE SYSTEM SHALL reject the callback (no row,
  no token exchange) and redirect to sign-in/settings with an error.
- **R7.6 [NEW]** WHEN a previously linked OAuth mailbox token is later revoked
  upstream, THE SYSTEM SHALL surface needs_reauth (existing markNeedsReauth/
  isNeedsReauth, sync-functions.ts:172-183, mail-calendar/route.ts:142) and
  offer re-link via the SAME A1 link flow (not signIn).

## R8 — Security (tokens & passwords)

- **R8.1 [NEW]** THE SYSTEM SHALL NEVER log, return to the client, or persist raw
  OAuth access/refresh tokens in connected_mailboxes — OAuth token custody lives
  in EmailEngine (and, where mirrored, the encrypted auth_account columns,
  src/auth.ts:212-225).
- **R8.2 [DONE]** THE SYSTEM SHALL store the smtp_custom password ONLY as the
  AES-256-GCM ciphertext in secretEncrypted (route.ts:91-97), never in
  plaintext, logs, or API responses.
- **R8.3 [NEW]** THE SYSTEM SHALL NOT emit tokens or passwords into Sentry /
  logger breadcrumbs on any error path (R7.*).
- **R8.4 [NEW]** THE SYSTEM SHALL require a valid auth session for every A1
  endpoint (init + callback + POST), returning 401 otherwise (parity with
  route.ts:36-39).

## R9 — G-design gate (UI)

- **R9.1 [NEW / GATE]** THE add-mailbox UI (provider chooser + IMAP/SMTP form +
  link-result states) SHALL pass the F1 12-item G-design checklist
  (_specs/inbox-design-system/design.md section 8): tokens-only color, single
  --gradient-brand CTA, shared Button, type-scale snaps, density, radius family,
  token shadows, AA contrast, dark-mode parity, lucide-only/no-emoji,
  focus+motion, and empty/loading/error state coverage. Result recorded as a
  one-line PASS/FAIL per item in tasks.md.

## Non-goals (tracked elsewhere — do NOT build in A1)

- **THE SYSTEM SHALL NOT** add a from/send-as selector or carry mailbox_id into
  outbound here — [HORS SCOPE -> A2] (inbox-send-as).
- **THE SYSTEM SHALL NOT** build the per-mailbox rail, color, unread chips, or
  per-mailbox signature/display-name/voice — [HORS SCOPE -> A3]
  (inbox-mailbox-rail-identity).
- **THE SYSTEM SHALL NOT** implement per-mailbox sync fan-out, refresh/reauth
  health dashboards, or cross-box thread dedup — [HORS SCOPE -> A4]
  (inbox-multimailbox-sync); A1 only guarantees the new box starts syncing.
- **THE SYSTEM SHALL NOT** change warmup policy, daily limits, or sending infra.
- **THE SYSTEM SHALL NOT** add an LLM surface — G-eval is N/A for A1 (no model
  call, no eval bar; stated explicitly so no reviewer expects one).
