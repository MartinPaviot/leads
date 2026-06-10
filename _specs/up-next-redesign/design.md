# Up Next redesign — Design

## System fit
Reuses existing data + endpoints; adds one read aggregator and a new view. No
schema change. Pure logic is decoupled from the DB (unit-testable; any lane can
be absent without breaking the others).

```
/home (page.tsx)  — chrome only: onboarding gate, Hot widgets, prompts
  └─ <UpNextView/> (client)
       ├─ fetch /api/home/up-next  → { hero, items, ledger, engine, greeting }
       ├─ HeroCard      (items[0], large, primary action)
       ├─ Needs you     (items[1..], QueueCard each, collapse-on-action)
       ├─ Handled ledger (collapsed synthesis)
       └─ Engine line   (one number + one lever)
```

## Pure module — `src/lib/home/up-next.ts`
No DB, no fetch, no ambient time. Exports `buildNeedsYou`, `buildLedger`,
`buildEngineLine`, `ledgerSentence`, `isTestLabel`, + types.
- Lanes → normalised `NeedsYouItem`: reply (inbox attention), approval (scheduled
  agent_actions), deal_risk (live at-risk deals), meeting, task.
- Score (lower = more urgent): `laneBase + bucket − valueBoost − overdueBoost`.
  laneBase reply 0 / approval 4 / meeting 6 / deal_risk 20 / task 30; reply bucket
  from inbox priority; $ amount and staleness float items up.
- Dedupe by contact (reply beats task). Test rows dropped via `isTestLabel`
  (test markers only — no business-domain word lists).
- `buildLedger`: group reactions by trigger → verb + count + ≤3 samples +
  awaitingApproval sum. `buildEngineLine`: one state, one number, one lever.

## API — `src/app/api/home/up-next/route.ts`
`withAuthRLS`; parallel lanes, each degrades to [] on failure; never throws
(mirrors hydrate):
- replies: dynamic import `lib/inbox/load` + `lib/inbox/conversations`, attention
  lane → ReplyInput.
- approvals: `agent_actions` status 'scheduled', reversedAt null.
- deals/meetings/tasks/metrics: reuse the summary handler (one call, like hydrate)
  → live deals (isNull deletedAt), today's meetings, due tasks, founderMetrics.
- reactions: `agent_reactions` desc limit 40 → ledger.

## UI — `src/components/up-next/up-next-view.tsx`
Client; 15s poll; optimistic actions; owns EmailComposerPanel.
- Actions reuse only: approve/reverse `/api/agent-actions/{id}/…`; reply opens
  EmailComposerPanel; reply Snooze/Done → `/api/inbox/triage`; deal/meeting/task →
  navigate.
- Motion: on action → `removing` set → grid-rows 1fr→0fr + opacity collapse
  (180–200ms), then drop from state; resync on failure.

## Visual language (Apple-grade, existing tokens)
- One hero `--shadow-panel`, 26px greeting, brand gradient used once (hero
  hairline). Queue cards `--shadow-card` + 3px left accent by semantic tone
  (amber approval, blue reply, red risk, teal meeting, gray task).
- Ledger flat + collapsed. Centred max-width 1080px, 24px rhythm. One calm empty
  state (no "No X" triplets). No blur/backdrop/radial (GPU-safe).

## Failure handling / security
Every lane independent; route never throws; optimistic UI resyncs on non-2xx.
`withAuthRLS` tenant scoping; no new PII beyond existing endpoints.
