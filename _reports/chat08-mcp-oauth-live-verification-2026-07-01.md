# CHAT-08 MCP OAuth — live verification (2026-07-01)

PR #598 shipped a full OAuth 2.1 authorization server for CHAT-08's MCP
surface, covered by 49 unit/route tests — all of which mock their
dependencies (DB calls, `getMcpClient`, `consumeAuthorizationCode`, etc.).
Nothing had exercised the flow against a real server + real Postgres.
This pass did that: register → PKCE authorize → consent → decision →
token exchange → MCP `tools/list`/`tools/call` → refresh rotation →
cleanup, driven by a plain-fetch script with manual cookie handling
(`scratchpad/verify-mcp-oauth.mjs`, not committed — throwaway).

Two real bugs were found and fixed (PR #605). Three more things were
found and deliberately **not** touched — flagged below with why.

## Setup

Root `node_modules` (shared across ~8 other active worktrees on this
machine) turned out to be missing Next.js's compiled CLI (`dist/bin`
absent from the installed `next` package — a partial/corrupted install,
not a junction artifact). Did not touch it, since other sessions
junction the same tree. Instead: fresh worktree `leads-wt-mcp-verify`
off `origin/main`, a real (non-junctioned) `pnpm install`, dev server on
port 3411 with `ENABLE_E2E_SEED=1`.

## Bug 1 — destructive tools reachable over MCP (FIXED)

`build-mcp-server.ts` hard-codes `allowDestructive: false` — the
documented guarantee (design.md, the settings page copy) is "no
destructive actions available over MCP." Live `tools/list` returned
`deleteSharedPrompt`, `deleteWorkflow`, `deleteAccountList`,
`deleteSearchMonitor` anyway.

Root cause: `DESTRUCTIVE_TOOLS` (`lib/agents/capability-resolver.ts:56`)
is a hand-maintained `Set<string>` allowlist, not derived from the tool
registry. It had drifted in both directions — 3 entries
(`deleteContact`, `deleteAccount`, `deleteDeal`) reference tool names
that don't exist anywhere in the registry (dead weight, harmless), while
4 real delete-prefixed tools were simply never added.

Fix: added the 4 missing names. Added a **structural regression test**
(`src/__tests__/capability-resolver.test.ts`, new describe block) that
calls the REAL `buildAllChatTools` registry — every other test in that
file uses a synthetic `fakeRegistry()` fixture, which can only ever
contain names someone remembered to list, so it structurally cannot
catch this class of drift. The new test asserts every
`/^(delete|merge)/`-prefixed tool name in the real registry is in
`DESTRUCTIVE_TOOLS`, and separately that none survive
`resolveCapabilities(..., surface: {type: "mcp"})`.

Not fixed / flagged: `removeCompaniesFromAccountList` and 2 existing
`DESTRUCTIVE_TOOLS` entries (`removeMailbox`, `revokeInvite`) break the
delete/merge naming convention — the set's real intent per its own
comment is "gated until CHAT-04's undo system ships," which is broader
than "irreversible data loss." Whether `removeCompaniesFromAccountList`
(reversible — re-add) belongs in that broader gate is a product call,
not something to decide unilaterally mid-verification. Left as-is.

## Bug 2 — mcp_oauth_* tables missing ON DELETE CASCADE (FIXED)

`mcp_oauth_authorization_codes.tenant_id` / `.app_user_id` and
`mcp_oauth_tokens.tenant_id` / `.app_user_id` referenced
`tenants(id)`/`users(id)` with no cascade, unlike this codebase's
established convention for tenant-scoped tables (see e.g.
`db/schema/agent.ts`, `campaign.ts`, all `onDelete: "cascade"`).
Reproduced live: the E2E `test-e2e/cleanup` route (which deletes `users`
then `tenants`) 500'd with an FK violation after registering a client,
completing authorization, and exchanging a token for the seeded tenant.

Fix: migration `0111_mcp_oauth_cascade.sql` drops and re-adds the 6
affected FK constraints with `ON DELETE CASCADE` — constraint names
verified against the actual Postgres-generated names
(`<table>_<column>_fkey`, since migration 0110 used inline `REFERENCES`
without named constraints, not drizzle's naming convention — checked via
`pg_constraint`, not guessed). Applied to both localdev and prod.
`db/schema/mcp-oauth.ts` updated to match so future `drizzle-kit`
diffing doesn't propose reverting it.

## Found, not fixed: `DATABASE_URL` / `DATABASE_URL_LOCALDEV` / `DATABASE_URL_OWNER` confusion — real near-miss

While seeding a test user against what I believed was localdev, my
seed operation actually landed in **production**. `.env.local`'s
`DATABASE_URL` (used by `pnpm dev`, `drizzle.config.ts`, i.e. the
default runtime connection) points to Supabase project
`wdgwytpaxuvgigqgzxrw` — confirmed as prod by finding the live tenant
`fdf9b795-d0e3-4ca8-bb76-b298aa81e3b5` ("Elevay") there, matching every
memory reference to the live tenant. `DATABASE_URL_LOCALDEV` points to a
**completely different** project, `mrxxeuozlzgwsuojebad` — despite the
name suggesting it's the one `pnpm dev` uses. `DATABASE_URL_OWNER` is
the DDL-privileged role on the SAME project as `DATABASE_URL` (prod).

Caught immediately: queried for the seeded test tenant, found it,
called `/api/test-e2e/cleanup`, verified zero residue. No lasting
impact. But this is a live footgun — any future local session (this one
included, in the first attempt) that runs `pnpm dev` off a stock
`.env.local` is developing against production data unless it manually
overrides `DATABASE_URL`. See the new memory
`reference_database-url-prod-vs-localdev-confusion.md`. Not fixed here —
this is a repo-wide `.env.local` convention question (should the default
`DATABASE_URL` point at localdev with prod requiring an explicit
override, inverting the current default?), not something to change
unilaterally mid-PR.

## Found, not touched: migrations 0109/0110 were merged but never applied to prod

While diagnosing the above, checked prod's `__elevay_migrations` table:
applied only through `0108_inbox_followup_nudges.sql`. `0109` (CHAT-08
Part A schema + `agent_traces.surface_type`/`mcp_client`) and `0110`
(the MCP OAuth tables from #598) were both **merged to main but never
deployed to prod's schema**. Concretely this meant, since PR #594
merged: every `recordTrace()` call in production was failing its
`INSERT` (missing columns) and being silently swallowed by the
"observability should never break the app" catch-all — meaning **zero
trace rows were being written**, and the eval-sampling → Inngest
`eval/trace-created` flywheel fan-out (which lives inside the same
try-block, after the failed insert) never ran either. No user-facing
breakage, but the self-improvement loops built earlier this session were
silently starved for the live tenant.

Applied both migrations to prod (idempotent, `IF NOT EXISTS` throughout,
already-merged code) via `DATABASE_URL_OWNER`. Verified: all 5 new
tables/columns present in prod now.

## Found, not touched: 7 other pre-existing migrations still missing from prod

Same audit surfaced 7 more files never applied to prod, unrelated to
CHAT-08:

- `0081_rls_strict_inbox.sql`
- `0100_sequence_autopause.sql`
- `0103_linkedin_account.sql`
- `0104_linkedin_account_multiseat.sql`
- `0105_linkedin_relation.sql`
- `0106_linkedin_inbound_enums.sql`
- `0108_search_monitors.sql`

Not applied. Each needs individual review before touching prod — some
(e.g. an enum `ADD VALUE`) can't run inside a transaction, and I have no
context on why these specific ones were skipped historically (deliberate
hold, forgotten, or blocked on something). Flagging for the founder
rather than guessing.

## Found, not fixed: `agent_traces.tenant_id` also missing ON DELETE CASCADE

Same class of bug as fix #2 above, but on a much older, core table. Hit
it directly: after my fix to the `mcp_oauth_*` cascade, the E2E cleanup
route still 500'd — this time on `agent_traces_tenant_id_tenants_id_fk`,
because every MCP tool call in my test writes a trace row. Confirmed via
`pg_constraint` that `agent_traces` has no cascade on `tenant_id` either.

Not fixed: unlike the MCP OAuth tables (brand new, no data yet, clearly
should cascade), whether trace/audit rows should cascade-delete with a
tenant or be retained/archived is a genuine compliance question — GDPR
erasure typically wants the OPPOSITE of losing an audit trail silently.
Fixing this needs a product decision on trace retention policy, not a
unilateral schema change. Worked around it in my own test script by
manually purging `agent_traces` rows for the test tenant before calling
cleanup — not a product fix, just made my own verification
self-contained.

## Final live verification result

17/17 steps passing on the last run (localdev, after both fixes):
seed → login → register client → PKCE authorize (redirect to consent) →
consent page renders → approve → code issued → token exchange →
`initialize` → `tools/list` (166 tools, none destructive) →
`tools/call listSchema` (real data) → invalid bearer rejected (401) →
refresh rotation (new token issued, old one rejected on reuse) →
rotated token works → unregistered `redirect_uri` rejected without a
redirect (open-redirect check) → cleanup (all test data removed, DB
verified clean).

Not attempted: a literal external client (Claude Desktop, Cursor)
completing this flow through their own UI — that's B.8 in tasks.md,
genuinely can't be automated, not raised with the founder as a next
step.
