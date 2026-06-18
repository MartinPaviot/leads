# INBOX-P05 — Per-user isolation & tenant-scoping audit (close the inbox read-scope gap)
> Theme: T11 · Autonomy rung: passive (enforcement) · Priority: P0
> Pillar: cross (trust) — protects every pillar

## User story
As a customer (and as the founder answering "can another tenant — or another teammate — read my
mail?"), I want the inbox's read scope to be guaranteed by construction, not by a hand-written
`WHERE`, so that no current or future code path can ever surface one tenant's mail to another, or one
user's personal mailbox to a teammate.

## Why (audit anchor)
The 2026-06-14 tenant-isolation audit (`_audit/2026-06-14-tenant-isolation/REPORT.md`) found **no
exploitable cross-tenant read leak today** (§1) but concluded isolation is **"by convention, not by
construction"**: it rests on a hand-written `WHERE tenant_id = ?` on every query; RLS (migration
`0074_rls_enforced.sql`) is installed but runs **fallback-allow**, so it does not backstop a forgotten
filter (§2, §5.1). The audit explicitly notes the inbox is **additionally per-user scoped** (§6,
§"PII inventory") — so the inbox carries *two* invariants (tenant AND user) that today live only in
app code (`lib/inbox/user-scope.ts`: `inboundBelongsToUser` = `metadata.to` ∩ user addresses;
`scopeConversationRows` filters before assembly). One missing predicate in a future inbox PR = silent
leak. This is the trust foundation of the whole AI-native inbox: the GTM moat (P5) means we hold
verbatim correspondence (`activities.rawContent`) + email-derived embeddings + context-graph PII (§6) —
the highest-sensitivity sinks in the product. We must make the inbox read scope structural.

## Requirements (EARS)
- The system SHALL scope every inbox read by BOTH `tenant_id` (the viewer's tenant from the session,
  never from request input) AND the per-user mailbox ownership (the inbox is personal), on every read
  path: list, detail, Outbound tab, "Needs you", search, ask-AI, and the GTM sidebar.
- The system SHALL derive `tenantId` exclusively from the request-bound `AuthContext`
  (`getAuthContext()`), and SHALL NOT read `tenantId`/`userId`/`ownerId`/`mailboxId` from the request
  body, query string, route params, or headers on any authenticated inbox route.
- The system SHALL run inbox read queries inside `withTenantTx` so the database RLS binds
  `app.tenant_id` (`db/rls.ts:44`) — making the database, not just app code, enforce tenant isolation
  on the inbox tables.
- WHEN the strict-RLS rollout reaches the inbox tables, the system SHALL drop the fallback-allow clause
  for those tables so a query that forgets `WHERE tenant_id` returns **zero rows at the database level**
  (audit §5.1, R-08b), keeping `tenant_id IS NULL` for global rows.
- The system SHALL enforce per-user mailbox scope through the single SSOT (`lib/inbox/user-scope.ts`):
  no inbox read path may assemble conversations without passing through `scopeConversationRows` (or its
  successor), and a user with no connected mailbox SHALL see an empty inbox (already the behaviour).
- The system SHALL carry a **tripwire test** that fails the build if an inbox read query filters by an
  id without also AND-ing `tenantId`, or if an inbox route reads tenant/user/mailbox identity from
  request input (audit §5.2).
- The system SHALL carry a **cross-tenant + cross-user e2e**: seed tenant A/user A and tenant B/user B
  (and a teammate A2 in tenant A), authenticate as A, and assert that no inbox surface ever returns B's
  mail, and that A cannot read A2's personal mailbox.
- The system SHALL never expose another user's mailbox addresses, mailbox ids, or message bodies in any
  inbox API response, error message, or AI context.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN tenant B has inbound mail WHEN user A (tenant A) calls every inbox read endpoint (list, detail,
  outbound, up-next, search, ask-AI, context) THEN zero rows of B are ever returned.
- GIVEN a forged `?mailbox=<B's mailbox id>` or a body `{ tenantId: B }` on an inbox route WHEN called
  as A THEN the response is scoped to A (the forged id is ignored / yields nothing), never B's data.
- GIVEN teammate A2's personal mailbox in tenant A WHEN A opens the inbox THEN A sees only A's own
  mailbox conversations; A2's mail is absent (per-user scope, not just per-tenant).
- GIVEN an inbox read runs inside `withTenantTx` and strict RLS is enabled on the inbox tables WHEN a
  test query deliberately omits the app-layer `WHERE tenant_id` THEN it returns zero rows (DB backstop
  proven).
- GIVEN a PR that adds an inbox query filtering by id without `tenantId` WHEN CI runs THEN the tripwire
  test fails with a pointer to the offending line.
- GIVEN the ask-AI / GTM sidebar over the inbox WHEN it assembles context THEN every context query is
  tenant- (and where personal, user-) scoped, and a hallucinated/planted foreign id yields zero rows
  (mirrors the audit's chat-route guarantee, §2).
- GIVEN a user with no connected mailbox WHEN they open the inbox THEN it is empty
  (`mailboxConnected:false`), with no fallback to tenant-wide mail.

## Edge cases & failure handling
- Legacy inbound with `metadata.to` missing (the orphaned-inbound class fixed in PR #260 — codebase
  notes) → such rows must not leak to *every* user as a side effect of a null check; the per-user filter
  must fail closed (a row with no resolvable owner is shown to no one rather than everyone) — verify the
  `inboundBelongsToUser` null-handling.
- Shared/aliased addresses (a user owns several addresses) → `getInboxScope` already lowercases and
  unions a user's addresses; verify aliases resolve to exactly one owner.
- A mailbox reassigned between users → ownership follows `connected_mailboxes.user_id`; verify history
  doesn't leak to the prior owner after reassignment.
- Pooler-poison regression → the SET LOCAL discipline (`db/rls.ts` header; the 2026-06-10 post-mortem)
  must be preserved; never introduce a session-scoped `set_config(..., false)` (the existing
  `rls.test.ts` tripwire must keep passing).
- Strict RLS rollout must be staged (shadow-mode log violations first) to avoid a sign-in-style outage
  (audit §5.1) — enable per-table, inbox tables in their own wave.
- Multi-tenant + multi-user e2e must include a teammate in the *same* tenant to catch per-user (not just
  per-tenant) regressions — the inbox's distinguishing invariant.

## Best-in-class bar
- **Isolation by construction, not convention** — we convert the inbox from "safe because every query
  remembers `WHERE tenant_id`" to "safe because the database rejects unscoped reads" (strict RLS via
  `withTenantTx`), plus tripwires that stop a regression at PR time. Most products (and Superhuman's
  shared-inbox tier) rely on app-layer discipline; we make the DB the backstop on the most sensitive
  table set we own.
- **Two-axis scope, proven** — the inbox is the one surface that is *both* tenant- and user-private; our
  e2e proves a teammate can't read a teammate's mailbox, not merely that tenant A can't read tenant B.
- **Auditable + answerable** — this closes the precise gap the founder-question audit flagged for the
  inbox (§6 "Inbox is additionally per-user scoped"), turning a documented caveat into a tested guarantee.

## Design sketch
- **Data / DB:** inbox tables = `activities` (`email_received`, `rawContent`, `metadata`),
  `outbound_emails`, `inbox_triage`, `connected_mailboxes` (`db/schema/*`). Strict-RLS wave: route their
  reads through `withTenantTx` (`db/rls.ts:44`), then drop the fallback clause from `0074` for these
  tables (audit §5.1) keeping `tenant_id IS NULL` for globals. Email-derived embeddings/context-graph
  (PII copies, §6) must purge on deletion (verified per-tenant — cross-ref INBOX-P03 task 6).
- **API:** harden every inbox read route — `GET /api/inbox/conversations` (+ `/detail`), `/api/inbox`
  (Outbound), `app/api/home/up-next/route.ts`, and the new search/ask-AI/context endpoints
  (INBOX-Q02/G01): derive identity only from `getAuthContext()`; never trust `?mailbox=`/body for
  identity (use it only as a filter AND-ed under the scope); wrap reads in `withTenantTx`. The per-user
  filter stays in the SSOT `lib/inbox/user-scope.ts` (`getInboxScope` → `scopeConversationRows`).
- **UI:** no new surface; this is enforcement behind the existing inbox (`app/(dashboard)/inbox/*`). The
  empty-state "Connect your mailbox" already reflects no-mailbox scope. If anything user-facing: the
  Security / residency panels (INBOX-P04) may state "your mailbox is private to you" — factual, tokens,
  lucide `Lock`/`ShieldCheck`, no emoji, no provider name.
- **AI:** the ask-AI-over-inbox + GTM sidebar MUST inherit the same two-axis scope; build every inbox AI
  `ToolContext`/context query with `ctx.tenantId = authCtx.tenantId` and the user-mailbox filter — no
  inbox AI tool may accept a `tenantId`/`mailboxId` parameter from the model (mirror audit §2).
- **Security/perf:** strict RLS adds negligible latency (a `SET LOCAL` per transaction); stage with
  shadow-mode logging; tripwire + e2e run in CI.

## Tasks (ordered, each with verify + test)
1. Inventory every inbox read path and confirm each derives identity from `getAuthContext()` only and
   AND-s `tenantId` (and the user-mailbox filter). (verify: grep + manual) (test: list the paths in the
   e2e fixture)
2. Add the **tripwire** lint/test: fail on an inbox query filtering by id without `tenantId`, and on any
   inbox route reading tenant/user/mailbox identity from request input (extend the existing
   source-grepping tripwire pattern from `rls.test.ts`). (verify: a planted violation fails the build)
   (test: tripwire self-test)
3. Add the **cross-tenant + cross-user e2e**: seed A/A2/B, auth as A, hit every inbox surface with B's
   and A2's ids → assert 0 foreign rows ever returned. (verify: green; planted leak fails it) (test:
   `inbox-isolation.e2e`)
4. Route inbox reads through `withTenantTx` (bind `app.tenant_id`). (verify: queries run in a tx with the
   bound setting; no session-scoped `set_config`) (test: probe that RLS context is bound on an inbox read)
5. Strict-RLS wave for inbox tables: enable in shadow-mode (log would-block), then drop the fallback
   clause for `activities`/`outbound_emails`/`inbox_triage`/`connected_mailboxes`. (verify: an
   app-layer-unscoped test query returns 0 rows at the DB) (test: DB-level isolation test)
6. Verify `inboundBelongsToUser` null-handling fails closed (orphaned `metadata.to` → shown to no one,
   not everyone). (verify: a null-`to` row is invisible to all users) (test: scope null-case)
7. Confirm inbox AI (ask-AI/sidebar) context queries are two-axis scoped and take no identity param from
   the model. (verify: planted foreign id in AI context yields 0 rows) (test: AI-context scope test)

## Current-state notes (VERIFY before building — code moves)
- Audit `_audit/2026-06-14-tenant-isolation/REPORT.md`: §1 no exploitable read leak today; §2 isolation
  "by convention, not by construction", RLS `0074` is fallback-allow and dormant in normal flow; §5.1
  strict RLS via `withTenantTx` is the biggest lever (R-08b TODO); §5.2 tripwires would have caught the
  real findings; §6 + PII inventory: **the inbox is additionally per-user scoped** and
  `activities.rawContent`/embeddings/context-graph are the highest-sensitivity sinks.
- `lib/inbox/user-scope.ts` is the per-user SSOT: `getInboxScope(tenantId, userId)` reads
  `connected_mailboxes WHERE user_id = authUserId`; `inboundBelongsToUser` = `metadata.to` ∩ user
  addresses; `outboundBelongsToUser` = `mailbox_id ∈ user's`; `scopeConversationRows` filters before
  assembly; no mailbox → empty inbox. (codebase notes §"Read model".)
- `db/rls.ts:44` `withTenantTx` is the ONLY sound way to bind `app.tenant_id` (Supavisor transaction
  pooler; the 2026-06-10 poison post-mortem) — it is used today essentially only in the sign-in path; a
  `rls.test.ts` tripwire forbids session-scoped `set_config(..., false)`. Inbox reads do NOT currently
  run inside `withTenantTx` — they rely on the app-layer `WHERE tenant_id`.
- `0074_rls_enforced.sql` (`app/apps/web/drizzle/0074_rls_enforced.sql`): RLS ENABLED on every
  `tenant_id` table, policy `USING (current_setting('app.tenant_id') IS NULL OR tenant_id IS NULL OR
  tenant_id = current_setting('app.tenant_id'))` — fallback-allow. Strict mode = drop the first clause
  once reads run under `withTenantTx`.
- Inbox read routes today: `GET /api/inbox/conversations` (+`/detail`), `/api/inbox` (Outbound),
  `app/api/home/up-next/route.ts` (codebase notes §API) — all use `getInboxScope`/`scopeConversationRows`
  but not `withTenantTx`. New search/ask-AI/context endpoints (INBOX-Q02/G01) must inherit both axes.
- This is staged work (shadow-mode first) to avoid a sign-in-style outage (audit §5.1); inbox tables get
  their own wave. Coordinate with the org-wide R-08b rollout rather than flipping RLS globally here.
