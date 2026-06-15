# Call Lists — Design

Anchored on the engine read 2026-06-15 (`lib/voice/queue.ts`,
`lib/voice/campaign.ts`, `lib/voice/call-sprint.ts`,
`app/api/calls/{campaign,queue,dial-status}/route.ts`,
`app/(dashboard)/call-mode/page.tsx`, `_call-plan-form.tsx`,
`lib/chat/tools/calls.ts`).

## D0 — The one decision to confirm before BUILD

**Recommended: model A2a — one global objective + N named sector lists,
alternated; cadence per contact.** Storage A4 = a new `call_lists` table.

Why A2a over A2b (one campaign per list):
- The whole engine (one `dailyQuota`, one cadence, `generateDailyCallList`,
  `getTodaysCallList`) is reused unchanged; a sector list only (a) sets the
  active top-up audience and (b) filters/sorts the visible queue.
- Territory exclusivity (`campaign.ts:381-385`) excludes a contact in ANY active
  campaign of the tenant, NOT scoped by owner. Under A2b the rep's own EMS
  campaign would steal contacts from their own federations campaign — the
  exclusivity model would have to be reworked to per-(campaign) instead of
  per-(tenant,contact), which also weakens the cross-rep guarantee. A2a sidesteps
  this: one campaign, one target per contact, lists are views (R7.2/R7.3).
- Fits the live reality (one founder-seller, "1000 calls this week"). Independent
  per-sector quotas (A2b's only real advantage) are a [SEAM], not a day-1 need.

If Martin wants simultaneous independent quotas (e.g. 200 EMS/day AND 50
feds/day in parallel), choose A2b and the data model below gains a `quota`,
`maxAttempts`, `windowDays` per `call_lists` row plus an exclusivity rework — a
larger slice. **Everything else in this design is identical under both models.**

## System fit

- "To call now" today renders one `queue` array from one source chosen at
  bootstrap (`page.tsx:314-359`): `/api/calls/campaign` (campaign daily list) or
  `/api/calls/queue?accounts=` (ad-hoc account scope). Lists slot in BETWEEN the
  source and the render: the source still produces gated candidates; a **list
  resolver** filters + orders them, and a **selector** picks the active list.
- The sector-list segment is the generalisation of today's single
  `targetFilter.audience`. `sprintAudienceConditions` (`call-sprint.ts:47`) is
  extended from {industries, personas} to the full R4 parameter set; every other
  consumer of audience conditions (top-up `campaign.ts:387`, counts
  `call-sprint.ts:277`, enrichment `call-sprint.ts:244`) keeps working because
  they all call the same builder.

## Data model (A2a + A4)

New table `call_lists` (migration):
```
call_lists
  id            uuid pk
  tenant_id     uuid not null            -- RLS / scoping
  campaign_id   uuid not null            -- the rep's campaign (owner of the quota)
  owner_id      uuid                     -- the rep (mirrors callCampaigns.ownerId)
  name          text not null
  kind          text not null            -- 'sector' (system lists are derived, not stored)
  segment       jsonb not null default '{}'  -- R4 parameter set (see Segment shape)
  sort          text not null default 'fit'  -- one R5 key
  created_at    timestamptz default now()
  updated_at    timestamptz default now()
  -- partial index (tenant_id, campaign_id) for the per-rep list fetch
```
`Segment` jsonb shape (all optional, AND-combined), each validated verbatim:
```
{ industries?: string[], personas?: string[], seniority?: string[],
  signals?: string[], stages?: string[], dealValueMin?: number,
  geo?: { countries?: string[]; cantons?: string[] }, sizeMin?: number, sizeMax?: number,
  replaceableTech?: string[], source?: ('elevay'|'csv'|'manual')[],
  owner?: 'mine'|'unassigned'|'team', freshnessDays?: number,
  fitMin?: number, phoneType?: ('mobile'|'direct'|'switchboard')[] }
```
- The recommended model keeps `callCampaigns.targetFilter.audience` as the
  ACTIVE list's segment (what the cron's top-up reads), so
  `generateDailyCallList` needs **no change** — selecting a list writes its
  segment there (R3.4). `call_lists` is the durable catalogue; `audience` is the
  pointer to the active one.
- New terminal target state for dead numbers: reuse `status='exhausted'` with a
  `lastOutcome='invalid_number'`, OR add an `invalid_number` status. Prefer
  reusing `exhausted` + a distinct `lastOutcome` to avoid touching the status
  enum and every switch on it (`campaign.ts:546`). [confirm in tasks]

## API contracts

- `GET /api/calls/lists` → `{ system: SystemList[], sector: SectorList[], activeListId }`
  where each carries `{ id, name, counts:{total,withPhone,callable} }` (R2.4,
  R4.17). System lists derived from target state (R2.1); sector from `call_lists`.
- `POST /api/calls/lists` `{ name, phrase? | segment, sort? }` → resolves a phrase
  via `resolveSprintAudience` (extended) or validates an explicit `segment`
  (`validateSprintLabels` extended), inserts a `call_lists` row, returns it with
  counts. [NEW]
- `PATCH /api/calls/lists/[id]` `{ name?, segment?, sort? }` → re-validate +
  update. `DELETE` → remove; if it was active, clear `targetFilter.audience`
  (fall back to whole ICP) (R1.5). [NEW]
- `POST /api/calls/lists/[id]/activate` → writes the list's segment to
  `callCampaigns.targetFilter.audience` (reuses `updateCallCampaign({audience})`
  `campaign.ts:235`) and regenerates today's list (`generateDailyCallList`),
  returning the new queue (mirrors PATCH campaign `campaign/route.ts:259-264`).
  [NEW]
- `GET /api/calls/campaign` (existing) → extend response with the active list +
  the system-list counts so the cockpit bootstrap stays one round-trip
  (`campaign/route.ts:114`). [CHANGE]
- `GET /api/calls/queue` (existing) → accept `?list=<id>` to filter+sort an
  ad-hoc render without touching the campaign audience (used when a rep peeks a
  list without making it the top-up target). [CHANGE]
- `dial-status` webhook → read terminal failure status + code, map to outcome,
  call `recordCallOutcomeForCampaigns` (R6.4). [CHANGE]

## Data flow

1. Bootstrap: cockpit calls `GET /api/calls/campaign` → gets campaign + active
   list + system/sector lists with counts. Selector renders (R3.1).
2. Rep picks a system list → client filters the already-loaded today queue by
   target state (no fetch needed for "Today"/"Callbacks due"/"New to call").
3. Rep picks a sector list → `POST .../activate` sets the audience + regenerates;
   queue returns filtered+sorted; selection persisted (R3.3).
4. Each morning the cron (`call-campaign-cron.ts`) runs `generateDailyCallList`,
   whose top-up already reads `targetFilter.audience` = the active list's segment
   (R3.4); retries due (NRP from prior days) come first (`campaign.ts:340`).
5. A call ends → `dial-status` classifies terminal status (R6.4) → cadence
   advances → tomorrow's "Callbacks due"/"New" reflect it (R2.3).

## Failure handling

- Label resolution fail-closed: an unresolved facet is absent, never invented
  (R0.3, `call-sprint.ts` already does this).
- Dead-number classifier uncertain → default NRP (R8.4/R6.5) — a wasted retry
  beats killing a good contact.
- `activate`/regenerate failure → keep the previously active list; surface a
  toast; never blank the queue.
- Counts query failure → show the list without a count rather than hide it.
- All gates remain server-side; the client filter is a VIEW over already-gated
  rows, so a client bug can never surface a DNC/quiet-hours contact.

## Security

- Every new endpoint goes through `withAuthRLS`; `call_lists` is tenant- and
  owner-scoped exactly like `callCampaigns` (`campaign/route.ts` pattern).
- No provider names in any list label or count surface ("sourced by Elevay").
- Money/exec actions unaffected; list management is a normal member action.
- The dead-number webhook keeps the existing Twilio signature validation
  (`dial-status/route.ts:31-40`) — no new unauthenticated surface.
- No new PII; segments store label strings + numeric bands only.

## Reuse map (no duplication)

| Need | Reuse |
|---|---|
| Audience → SQL | extend `sprintAudienceConditions` (`call-sprint.ts:47`) |
| Honest counts | extend `countSprintAudience` (`call-sprint.ts:277`) |
| Phrase → labels | `resolveSprintAudience` (`call-sprint.ts:189`) |
| Verbatim validation | `validateSprintLabels` (`call-sprint.ts:211`) |
| Set active audience + regen | `updateCallCampaign({audience})` + `generateDailyCallList` |
| Daily list, gates, cadence | unchanged (`campaign.ts`) |
| Enrichment wave for empty list | `listSprintContactsMissingPhone` (`call-sprint.ts:244`) |
| Selector persistence | localStorage pattern (`page.tsx:109`) |
