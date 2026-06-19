# INBOX-X04 — Shared labels / AI-searchable archive
> Theme: T8 · Autonomy rung: helper · Priority: P2
> Pillar: cross (P4 triage + P5 GTM moat)

## User story
As a team triaging a shared inbox, I want labels we define once and apply across the
team's conversations — and I want our archived/handled mail to stay answerable by AI
with citations — so the team has a shared, searchable memory of what's been handled and why.

## Why (audit anchor)
Superhuman ships **Auto Labels** + an **Auto Label Library** (`feature-inventory.md:13`),
shared across the team tier, plus **Auto Archive** to a forward-only archive
(`ai-feature-deep-dive.md:33`). Shortwave frames shared labels as an **AI-searchable
archive** ("ask-AI over all team mail", `audit:70`). Today our only "label" is the
per-conversation `reason` badge — a **sales-reply taxonomy** misapplied to all mail
(`conversations.ts:116` `REASON_BY_LABEL`; INBOX-T08 fixes its honesty for a single user).
There is no shared, team-defined label set and no archive that AI can answer over. We beat
them because our archive is the **CRM graph** — "show every handled thread about pricing for
ACME" answers from real deal/contact context **with citations** (Lightfield's recall bar),
not a keyword match over a label.

## Requirements (EARS)
- The system SHALL let a member create a **tenant-shared label** (name + token color) that is
  visible and applicable by every member/admin in the tenant.
- The system SHALL let a member apply/remove one or more shared labels on any conversation in a
  shared mailbox; labels SHALL persist keyed on `conversation_key` and render on the row + pane.
- The system SHALL keep shared labels **distinct from** the AI `reason` one-liner (INBOX-T08) and
  from the sales-reply taxonomy — labels are explicit team metadata, not a guessed badge.
- WHEN a member archives/marks a shared conversation done, the system SHALL retain it (and its
  labels + comments) in a team-visible archive, queryable later (not deleted, not hidden from teammates).
- The system SHALL make the shared archive **AI-searchable**: Ask-AI over the inbox (INBOX-Q02)
  SHALL be able to answer questions scoped by shared label and return cited source conversations.
- The system SHALL let a member filter the inbox by a shared label (a label lane), across all
  shared mailboxes they can see.
- A **viewer** SHALL be able to READ shared labels and the archive (and ask AI over it) but SHALL
  NOT create, apply, or remove labels (write-gated centrally).
- The system SHALL scope all labels + archive reads to `authCtx.tenantId`; a label or archived
  conversation SHALL never resolve cross-tenant.
- WHEN a shared label is renamed or deleted by an admin, the system SHALL update/clear it everywhere
  it is applied without orphaning conversation rows.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a tenant with no shared labels WHEN a member creates "Needs founder reply" THEN every other
  member can see and apply it.
- GIVEN a shared conversation WHEN a member applies two labels THEN both render as token-colored chips
  on the row and pane, persisted across reloads, for all members.
- GIVEN a labeled, handled conversation WHEN another member opens the archive/label lane THEN it appears
  with its labels and comments intact (team-visible, not personal).
- GIVEN a labeled archive WHEN a member asks AI "what pricing objections did we handle this month?"
  THEN the answer cites specific archived conversations (INBOX-Q02 grounding), not a bare label list.
- GIVEN a viewer WHEN they open the label manager THEN create/apply controls are absent and a POST is
  rejected (403), but they can still filter by and ask AI over labels.
- GIVEN an admin renames a label WHEN any member reloads THEN the new name shows everywhere it is applied,
  with no broken/empty chips.
- GIVEN two tenants WHEN tenant A queries labels THEN tenant B's labels and archived conversations never
  appear.

## Edge cases & failure handling
- Label name collision (two members create "Urgent") → de-duplicate by normalized name within the tenant;
  the second create returns the existing label rather than a duplicate.
- Label applied to a personal-mailbox conversation → allowed but visible only to the owner (that
  conversation isn't shared); it does not leak the conversation to teammates via the label lane.
- Deleting a label that is applied widely → soft-delete the label, sweep its applications; archived
  conversations keep their text + comments, just lose that chip.
- Archive grows large → label lanes + Ask-AI scope use the existing read-model caps + pagination
  (`loadConversationRows` 500-cap, `load.ts`) and semantic retrieval, not a full scan.
- AI answer with no qualifying archived conversation → "no handled conversations match" (honest empty),
  never a fabricated citation.
- Multi-tenant: labels, applications, and archive reads all carry the tenant clause; `conversation_key`
  alone is never trusted.

## Best-in-class bar
- The archive is **answerable with citations** because it's the CRM graph, not a keyword index — "every
  handled thread about pricing for ACME" returns cited conversations tied to the real deal/contact, which
  Superhuman/Shortwave (no CRM graph) cannot do.
- Shared labels are **explicit team metadata kept separate from the AI `reason` one-liner**, so we never
  repeat today's mistake of one guessed badge standing in for human-curated classification — humans label,
  AI summarizes, and the two never collide (the INBOX-T08 discipline, extended to teams).
- Sovereignty: the shared archive lives in our own store (tenant-scoped, EU/CH-residency-capable,
  zero-retention AI option), not a vendor's searchable cloud — a team memory you actually own.

## Design sketch
- **Data:** `inbox_label(id, tenant_id, name, normalized_name, color_token, created_by, deleted_at)`
  with `unique(tenant_id, normalized_name)`; `inbox_label_application(tenant_id, conversation_key,
  label_id, applied_by, applied_at)` with `unique(tenant_id, conversation_key, label_id)`. `color_token`
  is one of the 10 `--color-badge-0..9` hues (UI DNA) — never a raw hex. The "archive" is not a new table:
  it is `inbox_triage.status = 'done'` (`outbound.ts:370`) made **team-visible** for shared mailboxes
  (the INBOX-X01 scope widening), plus labels + comments.
- **API:** `GET/POST /api/inbox/labels` (list/create; create is member+, viewer-blocked),
  `PATCH/DELETE /api/inbox/labels/[id]` (rename/soft-delete; admin via `requireAdmin`),
  `POST /api/inbox/labels/apply { conversationKey, labelId, on }` (member+, tenant-scoped upsert/delete).
  The conversations route (`api/inbox/conversations/route.ts`) joins applications and accepts
  `?label=<id>` (label lane). Ask-AI (INBOX-Q02) gains a `label` scope filter; answers cite source
  conversations via the existing citation mechanism.
- **UI:** label chips on `_conversation-list.tsx` rows + `_conversation-pane.tsx` header (alongside the
  INBOX-T08 one-liner and the INBOX-X01 assignee chip); a compact label manager (create/rename/recolor)
  in the inbox filter bar; a label filter in `FilterBar` (`inbox/page.tsx:238`). Reuse the existing
  `Badge` primitive with `--color-badge-*` tokens (NOT a hashed PropertyBadge). Surface = chips + filter
  bar + small manager popover; tokens = the 10 badge hues + `--color-border-default`; lucide `Tag`
  (label) / `TagsIcon` (manage); shortcut `l` = open the label picker on the selected conversation
  (keyboard handler `inbox/page.tsx:182`, ignored while typing). Light + dark via tokens, no emoji, no
  provider name, cited (AI answers over the archive carry source citations).
- **AI:** the archive query path is INBOX-Q02's grounded Ask-AI, scoped by label; no new model — reuse the
  cited-answer pipeline.
- **Security/perf:** tenant clause on every label/application/archive read; indexed joins; label deletes
  are soft + swept; AI answers fail-closed to "no match" rather than fabricating a citation.

## Tasks (ordered)
1. Migration: `inbox_label` + `inbox_label_application` (+ unique indexes). (verify: drizzle apply clean)
   (test: schema-shape + the normalized-name unique constraint)
2. Labels CRUD + apply/remove routes — member+ create/apply, admin rename/delete, tenant-scoped, viewer-
   blocked. (verify: create/apply round-trip; viewer POST → 403; cross-tenant rejected) (test: route test)
3. Join applications in the conversations route + `?label=` lane; team-visible done archive via the
   INBOX-X01 scope. (verify: a labeled handled thread shows for a teammate in the label lane) (test:
   load-shape + scope test)
4. Wire the shared-label scope into Ask-AI (INBOX-Q02) with cited results. (verify: "pricing objections
   this month" cites archived threads) (test: the answer includes ≥1 citation and "no match" when empty)
5. Label chips + manager + filter UI; `l` shortcut; reuse `Badge` + `--color-badge-*`. (verify: browser —
   create, apply, filter, reload persists) (test: dom test for chips + viewer-hidden controls)

## Current-state notes (VERIFY before building — code moves)
- No label/tag table exists in `db/schema/*` today (the only "label" is the runtime `reason` string in
  `conversations.ts`). This is a NEW explicit-label store, distinct from the AI one-liner.
- `conversations.ts:116` `REASON_BY_LABEL` is the sales-reply taxonomy; INBOX-T08 already governs the
  honest one-liner — shared labels must NOT reuse or overload that path.
- The "archive" = `inbox_triage.status='done'` (`outbound.ts:370`) — make it team-visible via the
  INBOX-X01 shared-mailbox scope; do NOT build a separate archive table.
- The 10 badge hues `--color-badge-0..9` + the `Badge` primitive are the UI DNA for chips
  (`_UI-DNA.md`) — use them; never hash-color or show a provider.
- Ask-AI-over-inbox-with-citations is INBOX-Q02 (T5) — this spec consumes it for the searchable archive;
  it does not reimplement retrieval.
- Read model caps at 500 (`lib/inbox/load.ts`); large archives lean on pagination + semantic retrieval.
