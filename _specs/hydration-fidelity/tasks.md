# Hydration Fidelity — Tasks (Kiro)

Order: P0 (broken/unwired) first — cleanest & most confirmed first — then the H2→H1
per-page pass in spine order. Each task: code → test → verify → commit.

Branch: `feat/hydration-fidelity` (from main). R1 already shipped separately on
`fix/deliverability-tenant-leak` (305cf5a2).

## P0

- [x] **T1 (R1) deliverability tenant leak** — DONE (`fix/deliverability-tenant-leak`,
  305cf5a2). Regression in `deliverability-api.test.ts`, 5/5 green.

- [ ] **T2 (R7) notifications Slack webhook hydration**
  - Code: `api/notifications/preferences/route.ts` GET also returns
    `slackWebhook` from `tenants.settings.slackWebhookUrl` (both branches).
  - Test: vitest — GET returns the stored webhook when tenant settings hold one.
  - Verify: open `/settings/notifications`, save a webhook, reload → input pre-filled,
    "Connected" badge shows.

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
- [ ] 16 meetings · 17 meeting-detail
  · 19 tasks · 20 call-mode · 23 reports · 24 insights · 26 insights-pilae
  · 27 insights-playbook · 30 notes · 31 graph · 32 voice-of-customer · 35 tam-review
  · then T2 H2 settings.
