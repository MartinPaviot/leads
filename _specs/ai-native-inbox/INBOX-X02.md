# INBOX-X02 — Team comments / @mentions (private)
> Theme: T8 · Autonomy rung: helper · Priority: P1
> Pillar: cross (P4 triage + collaboration)

## User story
As a member working a shared conversation, I want to leave a private comment on the
thread and @mention a teammate, so we can discuss how to handle a prospect inside the
inbox — without that discussion ever reaching the customer.

## Why (audit anchor)
Superhuman's team tier puts a **comment bar on every thread** — "@mention anyone and
share conversation" (`ai-feature-deep-dive.md:62`, observed in the reply composer
`screens 033–038`). Shortwave/Missive ship the same internal-comment thread. We have
nothing — discussion happens in Slack, detached from the email. We beat them by
grounding the comment thread in our **member graph** (the same `OwnerSelect`/collision
identities) and making a mention a **first-class notification** through our existing
notification spine, so an @mention is auditable and reaches the teammate even off-screen.

## Requirements (EARS)
- The system SHALL let a member post a private comment on any conversation they can see
  in a shared mailbox (a personal-mailbox conversation has no other audience, so comments
  there are visible only to the owner).
- A comment SHALL be **internal-only**: it is stored on the conversation, never sent over
  email, never added to any draft, and never visible to the counterparty.
- WHEN composing a comment, the system SHALL offer an @mention autocomplete over tenant
  members (reusing the `/api/settings/members` list), inserting a stable `users.id` reference.
- WHEN a comment @mentions a member, the system SHALL create a notification for that member
  via the existing notification system, deep-linking back to the conversation.
- The system SHALL show the comment thread inline in the reading pane, newest-last, each
  comment attributed to its author (name + relative time), distinct in style from email messages.
- The system SHALL scope comments to the tenant; a comment SHALL never be readable outside
  `authCtx.tenantId`, and an @mention SHALL only resolve to a member of that tenant.
- A **viewer** SHALL be able to READ comments on shared conversations but SHALL NOT post one
  (the central viewer write-gate blocks the POST).
- WHEN a comment author or mentioned member is deactivated, the system SHALL keep the comment
  and still attribute it by name (deactivated members stay named in history).
- The system SHALL let the author delete their own comment (soft delete); an admin SHALL be able
  to delete any comment in the tenant.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a shared conversation WHEN a member posts "let's not double-touch — @Alice you own this
  account" THEN the comment appears inline attributed to the author, and the email side is unchanged.
- GIVEN that comment WHEN Alice loads her notifications THEN she has a notification linking straight
  to the conversation, and following it scrolls to the comment.
- GIVEN a comment WHEN the counterparty's thread is later forwarded or replied to THEN the comment
  text is absent from every outgoing email and draft (internal-only, asserted by test).
- GIVEN a viewer WHEN they open a shared conversation THEN they can read the comments but the
  composer for a new comment is absent and a POST is rejected (403).
- GIVEN a comment author deactivated WHEN the thread is viewed THEN the comment still shows their
  name and the @mention they wrote still resolves to a name, not a raw id.
- GIVEN my own comment WHEN I delete it THEN it disappears for everyone (soft delete); GIVEN another
  member's comment WHEN I am an admin THEN I can delete it, but as a plain member I cannot.

## Edge cases & failure handling
- @mention of someone not in the tenant (typed raw, stale id) → not resolvable; the autocomplete only
  offers tenant members, and the stored reference is validated against the member list.
- Comment on a personal mailbox conversation → allowed but audience is just the owner (no teammate can
  see that conversation at all); no notification fan-out beyond a self-mention (suppressed).
- Mention storm (one comment @mentions five people) → one notification per distinct mentioned member,
  deduped; never notify the author of their own mention.
- Very long comment / pasted email → stored as plain text, rendered with line breaks; no HTML execution
  (comments are not email bodies — plain text only).
- Offline / post fails → optimistic comment marked "sending…", reconciles or rolls back with a toast.
- Multi-tenant: comments table is tenant-scoped; the conversation_key alone is never trusted without the
  tenant clause (same discipline as `inbox_triage`).

## Best-in-class bar
- An @mention is a **real notification** through our existing `notifications` spine (deep-linked,
  auditable), not just a styled token — the teammate is reached even when they're not looking at the inbox.
- Comments share the **same identity graph** as ownership and collision (one member list, one
  `users.id` space), so "@Alice" in a comment is the same Alice who owns the deal and shows up in the
  collision notice — Superhuman's comment @mentions live in a separate team-membership silo.
- Internal-only is **enforced by construction**: comments live in their own table and never touch
  `outbound_emails` or any draft path, so there is no way for an internal note to leak into an email.

## Design sketch
- **Data:** new `inbox_comment(id, tenant_id, conversation_key, author_user_id (users.id),
  body_text, mentioned_user_ids text[], created_at, deleted_at)`; index `(tenant_id,
  conversation_key)`. Mentions stored as `users.id[]` for clean notification fan-out. No email
  columns by design.
- **API:** `GET /api/inbox/comments?conversationKey=…` (tenant-scoped, members+viewers read),
  `POST /api/inbox/comments { conversationKey, bodyText, mentionedUserIds }` (member+, viewer
  blocked by `viewer-guard.ts:37`), `DELETE /api/inbox/comments/[id]` (author or admin via
  `requireAdmin`, `auth-utils.ts:109`). On POST, fan out one notification per distinct mentioned
  member using the existing `notifications` tables (`db/schema/outbound.ts:387+`), `type` =
  an inbox-mention variant, payload = `{ conversationKey, commentId }`. Member names via
  `getTenantMemberNames` (`lib/collision/member-names.ts`, which deliberately includes deactivated).
- **UI:** a comment thread + composer below the email messages in `_conversation-pane.tsx` (after the
  message list ~`:471`), visually distinct (left accent rule `--color-accent-soft`, `--color-bg-hover`
  card, `text-[12px]`). @mention autocomplete is a lightweight popover over the member list. Surface =
  inline pane section + popover; tokens `--color-accent` (mention chip), `--color-text-secondary`
  (timestamps), `--color-border-default`; lucide `MessageSquare` (comment) / `AtSign` (mention);
  shortcut `c` = focus the comment box on the selected conversation (added to the pane/keyboard handler,
  ignored while typing). Light + dark via tokens, no emoji, no provider name, cited (each comment
  carries author + time; the mention notification cites the source comment).
- **AI:** none in v1 (a later rung could draft a suggested internal summary for handoff — see INBOX-X06).
- **Security/perf:** plain-text only (no `dangerouslySetInnerHTML`); tenant clause on every query; one
  indexed read per conversation; notification fan-out deduped and self-mention suppressed.

## Tasks (ordered)
1. Migration: `inbox_comment` table + index. (verify: drizzle generate/apply clean) (test: schema-shape test)
2. `GET`/`POST`/`DELETE /api/inbox/comments` — tenant-scoped, viewer-blocked POST, author/admin delete,
   mention validation against the member list. (verify: post + read round-trip; viewer POST → 403)
   (test: route test incl. cross-tenant rejection + viewer block)
3. Notification fan-out on @mention (one per distinct member, self-mention suppressed, deep-link payload).
   (verify: mention Alice → Alice gets one notification linking to the thread) (test: fan-out unit)
4. Comment thread + composer + @mention popover in `_conversation-pane.tsx`; `c` shortcut; deactivated
   author still named. (verify: browser — post a comment, see it inline, email side unchanged) (test:
   dom test + an assertion that comment text never appears in any outbound/draft payload)

## Current-state notes (VERIFY before building — code moves)
- No comment/mention table exists in `db/schema/*` (grep: only sequence-step `subject_template`/
  `body_template` and `outbound_emails.reply_snippet` — unrelated).
- `notifications` tables + `notification_type` enum exist (`db/schema/outbound.ts:387+`) — add an
  inbox-mention type rather than a new notification system.
- `getTenantMemberNames` (`lib/collision/member-names.ts:14`) returns `users.id → name` and
  **includes deactivated** members on purpose — exactly what comment attribution + mention resolution need.
- Reading pane is `_conversation-pane.tsx`; message body renders ~`:471`; the `reason` badge ~`:277`.
- Viewer write-gate is central (`middleware.ts:152` → `viewer-guard.ts:37`); `requireAdmin` at
  `auth-utils.ts:109` (no `requireMember` — non-viewer is the default for member-write routes).
