# INBOX-C06 — Snippets / templates with variables + CC/BCC + attachments
> Theme: T4 · Autonomy rung: helper · Priority: P1
> Pillar: P3 writing

## User story
As a user who sends the same kinds of replies repeatedly, I want reusable snippets that expand
with variables, set CC/BCC and attach files in one keystroke, so I stop retyping and re-attaching.

## Why (audit anchor)
Superhuman's **Snippets** are a headline feature: insert canned text, **auto-fill recipients,
CC/BCC, attachments and variables** with a keystroke (`audit.md` §3 "Snippets"; Settings →
Writing/Signatures, `feature-inventory.md`). Missive adds **semantic search over canned responses**
(`audit.md` §3). OUR edge: snippet variables can pull **cited CRM fields** (contact first name,
company, deal stage) so a snippet personalizes correctly from our graph, and snippets are
searchable by meaning, not just title.

## Requirements (EARS)
- The system SHALL let a user create, edit and delete personal snippets (title, body, optional
  CC/BCC, optional default attachments).
- A snippet body SHALL support variables: free variables (`{{firstName}}`) prompted on insert, and
  CRM-bound variables resolved from the open thread's contact/company/deal (cited).
- WHEN a snippet is inserted, the system SHALL expand variables, set CC/BCC and stage the attachments
  into the composer, leaving everything editable before send.
- CRM-bound variables SHALL resolve only from real, cited data; an unresolved variable SHALL render a
  visible `{{firstName}}` placeholder, never a guessed value.
- The system SHALL offer fast insertion: a trigger (e.g. `;` or a palette) with type-ahead by title
  AND by meaning (semantic search over the user's snippets).
- Snippets SHALL be tenant-scoped; personal by default with an optional shared-team library (INBOX-X05).
- The system SHALL respect attachment limits/policy (size, type) and never attach another tenant's file.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a snippet "Send pricing" with CC=finance@ and an attached PDF WHEN inserted THEN the composer
  body fills, CC is set, and the PDF is staged — all editable.
- GIVEN a snippet body with `{{firstName}}` on a known contact WHEN inserted THEN it expands to the
  contact's first name (cited "via Elevay"); on an unknown contact it stays `{{firstName}}`.
- GIVEN the user types `;pri` WHEN the snippet picker is open THEN "Send pricing" matches by title;
  typing "cost sheet" matches it by meaning (semantic).
- GIVEN an attachment exceeding the size limit WHEN inserting THEN the user is warned and the snippet
  inserts without it (or blocks per policy), never silently truncating.
- GIVEN a shared-team snippet WHEN a teammate inserts it THEN it works identically and is attributed to
  the library, never to a vendor.
- GIVEN insertion on a thread with multiple recipients WHEN CC is set by the snippet THEN existing
  recipients are preserved and de-duplicated.

## Edge cases & failure handling
- Variable with no source and no prompt → leave the literal placeholder, flag it before send.
- Conflicting CC/BCC (snippet vs thread) → merge + de-dupe; never drop the user's existing recipients.
- Missing attachment (deleted asset) → warn, insert without it, don't break the composer.
- Semantic search index unavailable → fall back to title substring match (never error).
- Non-English snippet → inserted verbatim; variable values localized where applicable.
- Multi-tenant: snippets, shared library and attachments strictly scoped to the viewer's tenant.

## Best-in-class bar
- CRM-bound variables resolve from our **own cited graph** (contact/company/deal), so personalization
  is correct without an external mail-merge — and unresolved variables fail visibly, never with a wrong name.
- Snippets are **semantically searchable** (Missive-style) over the user's own library, so they're
  findable by intent ("the discovery follow-up") not just exact title.

## Design sketch
- **Data:** a new `snippets` table (`id, tenant_id, user_id, title, body, cc[], bcc[], attachment_refs[],
  shared(bool), embedding?`) — VERIFY no snippet table exists today before creating. Attachments
  reference existing stored assets, never raw blobs in the row. Embedding column enables semantic search.
- **API:** `GET/POST/PATCH/DELETE /api/inbox/snippets`; `GET /api/inbox/snippets/search?q=` (title +
  semantic). Variable resolution reuses INBOX-C01 `draft-context` for CRM-bound vars (cited).
- **UI:** a snippet picker popover (trigger `;` in the composer or palette in INBOX-K01) in
  `_conversation-pane.tsx`; card `--color-bg-card`, `--shadow-floating`, rows with title + preview;
  `FileText`/`ClipboardList` lucide icon. Variable-prompt mini-form for free vars. Manage snippets in a
  settings panel. Light+dark via tokens, no emoji, no provider name; CRM-derived variable values cited.
- **AI:** embeddings for semantic search (reuse the project's embedding pipeline); no generation needed
  for plain snippets (generation lives in C01/C07).
- **Security/perf:** attachment size/type policy; tenant scope on snippets + assets; CC/BCC de-dupe;
  index fallback to substring.

## Tasks (ordered, each with verify + test)
1. `snippets` schema + CRUD API (tenant/user scoped, shared flag). (verify: create/read/update/delete
   round-trip; scope enforced) (test: `snippets-api.test.ts` incl. cross-tenant deny).
2. Insertion engine: expand vars (free + CRM-bound cited), set CC/BCC (merge/de-dupe), stage attachments.
   (verify: composer fills correctly; unresolved var stays literal) (test: expansion unit incl. unknown-contact).
3. Picker UI with title + semantic search; variable-prompt form. (verify: browser — `;` trigger,
   title + meaning match, insert) (test: picker interaction test).
4. Attachment policy + missing-asset handling. (verify: oversize warned, missing asset skipped) (test: attachment-policy unit).
5. Shared-team library wiring (INBOX-X05) + scope. (verify: shared snippet usable by teammate, scoped)
   (test: shared-scope test).

## Current-state notes (VERIFY before building — code moves)
- VERIFY whether any snippet/template table or signature store already exists (search `db/schema/`)
  before creating `snippets`; reuse if present.
- Composer recipients/attachments are handled in `_conversation-pane.tsx`'s composer state — extend it
  for CC/BCC + staged attachments (today the composer fills `to/subject/body` only, e.g. `setComposer` `:137`).
- CRM-bound variable resolution reuses INBOX-C01 `draft-context` (to build). Embedding pipeline — VERIFY
  the existing embedding helper before wiring semantic snippet search.
