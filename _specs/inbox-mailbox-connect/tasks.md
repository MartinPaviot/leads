# A1 — inbox-mailbox-connect · Tasks

**Total estimate: ~6.0 dev-days (12 half-days).** 11 tasks.
Branch: feat/inbox-mailbox-connect. Per task: code -> test -> verify -> commit.
Tags: [NEW] real code · [DONE] already shipped (pin with a test, do not rebuild)
· [GATE] cross-cutting acceptance.

Reuse map (do NOT rebuild): connected_mailboxes schema, smtp_custom connect,
EmailEngine OAuth registration, encryptSecret, getInboxScope, the sync cron, the
EmailEngine webhook, checkPlanLimit. A1 only adds the OAuth-LINK flow + an
idempotent upsert + a UI swap.

---

## B1 [NEW] — Signed single-use link-state helper · 0.5d

Action: add src/lib/auth/oauth-link-state.ts with signLinkState(payload) and
verifyLinkState(token) — HMAC-SHA256 over ELEVAY_APP_SECRET, payload
{authUserId, tenantId, provider, nonce, exp}, short TTL, single-use nonce.
Verify: a tampered, expired, or wrong-secret token fails verification; a fresh
one round-trips.
Test: src/lib/auth/__tests__/oauth-link-state.test.ts — sign/verify happy path;
reject tampered payload; reject expired exp; reject wrong secret.
Refs: R1.2, R7.5, R8.3.

## B2 [NEW] — OAuth-LINK init route · 1.0d

Action: add src/app/api/settings/mailboxes/oauth-link/route.ts GET. Require
getAuthContext (401 else). Run checkPlanLimit(tenantId, "mailboxes"); on deny
return the existing PLAN_LIMIT_EXCEEDED contract (route.ts:42-54). Mint + set
the signed state (B1), then 302 to the provider authorize URL (google or
microsoft-entra-id) with link scopes, access_type=offline, prompt=consent, and
redirect_uri pointing at the callback. MUST NOT call next-auth signIn.
Verify: hitting the route while signed in returns a 302 to accounts.google.com /
login.microsoftonline.com with state + the fixed redirect_uri; the next-auth
session cookie is unchanged before/after.
Test: src/app/api/settings/mailboxes/oauth-link/__tests__/init.test.ts —
401 unauthenticated; 403 over plan limit; 302 with state + correct scopes +
provider; asserts signIn is never invoked.
Refs: R1.1, R1.2, R1.3, R1.4, R1.5, R8.4.

## B3 [NEW] — Idempotent link-mailbox core · 1.0d

Action: add src/lib/integrations/link-mailbox.ts linkOAuthMailbox(...). Register
with EmailEngine using the existing OAuth body shape (route.ts:163-198) and the
existing eeAccountId rule (route.ts:64); on hard EE failure THROW (no row, R7.3).
Upsert connected_mailboxes ON CONFLICT (tenant_id, email_address): set provider,
ee_account_id, display_name, status (warming_up on create; reactivate on
error/disabled), userId=authUserId, shared=false. Fire email/sync-requested.
Return the mailbox + created flag; never return tokens.
Verify: calling twice with the same (tenant,email) yields ONE row (created=true
then false); a different provider for the same email updates in place; an EE
failure leaves zero rows.
Test: src/lib/integrations/__tests__/link-mailbox.test.ts — create; idempotent
re-link (no duplicate); provider switch in place; reactivate from error;
EE-failure throws + writes nothing; fires email/sync-requested once on success.
Refs: R2.2, R2.3, R2.5, R4.1, R4.2, R4.3, R4.4, R5.1, R6.1, R6.2, R7.3, R8.1.

## B4 [NEW] — OAuth-LINK callback route · 1.0d

Action: add src/app/api/settings/mailboxes/oauth-link/callback/route.ts GET.
Require session. Verify state (B1); on mismatch/expiry/replay reject with no
token exchange and redirect to settings with linked=error (R7.5). If the
provider returned error=access_denied, redirect linked=cancelled with no row
(R7.1). Else exchange code for tokens server-side (R2.1); fetch the verified
email from userinfo (R2.4); call linkOAuthMailbox (B3). On token-exchange or
EE failure redirect linked=error, leaving no half-row (R7.2). On success
redirect /settings/mail-calendar?linked=ok.
Verify: a simulated provider callback with a valid code creates exactly one
connected_mailboxes row for authCtx.userId and 302s to linked=ok; denied -> no
row, linked=cancelled; bad state -> no row, linked=error; the session identity
is unchanged throughout.
Test: callback.test.ts — valid code path (one row, userId=current, redirect ok);
access_denied (no row, cancelled); bad/replayed state (no row, error); token
exchange 5xx (no row, error); asserts no token/password appears in the redirect
URL or logs.
Refs: R2.1, R2.4, R2.6, R3.5-parity, R7.1, R7.2, R7.5, R8.1, R8.3, R8.4.

## B5 [NEW] — Wire OAuth POST branch to the idempotent core · 0.5d

Action: in src/app/api/settings/mailboxes/route.ts replace the OAuth branch
bare insert (lines 158-230) with a call to linkOAuthMailbox (B3), removing the
console.warn+save-anyway dead-row path (lines 210-212). Keep the smtp_custom
branch (72-156) but route its create through the same idempotent upsert (B6) so
re-connect is also no-duplicate.
Verify: POST with accessToken/refreshToken for an already-linked address returns
the existing row (no 500, no duplicate); POST for a new address creates one row.
Test: src/__tests__/mailboxes-oauth-post.test.ts — new OAuth create; idempotent
re-POST (no duplicate, no throw); EE failure -> error, no dead row.
Refs: R2.3, R4.1, R4.2, R7.3.

## B6 [NEW] — smtp_custom idempotent re-connect parity · 0.5d

Action: change the smtp_custom insert (route.ts:114-133) to the same
ON CONFLICT (tenant_id, email_address) upsert so re-entering IMAP/SMTP details
for an existing address updates the row (host/port/secretEncrypted/caldavUrl)
instead of throwing on the unique index. Keep verify-before-write (R3.1) and
encryption (R3.2) unchanged.
Verify: connecting the same smtp_custom address twice yields ONE row with the
latest credentials; a wrong password still returns the classified IMAP error and
writes nothing.
Test: extend src/__tests__/imap-smtp-mailbox.test.ts — re-connect updates in
place (no duplicate); verify-fail writes nothing (R3.5/R7.4 pin).
Refs: R3.1, R3.2, R3.3, R3.5, R4.1, R4.4, R7.4.

## B7 [DONE] — Pin: smtp_custom connect + first sync (regression only) · 0.5d

Action: do NOT rebuild. Add/confirm tests pinning the shipped behaviour:
verifyImap/verifySmtp run before persist (route.ts:72-89), password stored only
as ciphertext (route.ts:91-97), row carries userId=authCtx.userId +
status=active (route.ts:114-133), email/sync-requested fired with mailboxId
(route.ts:141-153).
Verify: tests pass on main and on the branch (no behaviour change).
Test: extend src/__tests__/imap-smtp-mailbox.test.ts — assert encryptSecret
output is not the plaintext; assert the sync event payload includes mailboxId.
Refs: R3.1, R3.2, R3.3, R3.4, R8.2.

## B8 [NEW] — UI swap: link flow + result banners + G-design · 1.0d

Action: in src/app/(dashboard)/settings/mail-calendar/page.tsx replace
connectGoogle/connectMicrosoft (lines 133-139) and the Reconnect handlers
(437-445) to navigate to /api/settings/mailboxes/oauth-link?provider=... instead
of signIn. On return, read the linked query param and render a success / cancel /
error banner using the shared Button/Badge + var(--color-*) tokens (no raw hex),
completing state coverage. Convert the hand-styled provider buttons
(540-561) to the shared Button per G-design item 3 where feasible without losing
the brand SVGs.
Verify (you run it): load /settings/mail-calendar, click Continue with Google,
confirm the browser navigates to the OAuth consent (not a signIn page) and that
on return the linked banner shows; screenshot before/after. Confirm dark-mode
parity by toggling .dark.
Test: src/app/(dashboard)/settings/__tests__/mail-calendar-link.test.tsx —
clicking the provider CTA navigates to the oauth-link URL (not signIn);
linked=ok/cancelled/error each render the right banner.
Refs: R1.1, R2.6, R7.1, R7.6, R9.1.

## B9 [GATE] — G-design 12/12 record · 0.5d

Action: run the F1 G-design checklist (design.md section 8) against the
add-mailbox surface; record a one-line PASS/FAIL per item, citing the failing
token on any miss; fix misses (most likely item 3 — provider buttons — and
item 9 dark-mode on new banners).
Verify: 12/12 PASS recorded here; the F1 tokens.contract.test.ts (machine half)
passes for any inbox .tsx touched.
Test: ensure no raw color literal lands in the changed page sections (contract
test / grep gate).
Refs: R9.1.

## B10 [NEW] — Inbox-visibility + webhook integration check · 0.5d

Action: confirm a freshly linked OAuth mailbox is readable by getInboxScope for
its owner (a real connected_mailboxes row now exists) and that an inbound
EmailEngine webhook for its eeAccountId resolves to the right tenant
(emailengine/route.ts:55-62).
Verify: after a simulated link, getInboxScope(tenantId, authUserId) includes the
new address; a synthetic messageNew webhook with the new account captures inbound
for the correct tenant.
Test: src/lib/inbox/__tests__/link-visibility.test.ts — getInboxScope returns
the linked mailbox; webhook account -> tenant resolution hits the new row.
Refs: R6.1, R6.4.

## B11 [NEW] — Security + identity-immutability E2E · 0.5d

Action: end-to-end assert the link round-trip never mutates the auth session and
never leaks secrets. Snapshot the session/JWT before init and after callback;
grep the redirect URLs + captured logs for token/code/password substrings.
Verify (you run it): drive init -> consent (mock) -> callback; session.user.id
and tenantId identical before/after; zero token/password in any redirect or log.
Test: src/__tests__/oauth-link-security.test.ts — identity unchanged across the
flow; no secret in redirect/logs; 401 on every endpoint without a session.
Refs: R1.3, R8.1, R8.3, R8.4.

---

## Sequencing
B1 -> B2 -> B3 -> B4 (core flow) · B5/B6/B7 (POST + smtp_custom parity, parallel
after B3) · B8 -> B9 (UI + gate) · B10, B11 (integration + security) last.

## Definition of Done (DoD logiciel — separate from any OKR)
- New address links via OAuth without a signIn; one connected_mailboxes row with
  userId=authCtx.userId, shared=false, correct provider + eeAccountId.
- Re-linking any address is idempotent (no duplicate, no 500) across OAuth and
  smtp_custom.
- Linked mailbox appears in getInboxScope and starts syncing (event fired +
  cron picks it up).
- Denied/expired-state/token-failure/EE-failure paths leave no row and surface a
  recoverable status.
- No token/password in logs, responses, or redirect URLs; smtp_custom password
  only as ciphertext.
- Session identity is byte-identical before/after a link.
- G-design 12/12 recorded; all listed tests green on the branch; regression
  green on main.
