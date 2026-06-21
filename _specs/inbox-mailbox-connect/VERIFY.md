# A1 — inbox-mailbox-connect — Verification (self-verify loop, 2026-06-19)

Branch `feat/inbox-ai-draft` (integration branch: B1 + C1-floor + B2 + A1, all
unmerged + interdependent). Worktree agent-a64e5014ce08a19ab.

## Commits (6 slices)
1. `9f93106` signed single-use OAuth-LINK state helper (`lib/auth/oauth-link-state.ts`) + 7 tests
2. `894b117` idempotent `linkOAuthMailbox` core (`lib/integrations/link-mailbox.ts`) + 8 tests
3. `798705e` provider descriptors + init route (`oauth-link-providers.ts`, `oauth-link/route.ts`) + 3 tests
4. `7d05c9f` OAuth-LINK callback route (`oauth-link/callback/route.ts`)
5. `cdda008` mail-calendar add-mailbox uses the link flow, not signIn (+ ?linked banner)
6. `8fdadf4` idempotent mailbox upsert on re-connect (POST both branches, R4)

## Requirements diff (→ implementation)
| Req | Status | Evidence |
|---|---|---|
| R1.1-R1.5 OAuth-LINK init (attribute to current user, plan-limit, signed state, scopes/offline/consent, NOT signIn) | DONE | `oauth-link/route.ts` |
| R2.1 token exchange server-side | DONE | `exchangeCodeForTokens` (callback) |
| R2.2-R2.3 EE register + upsert connected_mailboxes | DONE | `linkOAuthMailbox` |
| R2.4 verified email from userinfo, not client | DONE | `fetchVerifiedEmail` |
| R2.5 status warming_up on create | DONE | upsert default |
| R2.6 redirect to settings with status | DONE | `?linked=ok/cancelled/error` + banner |
| R3.1-R3.4 smtp_custom connect | DONE (reused) | `mailboxes/route.ts:72-156` |
| R3.5 IMAP/SMTP fail → no row | DONE (reused) | existing verify-before-insert |
| R4.1-R4.4 idempotent one-row upsert | DONE | linkOAuthMailbox + POST onConflictDoUpdate (both branches) |
| R5.1-R5.3 personal ownership | DONE | userId=authUserId, shared=false |
| R6.1 appears in unified inbox | DONE | row exists → getInboxScope reads it |
| R6.2 initial sync fired | DONE | linkOAuthMailbox fires email/sync-requested |
| R6.3-R6.4 cron + webhook resolve | DONE (reused) | unchanged paths |
| R7.1 denied → cancelled, no row | DONE | callback error-param branch |
| R7.2 token-exchange fail → error, no half-row | DONE | callback try/catch |
| R7.3 EE fail → no dead row | DONE | linkOAuthMailbox throws before upsert (tested) |
| R7.4 IMAP auth fail | DONE (reused) | existing |
| R7.5 bad/replayed/cross-user state → reject | DONE | verifyLinkState + nonce cookie + user/tenant binding (tested) |
| R7.6 revoked → needs_reauth re-link | DONE (reused) | existing markNeedsReauth + same link flow |
| R8.1-R8.4 token/password custody, HMAC state, redacted logs, auth-gated | DONE | tokens→EE only, no token in redirect/logs, 401 gates |
| R9 G-design (add-mailbox UI) | PASS | banner: tokens-only, no emoji, dismissible, dark-mode via var(--color-*) |

## Tests
- 18 A1 unit tests green: oauth-link-state 7, link-mailbox 8, oauth-link-providers 3.
- mailbox-route-adjacent tests (mailboxes-delete-api etc.) green — no regression.
- `pnpm tsc` clean after every slice.
- Full suite + `next build` (8GB): see run results below.

## Honest gaps (autonomous-verification ceiling)
- The LIVE OAuth consent round-trip (init → provider consent → callback → token
  exchange → EmailEngine register → row) needs real Google/Outlook client creds
  AND a human consent login — it CANNOT be exercised autonomously. The pure +
  structural layers are unit-tested (state, link core, authorize-URL, fail-closed
  invariant) and the routes compile under `next build`; the live happy-path +
  denied/revoked round-trips need one human-OAuth smoke before merge.
- No G-eval: A1 has no LLM surface (stated in the spec non-goals).
