# INBOX-S03 — Catch-me-up digest (since last seen)
> Theme: T3 · Autonomy rung: proactive · Priority: P1
> Pillar: P2 reading

## User story
As a user returning to my inbox after time away, I want a digest of what happened since I last
looked — grouped, cited, with the few things that need me pulled to the top — so I can catch up in
one read instead of opening twenty threads.

## Why (audit anchor)
Superhuman ships schedulable **agent Skills** — **Morning Briefing** and **End-of-Day Wrap-Up** —
that summarize your mail on a cadence (`ai-feature-deep-dive.md` §MCP; `feature-inventory.md`).
Shortwave's catch-me-up is similar. We have **no digest**; the closest surface is the dashboard
"Needs you" (`app/api/home/up-next/route.ts`) which is single-list, uncited, not time-bounded.
Our edge: the digest is **grounded in the same scoped inbox model with citations** and groups by
the **GTM context** (deals/people), not just "unread" — Lightfield recall + Monaco intel.

## Requirements (EARS)
- WHEN the user opens the catch-me-up surface, the system SHALL summarize conversations with new
  inbound since a chosen boundary (default: last app-open / last digest; user can pick "today",
  "since yesterday", "last 7 days").
- The digest SHALL be grouped (e.g. Needs you · Replies to your sequences · FYI / automated) and,
  within groups, ordered by the existing priority bucket (`conversations.ts:282`).
- Each digest item SHALL carry a one-line summary (reuse INBOX-S02) and a citation/deep-link to its
  thread; the digest SHALL NOT assert anything beyond what those threads contain, generated "via Elevay".
- The "Needs you" group SHALL contain only the attention lane (`conversations.ts:279`), so automated
  and handled mail never demands action.
- The system SHALL compute the digest from the scoped read model only (`scopeConversationRows`),
  per-user/tenant; nothing cross-tenant or cross-mailbox.
- The system MAY be scheduled (Morning Briefing / End-of-Day) via Inngest cron, delivering the same
  digest in-app and/or as a notification (INBOX-N02), gated by user setting.
- WHEN there is nothing new since the boundary, the system SHALL say so plainly ("Nothing new since
  …"), never invent items.
- The digest SHALL be idempotent for a given (user, boundary) and cached so re-opening is instant.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN 12 new threads since last open WHEN I open catch-me-up THEN I see grouped items (Needs you / Sequence replies / FYI), each a one-line cited summary linking to its thread.
- GIVEN 3 of those are sequence replies and 2 are prospect questions WHEN shown THEN they sit in "Needs you", ordered by priority; newsletters sit in "FYI".
- GIVEN I click a digest item WHEN it opens THEN it deep-links to that thread (and to the cited message).
- GIVEN nothing arrived since the boundary WHEN I open THEN "Nothing new since <time>" shows, no fabricated items.
- GIVEN I change the window to "last 7 days" WHEN applied THEN the digest recomputes over that window.
- GIVEN the Morning Briefing schedule is on WHEN the cron fires THEN I get the same grouped, cited digest as a notification (INBOX-N02).
- GIVEN another user's mail WHEN my digest renders THEN none of it appears (scope).

## Edge cases & failure handling
- First-ever open (no "last seen") → default window = last 24h; explain the boundary used.
- Hundreds of new items → cap per group with a "+N more" expander; summarize the top, count the rest (real COUNT, never a fetch-cap artifact).
- Per-message summaries not yet generated → generate on demand or show snippet fallback (INBOX-S02), never block the digest.
- Time-zone: boundary computed in the user's tz (reuse calendar tz handling).
- No mailbox connected → empty state "Connect your mailbox" (mirror `inbox/page.tsx`), no digest.
- Digest generation partial failure → render what's grounded, mark the rest "unavailable" (`hallucination-fallback.tsx`).

## Best-in-class bar
- Grouped by **GTM meaning** (Needs you / sequence replies / FYI) using our owned outbound + lane model — Superhuman's briefing can't separate "reply to your campaign" from generic mail; ours can.
- Every digest item is **cited and deep-linked**; "Nothing new" is honest. Same scoped model as the inbox, so the digest can never disagree with the lanes.
- One engine powers both the on-open catch-up and the scheduled Morning/End-of-Day briefing (INBOX-N02) — no parallel logic.

## Design sketch
- **Data:** read-only over `activities`/`outbound_emails`/`inbox_triage` via the existing read model; per-user "last seen" stored in `user_preferences` (no migration if a JSONB prefs blob exists; else add `inbox_last_digest_at`). Reuse `metadata.aiSummaryLine` (INBOX-S02) for item lines.
- **API:** new `GET /api/inbox/catch-up?since=<iso|preset>` → `getInboxScope` → `scopeConversationRows` → `buildConversations` → filter `lastInboundAt > boundary` → group by lane/sequence-reply → attach S02 lines → cited bundle. Reuse, don't re-query raw (`lib/inbox/load.ts`, `conversations.ts`). Scheduled variant: an Inngest cron (event-driven sweep, per the Inngest-cost discipline) that calls the same builder and emits INBOX-N02.
- **UI:** a catch-me-up panel openable from the inbox header (command palette `INBOX-K01` action "Catch me up") and the dashboard. Surface = card `--color-bg-card`, group headers `text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]`, items = list rows `hover:bg-[var(--color-bg-hover)]`, `rounded-lg`, `--shadow-card`; lucide `Inbox`/`Clock`/`ChevronRight`; window picker = existing `column-filter`-style control; deep-link via `source-link.tsx`. Light+dark via tokens, no emoji, no provider name, cited "via Elevay".
- **AI:** model role = group + one-line each (reuse S02 lines; the digest itself is assembly + optional 1-paragraph executive line over the grouped set, grounded in the items). Autonomy = proactive when scheduled; helper when opened. Fail-closed per item.
- **Security/perf:** scoped; cached per (user, boundary); scheduled job is event-driven/swept (avoid idle cron cost, per Inngest-cost-reduction memory); zero-retention honored.

## Tasks (ordered, each with a verify step + test to write)
1. `GET /api/inbox/catch-up` over the scoped read model with `since` + grouping. (verify: returns grouped cited items for a window) (test: `catch-up.test.ts` — only attention in "Needs you"; nothing-new path; scope excludes other users)
2. Catch-me-up panel UI + window picker + command-palette action. (verify: browser — grouped digest renders, deep-links work) (test: dom render)
3. Per-user "last seen" read/write + default-window logic. (verify: boundary advances on open) (test: boundary unit)
4. Scheduled Morning/End-of-Day variant → INBOX-N02, gated by setting, event-driven cron. (verify: cron fires the same digest as a notification) (test: scheduled-builder test)

## Current-state notes (VERIFY before building)
- `app/api/home/up-next/route.ts` already uses the same inbox scope ("Needs you") — model the "Needs you" group on it, don't fork the logic.
- `lib/inbox/load.ts` + `conversations.ts` are the read model to reuse; lanes/priority already computed (`conversations.ts:279,282`). VERIFY.
- "Sourced by Elevay" + real COUNT discipline (no fetch-cap artifacts) per memory; per-user "last seen" storage location must be VERIFIED (`user_preferences` shape).
- Depends on INBOX-S02 (item lines); feeds INBOX-N02 (scheduled digest). Inngest cron must be event-driven/swept (Inngest-cost-reduction memory).
