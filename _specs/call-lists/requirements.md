# Call Lists — Requirements

Give the rep control over **which** prospects "To call now" shows and **in what
order**, as multiple named, selectable lists on two axes — **by day** (system,
derived, evolving each morning) and **by sector** (persisted segments) — while
reusing the existing daily-list + cadence engine and preserving every gate.
Deterministic where it counts; the LLM appears only to translate a free-text
sector/persona phrase into stored labels (already the sprint pattern).

Tags: [NEW] real gap, code required · [DONE] already shipped, reuse ·
[~] present but not exploited for lists · [CFG] tenant/plan config ·
[LOCKED] decision, do not reopen · [OPEN] decision to confirm before build ·
[SEAM] documented future extension.

## Ground-truth anchors (verified 2026-06-15)

- [DONE] Daily list = retries due + fresh top-up capped at `dailyQuota`,
  idempotent per day via `listedOn` (`campaign.ts:306 generateDailyCallList`,
  retries 340, top-up 373).
- [DONE] Cadence state machine: `meeting_booked`→converted, `connected`→connected,
  `not_interested`/`do_not_call`→dnc, `wrong_number`→exhausted,
  `no_answer`/`busy`/`voicemail_left`/`gatekeeper`/`failed`→retry up to
  `maxAttempts` over `windowDays` (`campaign.ts:41-46,512-590`).
- [DONE] Defaults `maxAttempts=8`, `windowDays=15` (`campaign.ts:184-185`;
  mirrored in the plan form `_call-plan-form.ts:26`) = the rep's "8 over 15 days".
- [DONE] Gates: phone required (`campaign.ts:380`), DNC (`queue.ts:118`,
  `campaign.ts:386`), quiet hours (`queue.ts:138` + re-checked at dial
  `start/route.ts`), not-deleted, role-obsolete dropped (`queue.ts:131`,
  `getTodaysCallList` `campaign.ts:469`), territory exclusivity — contact not in
  ANY active campaign of the tenant (`campaign.ts:381-385`; `queue.ts:96` adds
  the cross-rep variant scoped by `owner_id <>`).
- [DONE] Sort: `buildQueue` composite = intent × accessibility × dealValue
  (`queue.ts:153,179`); `getTodaysCallList` ranks by `contacts.score` desc
  (`campaign.ts:494`); retries oldest-`nextAttemptAt` first (line 351).
- [DONE] Sprint audience = industries × personas stored in
  `callCampaigns.targetFilter.audience`, honoured by the top-up only
  (`call-sprint.ts:47 sprintAudienceConditions`, `campaign.ts:387`); honest
  counts share the same conditions (`call-sprint.ts:277 countSprintAudience`).
- [LOCKED] The sprint is writable ONLY from chat (`applyCallSprint`
  `chat/tools/calls.ts:152` → `updateCallCampaign({audience})`); neither
  onboarding POST nor "Edit plan" PATCH carry `audience` (`campaign/route.ts`
  bodies). The cockpit chip is read-only (`page.tsx:901`).
- [NEW-anchor] `dial-status` reacts only to `answered`/`completed`
  (`dial-status/route.ts:57,67`) — terminal failure statuses + SIP/error code
  are not read, so dead numbers are not auto-detected.
- [~] Only filter today is "All"/"High intent" (`intentScore≥0.7`)
  (`page.tsx:269,466,987`). Tri is fixed (score).
- [LOCKED] Label resolution must validate verbatim against stored labels — no
  hardcoded synonym lists (matchIndustries pattern, `call-sprint.ts:14-18`).
- [LOCKED] UI in French/English per surface convention; no emojis (icons via
  lucide-react); no provider names; money/exec actions stay role-gated.

## Non-goals (THE SYSTEM SHALL NOT)

- R0.1 THE SYSTEM SHALL NOT remove or weaken any existing gate (phone, DNC,
  quiet hours, role-obsolete, deleted, territory exclusivity); lists FILTER and
  ORDER within already-gated candidates, never bypass a gate. [LOCKED]
- R0.2 THE SYSTEM SHALL NOT abandon an in-cadence retry because the rep changed
  the active list; a started cadence keeps its committed schedule
  (`campaign.ts:321` invariant preserved). [LOCKED]
- R0.3 THE SYSTEM SHALL NOT invent segment labels; every industry/persona used
  in a list definition SHALL exist verbatim in the tenant's stored data /
  persona vocabulary (`validateSprintLabels` `call-sprint.ts:211`). [LOCKED]
- R0.4 THE SYSTEM SHALL NOT introduce an independent per-list quota/cadence
  engine in this slice (only relevant under model A2b). [SEAM]
- R0.5 THE SYSTEM SHALL NOT classify a number as dead from a single ambiguous
  status; dead-number detection SHALL use explicit unallocated/unobtainable
  codes, and a no-answer/busy SHALL remain an NRP retry, not a death. [LOCKED]

---

## R1 — List model + storage [NEW][OPEN]

User story: As a rep, I want to keep several named lists (per sector) and pick
which one I work in "To call now", so my list isn't a single fixed queue.

- R1.1 THE SYSTEM SHALL represent a *sector list* as a named definition
  `{ id, name, kind:"sector", segment, sort }` where `segment` is the R4
  parameter set and `sort` is one R5 key, persisted per rep's campaign. [NEW]
- R1.2 THE SYSTEM SHALL persist sector-list definitions either in
  `callCampaigns.targetFilter.lists[]` (no migration) or a new `call_lists`
  table; the choice is fixed in design D0 with A2/A4. [OPEN]
- R1.3 THE SYSTEM SHALL keep exactly one "global objective + cadence" per rep
  (today's campaign) under the recommended model A2a; sector lists SHALL NOT each
  carry their own quota unless A2b is chosen. [OPEN]
- R1.4 WHEN no sector list is defined, THE SYSTEM SHALL behave exactly as today
  (whole ICP ranked by fit), so the feature is additive and the empty state is
  the current behaviour. [NEW]
- R1.5 THE SYSTEM SHALL let the rep create, rename, edit (segment + sort), and
  delete a sector list; deleting the active list SHALL fall back to "Today"
  (R2) without error. [NEW]

## R2 — System "by-day" lists (derived, evolving) [NEW]

User story: As a rep, each morning I want to see the list shaped by yesterday's
calls — callbacks due, fresh prospects, and the combined day — without managing
anything.

- R2.1 THE SYSTEM SHALL offer, always and without persistence, three derived
  system lists computed from `callCampaignTargets` state: **"Callbacks due"**
  (`status='queued'` AND `nextAttemptAt<=now`, i.e. NRP/callbacks from prior
  days), **"New to call"** (listed today with `attemptCount=0`), and **"Today"**
  (the union currently shown). [NEW]
- R2.2 THE SYSTEM SHALL derive these from target state at read time (no stored
  rows, A5) so they reflect the latest dispositions. [NEW]
- R2.3 WHERE the cron has regenerated the day's list (`call-campaign-cron.ts`),
  THE SYSTEM SHALL show yesterday's unreturned no-answers under "Callbacks due"
  on their `nextAttemptAt` day and fresh top-up under "New to call". [NEW]
- R2.4 THE SYSTEM SHALL show each list's live count next to its name, computed
  with the SAME conditions used to build it (honest counts, the
  `countSprintAudience` rule `call-sprint.ts:277`). [NEW]

## R3 — List selector in "To call now" [NEW]

User story: As a rep, I want a selector at the top of "To call now" to switch
between my lists, so I choose who I dial today.

- R3.1 THE SYSTEM SHALL replace the static "To call now" header
  (`page.tsx:981`) with a selector listing the system lists (R2) then the rep's
  sector lists (R1), each with its live count (R2.4). [NEW]
- R3.2 WHEN the rep selects a list, THE SYSTEM SHALL re-render the queue to that
  list's members in that list's sort order, and SHALL select the first item. [NEW]
- R3.3 THE SYSTEM SHALL persist the last-selected list per rep (localStorage,
  mirroring `FROM_NUMBER_STORAGE_KEY` `page.tsx:109`) so it sticks across
  sessions, defaulting to "Today" when unset or stale. [NEW]
- R3.4 WHERE a sector list is selected, THE SYSTEM SHALL set that list's segment
  as the campaign's active top-up audience so the NEXT daily generation draws
  fresh prospects from it (generalised `updateCallCampaign({audience})`
  `campaign.ts:235`), while in-cadence retries keep their schedule (R0.2). [NEW]
- R3.5 THE SYSTEM SHALL make the existing read-only sprint chip
  (`page.tsx:901`) obsolete by folding sprint editing into the selector — the
  sprint stops being chat-only (lifts the [LOCKED] anchor). The chat
  `proposeCallSprint`/`applyCallSprint` path SHALL keep working (parity). [NEW]
- R3.6 WHILE a call is live, THE SYSTEM SHALL keep the selector collapsed (the
  cockpit already collapses the queue in-call, `page.tsx:968`). [NEW]

## R4 — Segmentation catalogue (define WHICH prospects) [NEW]

User story: As a rep, I want to define a sector list by the attributes that
matter, so the list targets exactly the prospects I mean.

THE SYSTEM SHALL support, as the `segment` of a sector list, any combination of
the following parameters, each resolved over STORED columns (never free text at
query time) and AND-combined:

- R4.1 Industry / sector — match `companies.industry` verbatim via
  `matchIndustries` (`call-sprint.ts:193`). [DONE-engine, expose]
- R4.2 Persona / function — `contacts.properties.title_personas.p`
  (`call-sprint.ts:64-72`). [DONE-engine, expose]
- R4.3 Seniority tier — exec/lead/mgmt/team from the stored title palier. [~][NEW]
- R4.4 Buying signal — `contacts.properties.latestSignal.type` (funding,
  hiring, replaceable-tech, expansion), gated on signal freshness
  (`lib/signals/freshness.ts`). [~][NEW]
- R4.5 Account stage — new/nurture/opportunity/customer
  (`lib/accounts/lifecycle-stage.ts`). [NEW]
- R4.6 Open deal + value band — presence/size of a linked deal (`deals.value`,
  already joined `queue.ts:81`). [~][NEW]
- R4.7 Geography — canton/country/timezone (`lib/call-mode/geo.ts`). [~][NEW]
- R4.8 Company size (headcount) — `companies.properties`. [NEW]
- R4.9 Replaceable tech detected — `lib/tech-detect/replaceable`. [~][NEW]
- R4.10 Source — Elevay-sourced / CSV / manual (`contacts.properties.source`),
  surfaced without provider names. [NEW]
- R4.11 Owner — mine / unassigned / teammate (`contacts.ownerId`). [~][NEW]
- R4.12 Sourcing freshness — `contacts.lastEnrichedAt` band. [~][NEW]
- R4.13 ICP fit score — threshold/band on `contacts.score` (beyond today's
  binary "high intent"). [~][NEW]
- R4.14 Phone type — mobile/direct/switchboard (`properties.phoneType`
  `queue.ts:143`). [~][NEW]
- R4.15 Cadence status — new / callback-due / NRP-in-progress / exhausted
  (`callCampaignTargets.status` + `attemptCount`). [DONE-engine, expose]
- R4.16 THE SYSTEM SHALL resolve a free-text sector/persona phrase into R4.1/R4.2
  labels via the existing two-step LLM (`parseSprintFacets` +
  `resolvePersonaLabels`, `call-sprint.ts:94,130`), fail-closed, validated
  verbatim; an unresolved facet is simply absent (never invented, R0.3). [DONE]
- R4.17 THE SYSTEM SHALL compute a sector list's honest counts (total / with
  phone / callable) with the same conditions used to build it, extending
  `countSprintAudience` to the new parameters. [NEW]

## R5 — Sort catalogue (order WITHIN a list) [NEW]

User story: As a rep, I want to choose the order of a list, so I dial the right
prospects first.

THE SYSTEM SHALL support these sort keys per list (default = ICP fit):

- R5.1 ICP fit score (`contacts.score` desc) — today's default. [DONE]
- R5.2 Signal freshness / intent (`intentScore`, `queue.ts:141`). [DONE-engine]
- R5.3 Accessibility (phone type weight, `queue.ts:142-149`). [DONE-engine]
- R5.4 Linked deal value (`queue.ts:150-152`). [DONE-engine]
- R5.5 Oldest callback first (`nextAttemptAt` asc) — the natural order for
  "Callbacks due" (`campaign.ts:351`). [DONE-engine]
- R5.6 Local-time window — rank contacts for whom it is currently a good local
  hour to call (beyond the quiet-hours exclude, `queue.ts:138`). [~][NEW]
- R5.7 Fewest attempts first (`attemptCount` asc). [~][NEW]
- R5.8 Learned connect probability (tenant's real connect rates). [SEAM]
- R5.9 THE SYSTEM SHALL keep the composite score (`queue.ts:153`) available as
  the "smart default" and SHALL apply the chosen key deterministically. [NEW]

## R6 — Temporal evolution (the list of J+1 derived from J) [NEW + DONE]

User story: As a rep, I want the list to evolve automatically — answered/dead
out, no-answers back up to 8×/15d — so I never re-dial the wrong people.

- R6.1 THE SYSTEM SHALL keep answered/booked/uninterested contacts out of future
  lists via the existing terminal outcomes (`connected`/`converted`/`dnc`,
  `campaign.ts:549-555`). [DONE]
- R6.2 THE SYSTEM SHALL reschedule a no-answer/busy/voicemail/gatekeeper/failed
  up to `maxAttempts` over `windowDays` (the rep's 8×/15d), then mark exhausted
  (`campaign.ts:561-569`). [DONE]
- R6.3 WHEN the prospect leg ends with a terminal failure indicating an
  unallocated/unobtainable number, THE SYSTEM SHALL classify it as a DEAD number
  and mark the target terminally (exhausted/`invalid_number`) so it NEVER returns
  to a future list. [NEW]
- R6.4 THE SYSTEM SHALL detect R6.3 server-side from `dial-status` by reading
  `CallStatus` ∈ {failed, busy, no-answer, canceled} together with
  `ErrorCode`/`SipResponseCode`, classifying ONLY explicit unallocated/
  unobtainable codes as dead and feeding the result into
  `recordCallOutcomeForCampaigns` (`dial-status/route.ts` currently stops at
  `answered`/`completed`, lines 57/67). [NEW]
- R6.5 IF the status is no-answer/busy WITHOUT a dead code, THEN THE SYSTEM SHALL
  treat it as an NRP retry (R6.2), NEVER as dead (R0.5). [NEW]
- R6.6 THE SYSTEM SHALL surface dead-number removals honestly (e.g. the contact's
  phone marked unverified / the row leaving the list with a reason), not silently.
  [NEW]
- R6.7 THE SYSTEM SHALL confirm exact Twilio status/error/SIP codes against live
  Twilio docs at build time (Context7) and SHALL NOT hardcode guessed codes. [NEW]

## R7 — Gates apply to every list [DONE]

- R7.1 THE SYSTEM SHALL apply phone-required, DNC, quiet-hours, role-obsolete,
  not-deleted, and territory-exclusivity to EVERY list (system and sector),
  reusing the existing conditions (`queue.ts`/`campaign.ts` anchors above);
  list segment/sort narrows and orders WITHIN this gated set. [DONE]
- R7.2 WHERE a contact matches two of the rep's sector lists, THE SYSTEM SHALL
  show it in both (lists are views) but the contact has ONE cadence target, so a
  disposition in one list updates its state for all (R6.1). [NEW]
- R7.3 WHERE territory exclusivity is evaluated under multiple lists owned by the
  same rep, THE SYSTEM SHALL NOT let one of the rep's own lists hide a contact
  from another of the rep's lists (only OTHER reps' active work excludes); this
  is the wrinkle A2b must solve and A2a avoids (one campaign). [OPEN]

### Edge cases

- R8.1 WHEN a sector list resolves to zero callable contacts, THE SYSTEM SHALL
  show an honest empty state with the counts (R4.17) and offer the existing
  enrichment wave for that audience (`listSprintContactsMissingPhone`
  `call-sprint.ts:244`), not a blank screen. [NEW]
- R8.2 WHEN the daily quota is smaller than the sum a rep might want across
  sector lists, THE SYSTEM SHALL (A2a) fill the quota from the ACTIVE list's
  audience only; switching lists changes tomorrow's top-up, not the global quota.
  [OPEN-confirm]
- R8.3 WHEN a list is deleted mid-day, THE SYSTEM SHALL keep already-listed
  targets in cadence (they are contacts, not list members) and only remove the
  view (R1.5). [NEW]
- R8.4 IF the dead-number classifier is uncertain (no recognised code), THEN THE
  SYSTEM SHALL default to NRP (R6.5), favouring a wasted retry over wrongly
  killing a good contact. [LOCKED]
- R8.5 WHEN a contact's role is later flagged obsolete, THE SYSTEM SHALL drop it
  from every list via the existing role-obsolete gate (R7.1). [DONE]

## Evaluation steps

1. With no sector list defined, open Call Mode → "To call now" behaves exactly as
   today; the selector shows only the system lists "Today / Callbacks due / New to
   call" with correct counts (R1.4, R2.1, R2.4).
2. Create a sector list "EMS romands — DG/DAF" from a phrase → labels resolve
   verbatim, honest counts show total/with-phone/callable (R4.16, R4.17); an
   unmatched word is dropped (R0.3).
3. Select it → queue re-renders to that segment in the chosen sort; first item
   selected (R3.2); reload → same list still selected (R3.3).
4. Run the morning cron (or invoke generation) the next day → yesterday's
   no-answers appear under "Callbacks due" on their due day; fresh prospects from
   the active list's audience appear under "New to call" (R2.3, R3.4).
5. Disposition a contact `connected` → it leaves all lists; `no_answer` →
   it reappears under "Callbacks due" at its next attempt, up to 8×/15d then
   exhausted (R6.1, R6.2).
6. Place a call to a known-dead number (or inject `CallStatus=failed` +
   unallocated code on `dial-status`) → target marked terminal, contact does NOT
   return the next day (R6.3, R6.4); inject `no-answer` with no dead code → it
   DOES return as NRP (R6.5).
7. Put a contact in two sector lists → shown in both; dispose it in one → state
   updates for both (R7.2).
8. Define a sector list with zero callable contacts → honest empty state + offer
   the enrichment wave, no blank screen (R8.1).
9. Confirm every list still excludes DNC, quiet-hours, role-obsolete, no-phone,
   and other reps' active contacts (R7.1).
