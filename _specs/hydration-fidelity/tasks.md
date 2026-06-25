# Hydration Fidelity — Tasks (Kiro)

Order: P0 (broken/unwired) first — cleanest & most confirmed first — then the H2→H1
per-page pass in spine order. Each task: code → test → verify → commit.

Branch: `feat/hydration-fidelity` (from main). R1 already shipped separately on
`fix/deliverability-tenant-leak` (305cf5a2).

## P0

- [x] **T1 (R1) deliverability tenant leak** — DONE (`fix/deliverability-tenant-leak`,
  305cf5a2). Regression in `deliverability-api.test.ts`, 5/5 green.

- [x] **T2 (R7) notifications Slack webhook hydration** — DONE (`7dad288c`, ancestor
  of HEAD; checkbox was stale). `api/notifications/preferences/route.ts` GET now
  returns `slackWebhook` from `tenants.settings.slackWebhookUrl` on BOTH branches
  (defaults + persisted), with a documenting comment. The page reads `data.slackWebhook`
  → `slackConnected` (notifications/page.tsx:68,163), so the webhook input + "Connected"
  badge round-trip on reload. Confirmed live in code 2026-06-25.

- [x] **T3 (R2) account contacts** — DONE (`feat/hydration-fidelity`).
  - Code: `api/contacts/route.ts` GET now honors `?companyId` (direct
    `contacts.companyId` column; mirrors `accounts/[id]/route.ts:65`). The account
    page already calls `/api/contacts?companyId=<id>`, so it now shows the right set.
  - Test: `route-companyid.test.ts` — companyId present → `eq(contacts.companyId)`
    wired; absent → no companyId filter. 2/2 green.
  - Verify (live, deferred): open an account with known contacts → count + rows match.

- [x] **T4 (R6) pricing current plan** — DONE. `pricing/page.tsx` fetches
  `/api/billing/subscription` on mount and drives each tier's button via
  `tierState()` (lib/billing/pricing-tier.ts): the matching tier shows
  "Current Plan" (disabled), strictly-lower tiers "Included" (owned, disabled),
  higher tiers keep their upgrade CTA. Unknown plan (loading/failed) → no current
  marker. Removed the hardcoded `cta:"Current Plan"` on Free Trial.
  - Test: `pricing-tier.test.ts` — key mapping, ordering, current/owned/upgrade,
    unknown-plan safety. 7/7 green. Page logic lives in a lib (no page named
    exports — nextjs-page-export-build-gap). Verify (live, deferred).

- [x] **T5 (R4) skills registry warm** — DONE. `api/settings/skills/route.ts`
  now calls `registerAllSkills()` at module load (mirrors /api/skills/[slug]).
  NOTE: the audit's secondary "thin detail / map steps/guidelines" claim was a
  misread — `SkillDefinition` (skills/types.ts) has NO steps/constraints/params/
  guidelines (those are custom-skill-only DB fields), so `hasSteps:false` is
  correct for code-defined system skills. The real defect was the empty registry.
  - Test: `route-registry-warm.test.ts` — registry warmed at load + system skills
    present in payload. 2/2 green.

- [x] **T6 (R5) cs-today ARR exposure** — DONE. `cs-health-cron.ts` now computes
  `arrExposureUsd` per account (`computeAccountArrExposure`: sum of OPEN deals'
  `platformArr ?? value`; one-time projectAmount excluded — not ARR) and writes it
  in the snapshot insert. Header copy left as-is: "risk × ARR" is now truthful for
  accounts that have ARR; accounts with no open deals get null → badge self-hides
  and the tie-break skips them (route already handles null).
  - Test: `cs-health-arr.test.ts` — null when no deals; sums platformArr; legacy
    value fallback; null when sum is 0. 4/4 green.

- [x] **T7 (R3) opportunity deal split** — DONE. Storage confirmed: projectAmount/
  platformArr are real `deals` columns (core.ts:266-267); the route did `select()`
  (all columns) but omitted them from the response. Added both to the `deal`
  payload so getDealAmountDisplay computes the real split.
  - Test: `route-split.test.ts` — GET returns projectAmount/platformArr. 1/1 green.

- [x] **T8 (R8) billing mailboxes meter** — DONE. `/api/billing/usage` now returns
  a tenant-scoped `mailboxCount` (tolerant of a missing table); the meter reads
  `usage?.mailboxCount ?? 0` instead of a hardcoded 0. (Page still dev-only.)
  - Test: `usage-mailbox-count.test.ts` — count surfaced, not 0. 1/1 green.

**All P0 (R1–R8) shipped.** R1 on `fix/deliverability-tenant-leak`; R2–R8 on
`feat/hydration-fidelity`. None merged.

## P1 — H2 → H1 per-lane degradation (spine order)

One task per page; scope = each page's "Pires défauts" in `_reports/hydration-audit/`.
Order: 02 chat · 03 inbox · 06 account-brain · 07 contacts · 08 contact-detail ·
09 contacts-merge · 10 opportunities · 12 sequences · 13 sequence-detail ·
16 meetings · 17 meeting-detail · 19 tasks · 20 call-mode · 23 reports · 24 insights ·
26 insights-pilae · 27 insights-playbook · 30 notes · 31 graph · 32 voice-of-customer ·
35 tam-review · then T2 H2 settings pages.

Common change per page: swallowed `console.warn` fetch failures → per-lane written
error+retry; global spinner → shape-matching skeleton where a lane loads alone.

### P1 progress (spine order)
- [x] **02 chat** — starter suggestions had no loading state → visibly swapped the
  canned fallback to fetched copy. Added `suggestionsLoaded` + skeleton rows while
  the fetch is in flight; pure decision extracted to `_starter-suggestions.ts` and
  unit-tested (`starter-suggestions.test.ts`, 4/4). 188 chat-suite tests green (no
  regression). NOTE follow-up (not hydration): chat thread route authorizes by
  userId only, not tenantId — defense-in-depth, safe while users are single-tenant.
- [x] **03 inbox** — two secondary lanes swallowed load failures. Outbound table
  (`_outbound-table.tsx`): `.catch(console.error)` → misleading empty table; now an
  r.ok guard + retryable `EmptyState variant="error"`. Capture-review drawer
  (`_capture-review.tsx`): swallowed errors / no way to tell empty-vs-failed; route
  now returns 500 on error and the drawer shows a retry bar while keeping self-hide
  on a genuinely empty queue. Capture route confirmed tenant-scoped (no leak).
  Test: `capture-review.test.tsx` (error/empty/data). 80 inbox tests green.
- [x] **06 account-brain** — Graph-facts section + the contact champion badge were
  filtered tenant-only (showed every tenant edge identically on every account's
  brain). Now scoped to the company's context-graph node (`get-brain.ts`: resolve
  the company node, filter edges where source/target = that node, else nothing).
  Knowledge + Memories have NO company link in the schema (tenant-wide by design),
  so they cannot be mechanically scoped — left as-is + documented in code.
  **PRODUCT DECISION for the founder:** relabel those two sections "Workspace
  knowledge/memories" or drop them from the company brain (they read as
  company-specific today but aren't). Test: get-brain graph-scope test + 35 existing
  renumbered for the added node query. 36 green.
- [x] **07 contacts** — a swallowed first-page list-fetch failure left contacts=[]
  → rendered the fresh-tenant "No contacts yet" import CTA, so a 500 looked like an
  empty tenant. Loader now flags `listError` on a failed first page; the view
  decision is extracted to `_list-view.ts` (`contactsListView`) and the body renders
  a retryable error EmptyState instead. Test: `list-view.test.ts` (loading/error/
  empty-fresh/empty-filtered/list + "don't error once rows loaded"). 34 contacts
  tests green. MINOR follow-up (not hydration): contacts route company-join filters
  by id ANY() without an explicit eq(companies.tenantId) — safe today, harden later.
- [x] **08 contact-detail** — 3 lanes swallowed failures into a faked empty/degraded
  state; all made independent with their own error flag + a shared `reloadKey` retry:
  (1) activities — failure rendered the same "No activity recorded" empty → now a
  retryable error line; (2) buyer-intent — a 500 silently showed no card → now an
  "unavailable" + retry chip (genuine null still self-hides); (3) associated
  companies — a failed `/api/accounts/[id]` rendered a raw truncated UUID as the
  name → now a neutral "View company" label. 10 contact-detail tests green (no
  regression). Live verify (failing-fetch UI) deferred — page too heavy to mount
  cheaply; pattern already covered by inbox/contacts tests.
- [x] **09 contacts-merge** — curated mode fetched `/api/contacts` (first 50), so a
  preselected id past row 50 was silently dropped, falsely tripping "Need at least
  2 valid contacts". Added an `?ids=a,b,c` filter to the contacts route (enriched,
  tenant-scoped via `inArray(contacts.id, ids)`) and the merge page now fetches
  exactly the preselected contacts by id (pageSize = selection size). Test: route
  `ids` filter (route-companyid.test.ts, 3/3). Follow-ups (lower severity): auto-mode
  candidate avatar passes domain=null (never the real logo — needs companyDomain in
  the merge GET); curated fetch failure shows only a toast, no inline retry.
- [x] **10 opportunities** — deals + analytics fetches swallowed failures into a
  faked-empty state: a 500 on `/api/opportunities` rendered an empty board/table
  (looked like no pipeline), and an analytics 500 silently removed the whole KPI
  strip (gated on `analytics &&`). Added `dealsError`/`analyticsError` flags +
  retries: the board/table shows a "Couldn't load your pipeline" retry when the
  deals load fails, and the KPI strip shows a "Couldn't load pipeline metrics"
  retry instead of vanishing. 22 opportunities tests green (no regression). Live
  verify deferred (page too heavy to mount cheaply). Follow-up: create-modal
  account/contact pickers still swallow fetch errors (empty dropdowns).
- [x] **12 sequences** — list fetch swallowed failures (catch console.warn; success
  only on res.ok), so a 500 left sequences=[] and showed "No campaigns yet" (looked
  like an empty account). Added `loadError` + a retryable error EmptyState branch
  (genuine-empty CTA preserved). 18 sequences tests green. Left as safe-default minor:
  sending-mode fetch swallow (default testMode:false), header "0" flash pre-load.
- [x] **13 sequence-detail** — launched campaign tiles (Queued/Sent/Opened/Replied)
  rendered hardcoded 0 on initial load: `emailStats` was only set by the preparing-
  poll (which stops on launch). Fixed end-to-end: (a) the status route now also
  computes opened/replied (`count(*) filter` over outboundEmails, deliverability
  pattern); (b) fetchSequence hydrates emailStats once from the status endpoint for
  ready/launched campaigns; (c) the poll got a catch (was an unhandled rejection on
  failure). Test: status route emailStats opened/replied + 404 (2/2). Page changes
  (load-populate + poll catch) — no existing page test; live verify deferred.
- [x] **16 meetings** — list fetch swallowed failures, so a 500 fell through to the
  "No meetings in view" empty state (error masked as no-meetings). Added `loadError`
  + `reloadKey`; a retryable error EmptyState now renders FIRST (robust regardless
  of calendarConnected), preserving the connect/empty states. 33 meetings tests
  green. By-design/minor left: notetaker copy gated on a deploy-wide env flag;
  per-provider calendar partial-failure not surfaced (allSettled).
- [x] **17 meeting-detail** — fetchMeeting swallowed non-OK/network failures, so a
  500 from the notes route rendered the same "Meeting not found." as a real 404.
  Now distinguishes them: a 5xx/network failure flags `loadError` → "Couldn't load
  this meeting" + Retry; a genuine 404 keeps "Meeting not found.". 27 meeting-detail
  tests green. Follow-up (heavier, not done): upcoming-meeting prep is generated into
  local state only and not persisted/re-hydrated on reload — needs prep persistence
  (POST /api/meetings/prep doesn't store it; notes route doesn't return it).
- [x] **19 tasks** — fetchTasks swallowed failures → tasks=[] → "No tasks yet" (a
  500/401 looked like an empty account). Added `loadError` + a retryable error
  EmptyState (rendered before the empty states). 9 tasks tests green. Defensive
  follow-up: tasks route resolves entity names by id=ANY without eq(tenantId)
  (safe today — ids come from tenant-scoped tasks).
- [x] **20 call-mode** — the default campaign queue hardcoded accessibilityScore=0.7
  for every contact, so the reachability pill + ReachabilitySummary + "numéro non
  qualifié" gap line ran off a constant. Extracted the buildQueue mapping into
  `lib/voice/reachability.ts` (accessibilityScoreFromPhoneType) and used it in the
  campaign route from the contact's real `properties.phoneType` (queue.ts untouched —
  no hot-path risk). Test: reachability mapping (3/3). 33 voice/call-mode tests green.
  Follow-ups (heavier/by-design): campaign queue still emits localTime/tz='' (needs
  company-props query + tz/quiet-hours helpers); live transcript/levers depend on the
  Phase-1.5 streaming bridge (honest empty state today).
- [x] **23 reports — RESOLVED.** The "Recent Reports" history stored the FULL
  AI report content under a fixed localStorage key (`elevay-report-history`), so on
  a shared machine the next tenant/user saw the prior tenant's complete reports and
  it survived logout. Fix: scope the key by `tenantId` fetched from `/api/auth/session`
  (`HISTORY_KEY_PREFIX:<tenantId>`), persist ONLY once the tenant is known (in-memory
  otherwise — never a fixed key), and purge the legacy unscoped key on mount to clear
  any already-leaked content. The analytics cards (RevenueForecast/CohortInsights/AI
  report) were already H1. Minor left: analytics fetch-once staleness (P2).
- [x] **24 insights** — a single `.catch(console.error)` over the 3-lane Promise.all
  swallowed all failures (page showed 0/$0K, Alerts+Briefs hidden — a 500 looked
  like an empty tenant). Restructured to independent lanes (per-lane r.ok → that lane
  empty, others unaffected) + a `loadError` that renders a page-level retry when ALL
  lanes fail. No existing insights test (client page); change is contained to
  page.tsx, proven pattern. Follow-up (lower): written empty states for Alerts/Briefs
  sections (they still self-hide when genuinely empty).
- [x] **26 insights-pilae** — single-endpoint page (GET /api/insights/pilae, one
  fetch → 3 panels). Two H2 defects fixed page-local (no route change): (a) the
  Bookings panel had no written empty state — with zero deals it rendered
  `formatDealAmount(0)` = "—" + a 0% target bar (amount.ts:73); now a stated
  "No bookings yet — deals with a project or platform amount appear here." mirroring
  the Funnel/Capacity panels. (b) the error banner had no recovery; added a Retry
  button (`onClick={fetchData}`, disabled+"Retrying…" while loading). Extracted the
  pure totals decision to `_bookings-totals.ts` (`bookingsTotals` — project/platform
  never blended, legacy folded+surfaced, pct clamped, `hasBookings`) + 6 unit tests.
  Anti-creep-pilae green (only scans lib/ai + lib/sequences, not the page tree).
  Did NOT split the route into 3 independent lanes: it's one endpoint on one DB
  connection — "independent per-lane degradation" there is theoretical (a panel can't
  fail while siblings succeed), and stale data already survives a poll failure
  (`data` retained, banner shown). Insane-refactor avoided per "ne fais rien d'insensé".
- [x] **27 insights-playbook** — near-H1 already (real tenant-scoped GET /api/playbook,
  written empty + independent error + write-path validation). Sole H2: the "Loading…"
  cue was gated on `entries.length===0` (page.tsx:133), so a type-filter switch
  re-fetched while the previous filter's cards stayed on screen with no cue (silent
  stale, wrong-filter flash). Extracted pure `playbookListState(loading,count)` →
  initial-loading | refreshing | empty | list (`_list-state.ts` + 5 tests); the
  "refreshing" branch keeps the list but dims it (opacity .5) + `aria-busy` + a
  "Refreshing…" label. Follow-ups (lower, not done): no focus/poll revalidation so
  LLM-captured entries need a manual reload; `updatedAt` fetched but never shown.
- [x] **30 notes** — three fixes, no scope creep: (1) list fetch swallowed failures
  (catch→console.warn) so a route 500 rendered the "No notes yet" empty state; added
  `loadError` set on `!res.ok`/catch + a retryable `EmptyState variant="error"`
  rendered BEFORE the empty checks. (2) the three server-side entity-name lookups
  (companies/contacts/deals) were queried by id with NO tenant filter; now
  `and(inArray(id, ids), eq(tenantId, authCtx.tenantId))` on all three
  (defense-in-depth). (3) inline notes default entityType='general' (truthy) rendered
  a stray icon-less/link-less badge; extracted pure `isLinkableNoteEntity` into
  `_entity-badge.ts` (6 tests) and gated the badge on it (company/contact/deal only).
  Deliberately NO focus/poll refresh: notes are user-authored, addNote already
  refetches, no external mutation source. tsc clean; 65 tests green
  (entity-badge 6 + inbox-notes + route-capability).
- [x] **31 graph** — two error-state fixes (heavy SVG client page, no harness):
  (1) `fetchGraph` swallowed failures (empty catch) so a 500 rendered "No graph
  data yet"; added `loadError` (set on `!graphRes.ok`/catch) → the empty branch now
  shows a retryable `EmptyState variant="error"`. (2) `sendFeedback` silently
  no-oped on failure; added `feedbackError` (edge id) → a `role="alert"` "Couldn't
  save your feedback" line under the failed edge's vote buttons. Per-lane skeletons
  (#3) left as a flagged non-fix (graph meaningless without nodes). tsc clean.
- [x] **32 voice-of-customer** — (1) error/empty conflation: refactored the fetch
  into a `load` callback with `loadError` (set on `!res.ok` 500 / throw) → retryable
  error EmptyState before the "No customer insights yet" empty. (2) subtitle
  understatement: route now returns `totalInteractions` on the no-key and parse-error
  paths (was success-only), so "0 themes from N interactions" is truthful. (3) the
  LLM re-emitted-attribution risk is flagged as a grounding-redesign follow-up, NOT
  done here (would be an insane refactor to fold into an error-state pass). tsc clean.
- [x] **35 tam-review** — load() swallowed `!res.ok` (bare return) + empty catch, so a
  500 rendered the "No pending proposals" empty state. Added `loadError` → a
  `role="alert"` error card with a Retry button (matching the page's bespoke styling)
  before the empty state. decide() already degraded correctly (unchanged). Freshness
  (once-on-mount, no focus refetch) flagged as a follow-up, not rushed. tsc clean.
## T1 residue (H5/H4 secondary defects, after P0 primaries fixed)

- [x] **05 account-detail** — dossier load-error stopped masking as "no dossier"
  (`company-dossier.tsx` loadError + role="alert" Retry branch before the Generate
  CTA). Contacts account-agnostic was R2 (77762b0f). Field-save/owner write-path
  swallows = documented P2 follow-up. (`0837f9d5`)
- [x] **11 opportunity-detail** — total deal-intelligence load failure now surfaced
  via the page's toast (network catch + all-three-lanes !ok); optional score/at-risk/
  win-loss lanes self-hide (no spam). Dead split was R3 (e3562ed3). Per-lane loading
  skeletons = P2 follow-up. (`e7fef0f8`)
- [~] **22 deliverability** — ACCEPTABLE as-is. The tenant leak (P0) was R1
  (305cf5a2). The page ALREADY shows "Failed to load deliverability data." when the
  fetch returns null (page.tsx:349) — error IS surfaced page-level. Remaining
  per-element degradation + fetch-once freshness are P2 refactors, not the
  error-as-empty class; not worth the risk ("ne fais rien d'insensé").
- Also: fixed a latent TS2367 in `route-companyid.test.ts` (from 874cb894) that kept
  the whole branch at tsc exit 2 — branch is now genuinely tsc-green. (`276d8bc6`)

## T2 settings (H2 → H1) — COMPLETE 2026-06-25

Verified via the `verify-settings-hydration` workflow (17 hostile Explore agents vs
CURRENT code; `usesSafeFetch:false` confirmed → the audit H2 ratings held). Full
per-page defects + fixes: `_reports/hydration-audit/_settings-p1-worklist.md`.

- [x] **batch 1 `c33d67d9`** — S07 objects · S08 data-model · S10 plays (GET error-as-empty
  + swallowed-save: loadError/Retry + res.ok guards + toast on mutation failure).
- [x] **batch 2 `73293cbf`** — S34 privacy (+ missing 'team' visibility option) · S38
  autonomy · S22 inbox-voice (GET swallow + fail-soft save → loadError/Retry + toast).
- [x] **batch 3 `c1907293`** — S24 inbox-autonomy · S26 inbox-notifications · S31
  agent-memory (same class; S31 blank-page-on-fail → error Card).
- [x] **batch 4 `24190141`** — S01 profile (GET no res.ok check) · S21 writing-style
  (infinite spinner on fail → loadError) · S09 workflows (optimistic toggle/delete now
  revert on failure; NL builder error state vs canned fallback) · S05 stages route
  (DEFAULT_STAGES missing aiFillMode/wipLimit).
- [x] **batch 5** — S14 evals (dev-only, minimal loadError) · S20 mail-calendar (post-PUT
  re-sync of server-canonicalized values).
- S33 security = write-only-by-design (no load; handleSubmit checks res.ok) — no fix.
  S18 = redirect to S20.
- Deferred P2s (NOT done, flagged): loading skeletons (S01/S14), per-row pending (S09),
  gdprRegion-from-env→tenant (S34, architectural), audit-log defaultDataVisibility (S34),
  mailbox last-sync timestamps (S18, data-model gap).

## T3 periphery — DONE (no work)

Auth (T01–T07) action-driven, marketing/legal (T08–T15) static-by-design — all H0/H1,
zero defects per `_rollup-t3.md`. Nothing to fix.

## H1 re-verification (2026-06-25) — the audit was over-generous on 4/7

Re-verified the 7 product pages rated H1 via the `verify-h1-product-pages` workflow
(7 hostile Explore agents vs CURRENT code) — being intransigeant rather than trusting
the ratings. **18 meeting-upload · 21 outbound-mode · 25 hot-to-call = confirmed H1.**
The other 4 were actually H2 (same error-as-empty / swallowed-save class) and are now FIXED:
- [x] **04 accounts** — `loadAccounts` did a bare `return` on `!res.ok` (page.tsx:729) → a
  500 on the first page rendered "No accounts" (masked an empty library). Added `loadError`
  (scoped to the initial, non-append load) + a retryable `EmptyState variant="error"` before
  the empty states. Also guarded `refetchLoadedAccounts` from overwriting the loaded list
  with a partial reload when a page fetch fails. (high-traffic core page)
- [x] **15 proposals** — `loadList` had a bare `if (res.ok)` with no else → a 500 left
  templates empty. Added an else/catch `setNotice(...)` mirroring the existing openTemplate
  notice pattern.
- [x] **28 knowledge** — `fetchEntries` swallowed failures → "no knowledge" empty masked a
  500. Added `loadError` + an error early-return with Retry.
- [x] **34 objects** (`/objects/[type]`) — `fetchRecords` only handled `res.ok`/404, so a 500
  fell through to "Object type not found". Added `loadError` (distinct error+Retry state) and
  wired `toast` into all mutation handlers (save/delete/bulk-delete/inline-edit), which
  previously failed silently.
  
Verified: accounts/proposals/knowledge page tests 54/54 green; objects has no test (tsc only).
Kept `toast` OUT of every useCallback dep array (the opp infinite-loop lesson —
[[reference_test-and-tsc-gotchas]]).
