# Pilae machine — operational runbook

> Companion to `spec-v2.md`. Spec describes WHAT shipped; this runbook
> describes how to USE it day-to-day and how to debug it when something
> goes sideways.
> Last updated 2026-05-29 (after PRs #33, #34, #35, #36, #37, #38, #39, #40, #41).

## 1. Bring up a new Pilae-like tenant

Use the seed script — idempotent, edits the placeholder ICP via DB
later (or via the future admin UI):

```bash
tsx --env-file=.env.local scripts/seed-pilae-tenant.ts
```

The script creates `tenants.id='pilae'` with `locale='fr-fr'`,
`deepDiveWeeklyCap=2`, an `icp` placeholder (4 verticales / 3 persona
buckets / anti-ICP list / extended signal taxonomy for NIS2 / DORA /
HDS), and `approvalMode='manual'`. Re-running surfaces existing
settings keys instead of inserting twice.

After the seed:

```sql
-- Refine the ICP to match your real GTM list (verticales / personas /
-- anti-ICP) — edit any time, no code change needed
UPDATE tenants
SET settings = jsonb_set(
  settings, '{icp,verticales}',
  '["actual_vertical_1","actual_vertical_2"]'::jsonb
)
WHERE id = 'pilae';
```

Then via the UI:

1. Connect mailbox: `/settings/sending-infrastructure`
2. Connect Unipile (once LinkedIn S1 merges): `/settings/linkedin`
3. Seed 250-400 TAM companies via Apollo (Settings → ICP → Build TAM)
4. Create the first sequence (e.g. "Founder classic FR" 4-touche) via
   `/sequences` and enrol the first cohort

After step 1 the dashboard at `/insights/pilae` starts polling and
will render once any data lands. The cron jobs (§4) pick up the new
tenant automatically — no per-tenant registration needed.

## 2. Daily founder flow

1. **Morning** — open `/sequences/review`. The action bar (B5b) shows
   the bulk-approve count when entries are selected. Approve in a
   single 1-clic batch (atomic; if any draft can't transition the
   whole batch rolls back with a 409 listing failures).
2. **Mid-morning** — open `/insights/pilae`. Three panels: Bookings
   vs 1 M€ (R11.3 — never blended), Funnel by stage, Deep-dive
   capacity (Paul's goulot).
3. **After every call/meeting** — the `coaching/post-interaction`
   event fires. Two consumers run in parallel:
   - The existing coaching engine produces an insight card.
   - The B4-extractor LLM produces objection / accroche / question
     candidates → validated → inserted into `playbook_entries`.
   Visit `/insights/playbook` to review. Manual "Add entry" is
   always available.
4. **Booking a deep-dive** — POST `/api/meetings/book` with
   `meetingType: "deep_dive"`. The endpoint counts this week's
   deep-dives and returns 409 if Paul is at his cap. Pass
   `override: true` to force-book — the dashboard badge keeps
   showing saturation.

## 3. The 4 migrations on prod

The custom runner is `scripts/apply-migrations.ts` (NOT drizzle-kit's
journal — see the header comment in that file for why). Apply in
order, all are additive + idempotent:

| File | What |
|---|---|
| `0051_anti_icp_exclusion.sql` | `companies.excluded_reason`, `excluded_at` + index |
| `0052_deal_split.sql` | `deals.project_amount`, `platform_arr` |
| `0053_priority_score.sql` | `companies.priority_score`, `priority_score_computed_at` + index |
| `0054_playbook_entries.sql` | new table + 3 indexes |

Run on staging first, eyeball `EXPLAIN` on a 10k-row companies table
to confirm the new indexes serve the right queries. The `signal.score.daily`
cron will hammer the priority index every morning.

## 4. The 7 Inngest fns shipped

| Function | Trigger | What |
|---|---|---|
| `signalAccelerateCadence` | event `signals/fresh-detected` | Bumps `sequenceEnrollments.nextStepAt` to NOW for active enrollments at the company. Producer wired in `signal-monitor.ts` (B3b). Threshold: signal multiplier ≥ 1.5×, freshness ≤ 24h. |
| `signalScoreDaily` | cron `0 6 * * *` UTC | Recomputes `companies.priority_score` per eligible (non-excluded) company. Formula: `bestSignalMultiplier × fitScore × accessibility`. Batched 500-at-a-time via SQL `CASE WHEN`. |
| `nurtureRecycleD30` | cron `0 7 * * *` UTC | Re-enrols `completed`-status contacts whose `lastStepAt > 30d` ago into the tenant's nurture sequence (case-insensitive name match `nurture*`). Skips contacts already in nurture (no loop). |
| `meetingCapacityCheck` | cron `30 0 * * 1` UTC (Mon) | Counts deep-dive activities this ISO week per tenant, persists `tenants.settings.deepDiveLoad` for the dashboard badge. |
| `playbookCapturePostCall` | event `playbook/capture-from-activity` | Validates candidates via `validatePlaybookBatch` and inserts survivors into `playbook_entries`. Sink — security boundary. |
| `playbookExtractFromActivity` | event `coaching/post-interaction` | Loads activity, calls Claude with `extractionResponseSchema`, emits to the sink. Falls back to gpt-4o-mini when no Anthropic key. |
| `sequenceDraftToOutbound` | event `email.send.queued` | Bridge: translates an approved `sequence_drafts` row into an `outbound_emails` row (status=queued) so the existing `processOutboundEmails` cron sends it. Closes the loop on the single + bulk approve flow (PR #37). Channel-aware via `sequenceSteps.stepType` since PR #41 — also dispatches phone_task drafts via `phone/task-queued` event (consumer ships with feat/voice-cold-call). |
| `visitorPhoneEnrichRequest` | cron `*/5 * * * *` | Stub: scans the last 15 min of identified visits, emits `phone/enrich-requested` for phone-less contacts at the resolved company. Consumer (Apollo→Kaspr→Lusha waterfall) ships with feat/voice-cold-call. |

Check the Inngest dashboard at `/api/inngest` — each fn shows last 100
runs with their return shape.

## 5. Garde-fous (tests that fail loudly)

| File | Catches |
|---|---|
| `__tests__/anti-creep-pilae.test.ts` | Hard-coded `Pilae` / `pilae` in `lib/ai/` or `lib/sequences/`. Per-line exception for spec citations (`_specs/pilae-machine/...`). |
| `__tests__/anti-arr-dashboard.test.ts` | Headline ARR constructs (`$1.2M ARR`, "Annual Recurring", "Total ARR") in the dashboard files. "Platform ARR" stays valid as a sub-category field name. |
| `__tests__/deal-amount.test.ts` | The deal-split helper never blends `projectAmount + platformArr` into `value`. Explicit anti-blending case. |
| `__tests__/priority-score.test.ts` | Kairos accelerator boundaries (1.5× threshold, 24h freshness, stop-on-reply override). |
| `__tests__/capacity.test.ts` | All booking-decision boundaries (under cap / at cap / cap=0 paused / override). |
| `__tests__/enrollment-eligibility.test.ts` | Anti-ICP exclusion: priority order of rejection reasons (deleted → no_email → excluded_company). |
| `__tests__/bulk-approve-helpers.test.ts` | Batch atomicity: "9 valid + 1 sent → whole batch fails". |

Run before any release: `npm test`.

## 6. Known gaps + follow-ups

| Item | Why it's a gap | When/how to close |
|---|---|---|
| Tenant config admin UI | Seeding works via `scripts/seed-pilae-tenant.ts` (PR #41), but settings edits still need SQL. | A `/settings/tenant-config` page that edits `tenants.settings` — substantial, ~3 days. |
| `phone_task` CONSUMER (Twilio dialer) | Producer ships in PR #41 — `sequenceDraftToOutbound` emits `phone/task-queued` with draft snapshot + contact phone + script body. Consumer (actual Twilio + Deepgram dial) lives on `feat/voice-cold-call`. | Drop-in: subscribe to `phone/task-queued` on that branch. |
| ICP scorer feeding `companies.score` | The priority score formula uses `fitScore = companies.score`. If the score isn't populated the formula falls back to `NEUTRAL_FIT_SCORE = 0.5`. Acceptable but lossy. | The existing scoring infra (`lib/scoring/`) populates it for some tenants; a Pilae-specific scorer or a manual import via the TAM builder is needed for full signal. |

## 7. Rolling back

Each gap shipped in its own commit on PR #33 (squash-merged as
`6352d358`). To revert a specific gap, prefer touching the migration
+ helper rather than the squash commit:

- B1 anti-ICP — drop columns + revert `enrollment-eligibility.ts`. The
  leftJoin in `enroll/route.ts` stays harmless without the column.
- B2 deal split — drop the two columns; `getDealAmountDisplay` falls
  back to legacy `value` automatically. UI still renders.
- B3 priority score — drop the columns + un-register the cron.
- B4 playbook — drop the table + un-register the two Inngest fns.
- B5 batch approve — un-deploy the route file. Single-draft approve
  still works.
- B6 nurture recycle — un-register the cron. No data side-effect
  beyond the freshly-recycled enrollments.
- B7 capacity — un-register the cron + revert `/api/meetings/book`
  schema additions. Existing bookings tagged with `meetingType` keep
  their metadata; new ones become untagged again.

The 4 migrations are pure additive — leaving the columns/table in
place after a code rollback is safe.
