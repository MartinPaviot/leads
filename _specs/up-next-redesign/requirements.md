# Up Next redesign — Requirements

## Problem (one sentence)
The home page ("Up next") runs two competing prioritisation systems that
contradict each other, dumps the agent's raw log as identical cards, hides the
approval action exactly when it is needed, and has no single "what do I do now"
answer — so it reads as a low-intelligence dashboard, not an autonomous chief of
staff's morning briefing.

## User story
As a founder doing founder-led sales, when I open Elevay in the morning I want a
single, ranked list of the few things that genuinely need *me* (my judgment, my
voice, my relationships), each with one obvious action, plus a short proof that
the agent handled the rest overnight — so I can clear my morning in minutes and
trust the engine.

## Scope
Rebuild `/home` ("Up next") around three regions, sourced from LIVE data:
1. **Hero** — the single most important item, expanded, with its primary action.
2. **"Needs you"** — one merged, deduplicated, urgency×value-ranked queue.
3. **"Handled for you"** — a synthesised (not row-dumped) autonomy ledger,
   collapsed by default, + one honest engine-health line with one lever.

## Acceptance criteria (GIVEN / WHEN / THEN)

- **AC1 — One ranked queue.** Inbound replies, pending agent approvals, meetings
  today, at-risk deals and due tasks are merged into ONE list ordered by
  urgency×value; each item shows who · context · why-now · stakes · one primary
  action. The legacy stacked sections (Your priorities / Insights / Hot contacts
  / Recommendations / Tasks due / Deals at risk / weekly stats / What I'm
  tracking) are not rendered as separate blocks.

- **AC2 — Approval present when there is something to approve.** Each
  `agent_actions` row with status `scheduled` and `reversedAt IS NULL` appears as
  an item with **Approve** and **Skip** wired to the existing endpoints.

- **AC3 — No self-contradiction.** The engine line and any deal item are computed
  from the SAME live `deals` source (isNull deletedAt). `agentWorkItems` is not a
  source for the queue. No number on the page disagrees with another.

- **AC4 — Differentiated content.** No two items share an identical reason line
  unless their underlying signal is genuinely identical; each "why now" is its
  real grounded label, never a constant string.

- **AC5 — Inline action with motion.** Approve / Skip / Snooze / Mark done / Reply
  fire against real endpoints; the card collapses out (transform/opacity/height
  only), the queue count decrements, the hero recomputes.

- **AC6 — Synthesised ledger.** Recent `agent_reactions` are grouped by trigger
  with counts ("Detected signals at Siit, Axelor +3"), collapsed by default — not
  one identical card per reaction.

- **AC7 — Honest empty + engine line.** Empty queue → ONE calm line; the engine
  line states one true number + one lever CTA.

- **AC8 — No test data.** Rows whose label marks them test/e2e are excluded.

## Edge cases
- Zero of everything → calm empty state + engine line only.
- Inbox-triage module/table absent → inbound-reply lane degrades to empty.
- Scheduled action past window / executed → not shown as approvable.
- Optimistic action fails → card restored + quiet resync.

## Non-goals
- No new enrichment/scoring; consolidation + presentation only.
- No change to how the agent decides (reactor) beyond reading what it stored.
- Keyboard shortcuts and bulk actions are a follow-up.
