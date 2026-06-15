# Call Lists — Office Hours

The "lists" chantier for Call Mode. Scope: turn the single implicit call queue
into **multiple named, selectable lists** in the "To call now" column, on two
axes the rep asked for — **by day** (the photo that evolves each morning from
yesterday's calls) and **by sector** (persisted segments) — and make the
time-evolution visible and complete. Out of scope (noted seams): per-list quota
engines, learned connect-rate sorting, a teams/round-robin model.

## Problem statement (one sentence)

A rep in Call Mode has no control over *which* prospects "To call now" shows or
in what order — there is one implicit list (the active campaign's daily top-up
ranked by score, `campaign/route.ts:80 todayQueue`), the only sector targeting
(the sprint) is writable **exclusively from chat** and rendered read-only
(`page.tsx:901`, comment line 907 "set via chat"), and the day-to-day evolution
the rep expects (yesterday's no-answers return, answered/dead numbers don't) is
real in the engine but invisible and partly missing.

## Premise challenge: build a new engine, or expose what already exists?

The instinct is to design a fresh "list engine". We reject that on a verified
fact: **~70% of the temporal behaviour already exists and is tested.**

- NRP pushed up to 8×/15 days IS the current default cadence: `maxAttempts=8`,
  `windowDays=15` (`campaign.ts:184-185`), spaced by `retryGapMs` (line 146),
  rescheduled in `recordCallOutcomeForCampaigns` (line 561-568).
- Answered/booked exit the list: `connected` / `meeting_booked` are terminal
  (`campaign.ts:41-42`).
- No-phone is never listed (`campaign.ts:380`), DNC + quiet-hours + role-obsolete
  + territory-exclusivity all already gate (`queue.ts:85,96,118,131,139`).

So the work is mostly **exposure** + **generalising the sprint from 1 → N named
lists**, not a new engine. There is exactly **one genuinely new server
capability**: auto-classifying the prospect leg's terminal Twilio status. Today
`dial-status` only reacts to `answered` and `completed` (`dial-status/route.ts:57,67`)
— it ignores `failed`/`no-answer`/`busy`/`canceled` and the SIP/error code, so a
**dead ("non attribué") number is not detected and returns the next day**. The
only `wrong_number` path is a manual disposition (`campaign.ts:44`).

This framing keeps the change a "lake" (reuse primitives) rather than an "ocean".

## Alternatives considered

### A1. New list engine vs expose + generalise the existing one
- New engine. REJECTED — duplicates the cadence/top-up/gate machine that is
  already correct and tested; two engines drift.
- Expose the existing daily-list machine + lift the sprint from 1 → N named,
  selectable lists. CHOSEN. Reuses `generateDailyCallList`, the gates, the
  cadence; adds storage for N list definitions + a selector + (new) dead-number
  classification.

### A2. List model — one global objective vs one campaign per list [DECISION OPEN]
- **A2a — One global objective + named lists, alternated.** One campaign per rep
  (the global quota + cadence, unchanged); a "sector list" is a named segment the
  rep picks in "To call now". The picked list sets the daily top-up audience
  (generalised `sprintAudienceConditions`) and filters the visible queue. Cadence
  lives **per contact**, so an answered contact leaves every list, an NRP returns
  regardless of which list dialled it, a dead number disappears everywhere.
  RECOMMENDED — reuses the whole engine (one quota, one cadence), matches
  "customizable but very simple" + "reuse existing primitives"; fits a
  solo-founder ("1000 calls this week"). Limit: no independent per-sector quota.
- **A2b — One campaign per list.** Each sector list is its own campaign with its
  own quota/cadence/funnel, several active in parallel. More powerful (e.g. 200
  EMS/day AND 50 federations/day simultaneously) but: territory exclusivity today
  excludes a contact already in ANY active campaign of the tenant — NOT scoped by
  owner (`campaign.ts:381-385`) — so the rep's EMS list would steal contacts from
  their own federations list; `getActiveCampaign` returns a single row
  (`campaign/route.ts:62`). Needs the exclusivity + "active campaign" notions
  reworked. Heavier; over-built for one founder-seller.
- **Decision to confirm with Martin before BUILD.** The catalogue, the temporal
  rules, the dead-number detection and the gates (R4–R7) are identical under both
  models; only the storage + quota wiring (R1, design D0) differ.

### A3. Dead ("non attribué") number — manual only vs auto-classify
- Keep manual `wrong_number` disposition only. REJECTED — the rep explicitly
  wants dead numbers gone from the next day automatically; a human won't tag every
  one.
- Auto-classify in `dial-status` from `CallStatus` + `ErrorCode`/`SipResponseCode`
  and feed a terminal outcome. CHOSEN. Distinguish dead (failed + unallocated/
  unobtainable code → terminal, drop forever) from NRP (`no-answer`/`busy` →
  reschedule). Exact Twilio codes confirmed against live docs at build time (do
  not invent — use Context7/Twilio docs).

### A4. List-definition storage — targetFilter.lists[] vs a new call_lists table
- Embed `lists[]` in `callCampaigns.targetFilter` (jsonb already read by
  `readSprintAudience`). PRO: no migration, mirrors today's `targetFilter.audience`.
  CON: array-in-jsonb edits are clumsy and unindexed.
- New `call_lists` table (id, campaignId/tenantId, name, kind, segment jsonb,
  sort, createdAt). PRO: clean per-list rows, future per-list stats, indexable.
  CON: one migration. LEANING table for N≥2 lists; final call in design D0
  alongside A2.

### A5. System "by-day" lists — stored vs derived
- Store a row per system list. REJECTED — "Callbacks due today" / "New to call" /
  "Today" are pure projections of `callCampaignTargets.status` + `listedOn` +
  `nextAttemptAt`. Derive them in the query; never persist. CHOSEN.

## Completeness target

9/10. Covered: a list selector in "To call now"; system by-day lists (callbacks
due / new / today) derived from target state; N persisted sector lists with the
full segmentation catalogue (R4) and sort options (R5); the sprint becomes
editable in-UI (it stops being chat-only); the temporal evolution made visible
AND completed with auto dead-number detection (R6); all existing gates preserved
on every list (R7). Edge cases enumerated in requirements (empty list, contact
matching two lists, dead-number false positive, quota split across lists,
list deleted mid-day, territory exclusivity under multi-list). Not covered
(intentional seams): independent per-list quota engine (only under A2b), learned
connect-probability sort (R5 seam), teams/round-robin assignment.
