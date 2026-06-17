# INBOX-T03 — Newsletter & promo bundles + bulk triage
> Theme: T2 · Autonomy rung: proactive · Priority: P2
> Pillar: P4 triage

## User story
As a user, I want newsletters and promotional mail grouped into a single collapsible bundle I
can clear in one action, so subscription noise never competes with real conversations.

## Why (audit anchor)
Shortwave's **Bundles** group newsletters/promos so they can be bulk-triaged
(`ai-native-mailbox-audit.md` §3). Superhuman achieves the same via Auto Labels + Auto Archive
of "marketing/social updates" (`ai-feature-deep-dive.md` "Auto Archive"). We already detect bulk
mail deterministically — `classifyInboundSender` returns `isBulk` and `senderType`
`automated_marketing` from `List-Unsubscribe`/`Precedence`/marketing roles/body hints
(`lib/inbound/lead-classification.ts:220`) — so the detection is free; T03 is the **grouping +
bulk action** on top.

## Requirements (EARS)
- The system SHALL group conversations whose last inbound is classified `isBulk` /
  `automated_marketing` into a single "Bundles" view, separate from the attention lane.
- The system SHALL sub-group bundles by sender (one row per newsletter source) with an unread
  count and the latest subject.
- WHEN a user expands a bundle source, the system SHALL list that source's recent items.
- The system SHALL offer one-action **bulk triage** on a bundle source: mark all done/archive
  all, and (deferring to INBOX-T07) **unsubscribe + block** the source.
- The system SHALL keep bulk mail OUT of the `attention` lane and out of the dashboard "Needs
  you" (consistent with today's `inboundIsAutomated → handled`, `conversations.ts:262`).
- The system SHALL never bundle a conversation that has any outbound from us (a real thread),
  even if the latest inbound looks bulk.
- The system SHALL show a per-source "why bundled" (the protocol reason from `reasons[]`), no
  vendor name.
- The system SHALL respect per-user/tenant scope (bundles are computed over the scoped set).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN three newsletters from `news@substack.com` WHEN the inbox loads THEN they appear as one
  bundle source "Substack (3)", not three attention rows.
- GIVEN a bundle source WHEN the user clicks "Mark all done" THEN all its items leave the bundle
  and the source count drops to 0.
- GIVEN a bundle source WHEN the user clicks "Unsubscribe + block" THEN INBOX-T07 runs and the
  source is suppressed from future bundles.
- GIVEN a marketing email that is actually a reply in one of our threads (has outbound) WHEN
  classified THEN it stays in the conversation, not the bundle.
- GIVEN a bulk email WHEN listed anywhere THEN it never appears in the `attention` lane or "Needs
  you".
- GIVEN a bundle source WHEN expanded THEN each item shows a "why bundled" tooltip ("bulk
  mailing-list headers").
- GIVEN two tenants WHEN bundles compute THEN tenant A never sees tenant B's bulk mail.

## Edge cases & failure handling
- Borderline sender (soft role `info@`, no list headers) → NOT bundled (we never risk hiding a
  human); stays in attention per the soft-role rule (`lead-classification.ts:242`).
- Mixed bundle source (newsletter that later sends a personal reply) → the personal reply, once it
  has our outbound or fails the bulk test, surfaces normally.
- Huge bundle (hundreds) → paginated within the source; bulk action runs server-side in batches.
- Bulk action partial failure → report which items failed; never claim success silently.
- Unsubscribe link missing → fall back to block-only (INBOX-T07), explained.
- Multi-tenant/per-user: computed over `scopeConversationRows` output only.

## Best-in-class bar
- Bundling is grounded in **protocol-level signals** we already compute (`List-Unsubscribe`,
  `Precedence`, `Auto-Submitted`) — deterministic and free, not an LLM guess — so it never
  buries a real person, which is the failure mode of content-based bundlers.
- Bulk triage chains straight into our **suppression ledger** (`lib/accounts/suppression.ts`) and
  sequence opt-out, so "unsubscribe + block" is durable, not a per-message dismiss.

## Design sketch
- **Data:** no new table — derive from the assembled `Conversation[]` using the cached
  classification. Persist the classification at capture so the list query can filter cheaply
  (extend `activities.metadata` with `senderClass` from `classifyInboundSender`, written in
  `lib/capture/email-capture.ts`). Suppression via `accountSuppressions`
  (`lib/accounts/suppression.ts`).
- **API:** `/api/inbox/conversations` gains a `lane=bundles` (or a `?bundle=1` view) returning
  conversations grouped by sender with counts; a `POST /api/inbox/bundles/triage` for bulk
  done/archive/unsubscribe over a source (chains INBOX-T07 + suppression).
- **UI:** a "Bundles" entry in the lane tabs (`page.tsx:36`), rendered as collapsible source rows
  (light card, `--color-bg-card`, chevron `ChevronDown`), each with a count `Badge`, latest
  subject, and a row action menu (`MoreMenu`) → Mark all done / Archive all / Unsubscribe + block.
  lucide `Mailbox`/`Inbox` for the bundle, `Layers` for grouping. Shortcut: select a bundle
  source + `e` to clear it. Light+dark via tokens, no emoji, no provider name, "why bundled" cited.
- **AI:** none (deterministic classification already exists); optional later: an AI label can route
  into a bundle via INBOX-T02, but the default is protocol-based.
- **Security/perf:** computed over the scoped set; bulk actions batched + idempotent; no cross-tenant.

## Tasks (ordered)
1. Persist `senderClass` (from `classifyInboundSender`) at capture into `activities.metadata`.
   (verify: new inbound has senderClass) (test: capture test)
2. `lib/inbox/bundle.ts` pure grouping of `Conversation[]` by bulk source. (verify: unit) (test:
   `bundle.test.ts` — groups by sender, excludes threads-with-outbound, excludes soft roles)
3. `lane=bundles` view in `/api/inbox/conversations`. (verify: API returns grouped sources)
   (test: route)
4. `POST /api/inbox/bundles/triage` bulk done/archive/unsubscribe (chains T07 + suppression).
   (verify: source count → 0; suppression row written) (test: route)
5. Bundles UI: collapsible source rows + bulk action menu. (verify: browser — Substack collapses
   to one row, "Mark all done" clears it) (test: render)
6. Confirm bulk mail stays out of attention + "Needs you". (verify: live) (test: lane test)

## Current-state notes (VERIFY before building)
- Bulk detection already exists and is free: `lib/inbound/lead-classification.ts:182`
  `classifyInboundSender` → `isBulk`, `senderType: automated_marketing`, `reasons[]`.
- Bulk mail is already pushed to `handled` (out of attention): `conversations.ts:262-273`
  (`inboundIsAutomated`). T03 adds the *grouped view + bulk action*, not the detection.
- Suppression ledger exists: `lib/accounts/suppression.ts` (`suppressContacts`, `filterAllowed`).
- No bundle view/table exists today.
