# INBOX-T10 — Auto-archive / done + computed reopen (extend existing lanes)
> Theme: T2 · Autonomy rung: proactive · Priority: P2
> Pillar: P4 triage

## User story
As a user, I want low-value mail (marketing, social updates, cold pitches I don't want) to skip
my inbox and land in an Archived view automatically — forward-only, with Always/Never lists I
control — and reopen if a real reply arrives, so my attention lane only holds what matters.

## Why (audit anchor)
Superhuman's **Auto Archive** sends mail matching a configured Auto Label straight to an
Auto-Archived folder, **forward-only** (never retroactive), with **Always Archive / Never Archive**
address/domain lists (`ai-feature-deep-dive.md` "Auto Archive"). We already have computed lanes
with **computed reopen** (`attention | handled | snoozed | done`, reopen-on-new-inbound at
`conversations.ts:246-253`) — T10 **extends** them with an auto-archive path + an Archived view,
reusing the reopen logic so an archived thread that gets a genuine reply comes back.

## Requirements (EARS)
- WHEN an inbound conversation matches an archive-enabled filter (INBOX-T02) OR the Always-Archive
  list, the system SHALL place it in the Archived view and keep it out of `attention`.
- The system SHALL apply auto-archive **forward-only**: enabling a rule SHALL NOT retroactively
  archive existing mail (only a bounded, explicit backfill if the user asks).
- The system SHALL maintain user-editable **Always Archive** and **Never Archive** lists
  (addresses/domains); Never Archive SHALL override any archive rule.
- WHEN an archived conversation receives a new inbound reply that is NOT itself auto-archived, the
  system SHALL reopen it to `attention` (reuse computed reopen).
- The system SHALL show, per auto-archived conversation, which rule/list caused it (the "why"), no
  vendor name.
- The system SHALL keep manual archive (a user action) distinct from auto-archive, both landing in
  Archived, both reopenable.
- The system SHALL respect the per-rule autonomy dial (INBOX-T11): an archive rule on "suggest"
  leaves the mail in the inbox with a one-click "Archive (rule: X)" instead of auto-archiving.
- The system SHALL keep auto-archive per-user/tenant; rules and lists are personal.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an archive rule "marketing" set to **auto** WHEN a marketing email arrives THEN it goes to
  Archived, not attention, with "auto-archived: marketing".
- GIVEN the rule is enabled now WHEN existing marketing mail already in the inbox is considered
  THEN it is NOT retroactively archived (forward-only).
- GIVEN a domain on **Never Archive** WHEN its mail arrives THEN it stays in attention even if a
  rule would match.
- GIVEN a domain on **Always Archive** WHEN its mail arrives THEN it is archived regardless of
  content.
- GIVEN an auto-archived thread WHEN the sender sends a real (non-bulk) reply THEN it reopens to
  attention.
- GIVEN an archive rule on **suggest** WHEN a match arrives THEN it stays in the inbox with an
  "Archive (rule: marketing)" one-click affordance.
- GIVEN two tenants WHEN auto-archive runs THEN no cross-tenant mail is archived.

## Edge cases & failure handling
- Rule matches a thread that has our outbound (a real conversation) → do not auto-archive a live
  thread; archive applies to non-engaged inbound (consistent with bundle exclusion, T03).
- Always + Never list both contain the same domain → Never wins (safety: never hide mail).
- Reopen loop (archived → reply → archived) if the reply itself is bulk → only a non-bulk reply
  reopens; a bulk follow-up stays archived.
- Backfill requested → bounded window + paginated, explicit user action only.
- Rule deleted → already-archived mail stays archived (a placement, not a live filter); reopen
  still works.
- Multi-tenant/per-user: placement + lists scoped to owner.

## Best-in-class bar
- Auto-archive **reuses our computed-reopen** so an archived thread with a genuine reply resurfaces
  automatically — many clients bury auto-archived mail until you go looking; ours brings the real
  ones back.
- Archive decisions are **honest and cited** (the rule/list that fired) and **forward-only by
  default**, with Never Archive as a hard safety override — no silent retroactive hiding.

## Design sketch
- **Data:** extend the lane model with an `archived` placement. Cheapest path: a triage-style row
  or an `activities.metadata.archived {by: "rule"|"manual", ruleId, why}` flag, read by
  `buildConversations` to route into an Archived view (parallels `inbox_triage` done/snooze). The
  Always/Never lists live on the user's filter config (INBOX-T02) or a small `inbox_archive_lists`
  (per-user). Reopen reuses `conversations.ts:246-253`.
- **API:** the conversations endpoint gains an `Archived` view (`?lane=archived`); a `POST
  /api/inbox/archive` `{conversationKey, mode:"manual"}` for explicit archive; auto-archive runs in
  the enrich pass (`inngest/sync-functions.ts`) when a filter with `action:"archive"`,
  `autonomy:"auto"` matches (INBOX-T02/T11). Bounded backfill endpoint behind an explicit action.
- **UI:** an "Archived" tab in the lane tabs (`page.tsx:36`), rows showing the "why" + a Reopen
  button (reuse the Done-lane Reopen at `_conversation-pane.tsx:348`). Always/Never list editor in
  settings (light list, `Badge` chips, lucide `Archive`/`ShieldOff`). Suggest-mode "Archive (rule:
  X)" inline affordance in the reading pane. Light+dark via tokens, no emoji, no provider name, "why"
  cited.
- **AI:** none beyond the INBOX-T02 classifier that an archive rule may use; default Always/Never are
  deterministic.
- **Security/perf:** forward-only by default; Never overrides; reopen computed; owner-scoped;
  archived placement cached (no per-render LLM).

## Tasks (ordered)
1. Add an `archived` placement to the read model (`buildConversations`) + `Archived` lane/view.
   (verify: archived items route out of attention) (test: conversations.test.ts archived routing)
2. `inbox_archive_lists` (Always/Never, per-user) + Never-overrides-rule logic. (verify: Never
   keeps mail in attention) (test: list precedence test)
3. Auto-archive in the enrich pass for `action:"archive" + autonomy:"auto"` filters (forward-only).
   (verify: new match archived, old mail untouched) (test: forward-only test)
4. `POST /api/inbox/archive` (manual) + `?lane=archived` view + bounded backfill. (verify: API)
   (test: route)
5. Archived tab UI + Reopen + suggest-mode "Archive (rule: X)". (verify: browser — marketing
   auto-archives, a real reply reopens) (test: render)
6. Reuse computed reopen for archived threads; bulk-mail follow-up stays archived. (verify: live)
   (test: reopen test)

## Current-state notes (VERIFY before building)
- Computed lanes + reopen already exist (extend, don't replace): `conversations.ts:54` `Lane`,
  `:246-253` reopen-on-new-inbound, `:267` handled routing.
- Reopen UI precedent: `_conversation-pane.tsx:348` (Done lane "Reopen").
- Lane tabs: `page.tsx:36` `TABS` + `:28` `TAB_LABELS` (add "Archived").
- Bulk/marketing detection (what most archive rules target) already free:
  `lib/inbound/lead-classification.ts:220` (`isBulk`/`automated_marketing`).
- Depends INBOX-T02 (archive-action filters) + INBOX-T11 (autonomy dial). No archive view/lists
  table exists yet.
