# INBOX-Q04 — Search operators + saved searches
> Theme: T5 · Autonomy rung: helper · Priority: P1
> Pillar: P4 triage / P2 reading

## User story
As a power user, I want precise operators (`from:`, `to:`, `subject:`, `has:attachment`,
`before:`/`after:`, `is:unread`) that I can combine with AND/OR, and I want to save a search I run
often so it becomes a one-click lane — so I can pin "from a prospect, last 7 days, awaiting my
reply" and return to it instantly.

## Why (audit anchor)
Superhuman's `/` search is operator-driven, and a **Split Inbox is literally a saved search**:
its "Definition = search criteria (`From:`,`To:`,`Subject:`,`Cc:`,`Bcc:` with AND/OR) + optional
Auto Labels", created from any email via Cmd+K (teardown §B, feature-inventory "Split Inbox
Library"). So operators + saved searches are the substrate beneath smart lanes (INBOX-T01). We have
**no operator grammar and no saved-search storage today** — structured filtering exists only inside
chat tools (`searchEmailsByMetadata` takes `fromEmail`/`toEmail`/`subjectContains`/date,
`lib/chat/tools/query.ts:388`). This spec exposes that power in the inbox UI and makes it persistent.

## Requirements (EARS)
- The system SHALL parse a documented operator grammar in the inbox search field:
  `from:`, `to:`, `cc:`, `subject:`, `has:attachment`, `before:<date>`, `after:<date>`,
  `is:unread|read|replied|snoozed|done`, `in:<lane>`, free text — combinable with implicit AND and
  explicit `OR`, with quoted phrases.
- WHEN the query mixes operators and free text, the system SHALL apply operators as structured
  filters and rank the remaining free text semantically (compose with INBOX-Q01's hybrid search).
- WHEN an operator value is malformed (e.g. `before:notadate`), the system SHALL show an inline,
  non-blocking hint and treat the fragment as free text rather than erroring.
- The system SHALL let the user **save** the current query as a named saved search, scoped to that
  user (default) or shared to the workspace (admin), persisted across sessions.
- The system SHALL list saved searches as one-click entries (a lane/chip rail) that re-run the
  query, and SHALL allow rename/delete with the same per-scope permission rules as shared prompts
  (`lib/chat/tools/query.ts:1179` deleteSharedPrompt pattern).
- WHEN a saved search is opened, the system SHALL show its live result count and refresh on open.
- The system SHALL surface an operator cheatsheet (discoverable affordance, e.g. a `?` in the field
  or in the command palette) and SHALL keep all operators tenant- + mailbox-scoped.
- The system SHALL NOT show provider names; saved-search results read "via Elevay".

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN `from:acme.com has:attachment after:2026-06-01` WHEN submitted THEN only mail from acme.com
  with an attachment dated on/after that date is returned (structured filters applied).
- GIVEN `subject:"renewal" OR subject:"contract"` WHEN submitted THEN threads matching either
  subject phrase appear.
- GIVEN `from:infomaniak pricing` WHEN submitted THEN the `from:` filter narrows and "pricing"
  ranks the rest semantically (compose with Q01).
- GIVEN `before:notadate` WHEN typed THEN an inline hint shows and the fragment is treated as text;
  no 500.
- GIVEN a query I run often WHEN I click "Save search" and name it THEN it appears in my saved-search
  rail and survives a reload.
- GIVEN a workspace-shared saved search WHEN a non-admin tries to delete it THEN it is refused
  (admin-only), matching the shared-prompt rule.
- GIVEN two users WHEN user A saves a user-scoped search THEN user B does not see it.

## Edge cases & failure handling
- Conflicting operators (`is:read is:unread`) → last-wins or empty with a hint; never crash.
- `has:attachment` before INBOX-R04 lands → operator parses but matches nothing + a note that
  attachment indexing is pending (don't pretend zero = none).
- Timezone in `before:`/`after:` → interpret in the user's tz; document the boundary semantics.
- Saved search whose underlying filter references a deleted lane/label → mark stale, offer edit.
- Very large saved-search result → paginate; count is a real SQL `COUNT`, never a fetch-cap artifact.
- Operator injection / SQL safety → operators map to parameterized Drizzle predicates only
  (reuse the `searchEmailsByMetadata` parameterized `metadata->>'from' ILIKE` pattern,
  `query.ts:420`), never string-concatenated SQL.
- Multi-tenant + mailbox: every saved search re-applies `getInboxScope` at run time, not at save time.

## Best-in-class bar
- Operators **compose with semantic ranking** (structured filter + meaning rank in one query) —
  Superhuman's operators are keyword-only; ours fall through to hybrid search for the free-text part.
- A saved search is the **same object a smart lane (INBOX-T01) is built on** (Superhuman's "Split =
  saved search"), so the user builds a lane once and it works as both a quick filter and a pinned
  inbox view — and shared saved searches give teams a common, governed vocabulary.

## Design sketch
- **Data:** new `saved_searches(id, tenant_id, user_id, scope user|workspace, name, query_text,
  parsed_filters jsonb, created_at, updated_at)` (mirror `connected_mailboxes` tenant/user +
  `sharedPrompts` scope semantics, `db/schema/outbound.ts`). No change to `embeddings`.
- **API:** a pure `lib/inbox/search-query.ts` parser (query string → `{ filters, freeText }`),
  unit-tested in isolation; `GET /api/inbox/search` (Q01) consumes `filters` + `freeText`; CRUD
  `GET/POST/DELETE /api/inbox/saved-searches` with `getInboxScope` + scope-permission checks.
- **UI:** the inbox search field (Q01) gains operator parsing + an inline cheatsheet (`lucide-react`
  `SlidersHorizontal`/`HelpCircle`); a "Save search" affordance (`Bookmark`); saved searches render
  as a chip rail above the list (reuse the per-mailbox rail pattern, `mailbox-attribution.ts`),
  each with a live count. Shortcut: `/` focuses search, operators autocomplete; light+dark via
  tokens, no emoji, no provider name, cited.
- **AI:** none for parsing/saving; free-text portion rides INBOX-Q01's retrieval. (An optional
  "natural language → operators" assist can reuse the LLM later — flag as a small follow-up.)
- **Security/perf:** parameterized predicates only; tenant + mailbox scope at run time; real
  `COUNT` for badges; index `saved_searches(tenant_id, user_id)`.

## Tasks (ordered, each with a verify step + test to write)
1. Pure parser `lib/inbox/search-query.ts` (operators + AND/OR + quotes + malformed→text). (verify:
   unit) (test: `search-query.test.ts` — every operator, conflicts, malformed dates, OR groups)
2. Wire parsed `filters`+`freeText` into `GET /api/inbox/search`. (verify: `from:` narrows, free
   text ranks) (test: `inbox-search-operators.test.ts`)
3. `saved_searches` table + CRUD API with scope-permission rules. (verify: save/list/delete scoped)
   (test: `saved-searches-api.test.ts` incl. non-admin-can't-delete-workspace, cross-user isolation)
4. Saved-search chip rail + live counts + "Save search" affordance + cheatsheet. (verify: save a
   query, reload, click it in the live app) (test: rail + count component test)
5. Stale/empty handling (deleted lane reference, `has:attachment` pre-R04). (verify: stale search
   offers edit; pending-attachment note shows)

## Current-state notes (VERIFY before building)
- No operator grammar and no saved-search storage exist in the app. Structured email filtering lives
  only in chat tools: `searchEmailsByMetadata` (`query.ts:388`) parameterizes `from`/`to`/subject/
  date — reuse its predicate style for safety.
- `sharedPrompts` (scope user|workspace, admin-gated delete; `query.ts:1128,1179`) is the template
  for saved-search scope + permissions — copy that model, don't invent a new one.
- Per-mailbox rail UI exists (`mailbox-attribution.ts`, referenced in codebase notes) — reuse for the
  saved-search chip rail layout.
- This is the substrate INBOX-T01 (smart lanes / Split Inbox) builds on — keep `parsed_filters`
  shape compatible with a future lane definition. VERIFY T01's spec for the shared shape.
