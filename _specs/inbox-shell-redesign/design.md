# Inbox Shell Redesign — Design

Faithful reproduction of the Upstream email-client IA. Anchored to live code in the
feat/inbox-ai-draft worktree (.../app/apps/web), verified 2026-06-20. The design
separates the autonomously-buildable VISUAL/IA layer (sidebar order + split strip +
full-width list + full-screen thread + top search, all frontend, all reuse existing
routes) from BACKEND GAPS (Starred, Drafts folder, Scheduled folder, per-conversation
unread) that need a column/route/job before their folder can ship.

## 1. Architecture diff vs existing

Already there (reuse as-is):
- Server read-model buildConversations + lane/priority/split/noise/SLA/followup
  (lib/inbox/conversations.ts:262) — UNCHANGED. [LOCKED]
- Split engine resolveSplit + splitCounts + resolveCustomSplit (lib/inbox/splits.ts)
  and the split= filter in the route (conversations/route.ts:124-149). Reused by the
  new split strip with NO backend change.
- InboxRow 44px single-line row (_inbox-row.tsx) — kept; add unread dot + hover
  quick-actions only.
- ConversationPane with AI draft, assignment, notes, labels, comments
  (_conversation-pane.tsx) — kept; reparented into the full-screen thread view.
- Debounced q= search (page.tsx:113-222) — kept; the input relocates to a top bar.
- InboxFolders sidebar (_inbox-folders.tsx) — kept as host; reordered + restyled.

Added (this spec):
- A reordered, Upstream-faithful sidebar (Inbox / Needs Reply / Follow Ups / divider /
  Snoozed / Sent / All Mail now; Starred / Drafts / Scheduled gated on backend).
- A new SplitStrip component (horizontal tab band above the list).
- A full-width list mode + a full-screen thread route (replaces master-detail split).
- A top InboxTopbar (full-width search + Upgrade pill + avatar).
- Backend: star column + routes; Drafts list route; Scheduled list route; All-Mail
  pass-through; optional per-conversation unread.

Removed/demoted:
- The list narrowing to w-[380px] on select (page.tsx:886) — gone (full-width).
- done/handled as primary folders — demoted to a secondary More section [NG4].

## 2. Component tree (target)

    InboxPage (page.tsx, client orchestrator — state stays here)
     |- InboxFolders        (left, ~208px; reordered; counts; Splits/Lanes groups)
     `- content column
        |- InboxTopbar      (NEW) full-width search + Upgrade pill + avatar
        |- SplitStrip       (NEW) Primary / Needs Reply / Follow Ups / Promotions /
        |                    Social / custom / Noise — count chips, split= driven
        `- outlet:
           |- ConversationList (full width)         when no thread open
           `- ThreadView (NEW wrapper)              when a thread is open
              |- ThreadToolbar (NEW) back/archive/trash/more + add-channel/comment
              `- ConversationPane (existing, reparented)

InboxTopbar and SplitStrip are presentational; they call the same setters the page
already owns (setSearch page.tsx:113, setActiveSplit page.tsx:84, setTab page.tsx:77).
No new global state store.

## 3. Full-screen thread: routing decision

Two options:
- (A) URL route /inbox/threads/[key] — a real nested route; list page and thread page
  are distinct URLs. Upstream-faithful, shareable, native back button.
- (B) In-place full-screen swap driven by thread=<key> on /inbox — one page, the outlet
  renders list xor thread; history.pushState for back.

DECISION: (B) thread=<key> on /inbox for THIS slice; design the outlet so (A) is a
later lift. Rationale: the page is one giant client orchestrator (page.tsx:74-1024)
holding all list/selection/triage/keyboard/palette state; a hard route split would
force that state into a shared layout or context and risks regressing the keyboard +
prefetch + palette wiring (page.tsx:618-809) — an ocean, not a lake. thread= keeps the
state co-located, is deep-linkable (mirrors the existing conversation= consume,
page.tsx:135-141), and gives native back via pushState. Upstream URL fidelity
(/threads/<id>) is cosmetic and deferred to a follow-up [HORS SCOPE for slice 1].

Selection vs open: today selectedKey both highlights the row AND opens the pane. Split
them: focusedKey (j/k highlight, no pane) vs openKey (thread=, full-screen). Enter
promotes focusedKey to openKey; Esc/back clears openKey back to the full-width list.

## 4. Data model diff (Drizzle)

Visual slice (R1-R4, R8.1-R8.3, R9.2): ZERO schema change — all data already exists.

Backend gaps:

R5 Starred — a nullable timestamp on the existing per-conversation triage row:
    ALTER TABLE inbox_triage ADD COLUMN starred_at timestamptz;  -- null = not starred
    CREATE INDEX inbox_triage_starred_idx ON inbox_triage (tenant_id)
      WHERE starred_at IS NOT NULL;
  Reuses inbox_triage (outbound.ts:389) keyed by (tenant_id, conversation_key); a star
  is another triage facet alongside status/doneAt/snoozedUntil. NO new table.

R6 Drafts + R7 Scheduled — NO schema change. outbound_emails already has status in
  {draft, held, ...} (outbound.ts:207-222), holdUntil (outbound.ts:310); scheduledSendAt
  lives on sequence_drafts (outbound.ts:169). The gap is READ routes (list the user own
  draft/held rows), not columns.

R3.3 unread (optional) — preferred stopgap is DERIVED, no column: compare a
  conversation lastInboundAt to the user lastSeen (seen-store.ts, route.ts:208). A true
  per-thread read marker (read_at on inbox_triage, or an inbox_read table) is a later
  lift if the derived signal proves too coarse.

## 5. Route diff

Reused unchanged: GET /api/inbox/conversations (lane, split, q, mailbox, page), POST
/api/inbox/triage, POST /api/inbox/splits, /api/inbox/drafts/[id]/consume.

New:
- conversations/route.ts: accept lane=all (skip the per-lane predicate at
  conversations/route.ts:150) for the All Mail folder [R8.1].
- conversations/route.ts: add a noise split count + expose noise as a selectable split
  id so split=noise filters c.noise===true [R8.2]; relabel the built-in other split to
  Primary and order it first [R8.3] (splits.ts:34-40).
- POST /api/inbox/star { conversationKey, starred:boolean } upserts starred_at on
  inbox_triage [R5.1]; the conversations route returns starred + a starredCount [R5.2].
- GET /api/inbox/drafts -> the user own outbound_emails status=draft, unsent, newest
  first (subject, snippet, threadId/key, updatedAt) [R6.2].
- GET /api/inbox/scheduled -> outbound_emails status=held with holdUntil in the future
  (+ any scheduled rows), with send time [R7.2]; verify the release worker first.

## 6. Orchestration (Inngest)

No new Inngest function for the visual slice. R7 (Scheduled) DEPENDS on the existing
held->queued release cron (CLE-11, referenced by send-later.ts as the exactly-once
claim). Before shipping the Scheduled FOLDER, confirm that cron is live on the target
env; if it is residual/disabled, R7 stays [OMIT] and the folder is not shown (R7.4) —
do not surface a Scheduled list whose items never actually send.

## 7. Integrations — confirm vs the locked stack

- Next 15 App Router + React 19 + Tailwind 4: all new components are client components
  under (dashboard)/inbox, same as today. [LOCKED]
- lucide-react icons (already used in _inbox-folders.tsx:12). [LOCKED]
- CSS tokens: reuse --inbox-row-height (globals.css:32), --color-accent,
  --color-bg-card, --color-border-default. No new design tokens for slice 1; the
  magenta Upgrade gradient reuses the existing onboarding/promo gradient (teardown/12
  records linear-gradient #12B4D8 -> #6C73E4 -> orange).
- No new dependency, provider, or SDK. [LOCKED]

## 8. Guardrails (one line each)

- Reuse the split= backend; do not fork a parallel filter path (route.ts:124-149).
- Keep buildConversations and the classification model untouched [NG1].
- Split focus (j/k) from open (thread=); never auto-open on focus (perf + back button).
- Full-screen thread MUST preserve list scroll position on back (R2.4).
- A folder with no backend (Starred/Drafts/Scheduled) is HIDDEN, never an empty shell
  (R5.4/R6.4/R7.4, NG5).
- lane=all must stay user-scoped (getInboxScope, route.ts:38) — All Mail widens the
  LANE filter, never the OWNERSHIP scope.
- star/drafts/scheduled routes are tenant + user scoped exactly like the conversations
  route; a forged key/id must not widen visibility.
- Keyboard, palette, hover-prefetch (page.tsx:618-809) must pass regression after the
  layout change — they are [DONE] behavior and a silent break is a FAIL.
- No new LLM call anywhere in this redesign [R1.8].
