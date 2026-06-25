# Hydration Audit — rollup Tier 1 (pages 01–36)

_Généré 2026-06-24. 35 pages auditées (02–36) + Home (01, étalon H1, à la main)._

## Distribution (T1, 02–36)

| État | Pages |
|------|-------|
| H5 (cassé) | 2 |
| H4 (non câblé) | 4 |
| H2 (partiel) | 21 |
| H1 (fidèle) | 7 |
| H0 (statique) | 1 |

**Lecture :** 01-home = H1 (étalon). Sur 02–36, seules 7 pages atteignent la barre H1 ; le gros du travail = remonter les 21 H2 vers H1, et réparer/​câbler les 2 H5 + 4 H4 en priorité.

## Pages triées par sévérité (H5 → H0)

| # | Page | Route | État | #él. | Verdict |
|---|------|-------|------|------|---------|
| 05 | account-detail | `/accounts/[id]` | **H5** | 16 | The account-detail page is largely high-fidelity: header, targeting/suppression, AI brief, AI summary, meeting/call intel, deals, score, and the editable right panel are all wired to real tenant-and-company-scoped data with their own loadin |
| 22 | deliverability | `/deliverability` | **H5** | 12 | The /deliverability page is largely faithfully hydrated: KPIs (Sent/Open/Reply/Bounce/Spam/Replied), week-over-week trend arrows, mailbox health cards, recommendations, and the DNS auth checker all trace to real, tenant-scoped data from /ap |
| 11 | opportunity-detail | `/opportunities/[id]` | **H4** | 19 | The deal-detail page is largely faithful: header, timeline, health, win-probability, stall-risk, narrative, MEDDPICC, stakeholder map and win/loss all pull real tenant-scoped data (every route filters eq(deals.tenantId)/eq(activities.tenant |
| 29 | skills | `/skills` | **H4** | 9 | The custom-skills lanes (Workspace, Personal) are genuinely H1: real tenant- and user-scoped DB reads from customSkillTemplates with eq(tenantId), a written 'No skills yet' empty state, and a page-level loading spinner. The System skills la |
| 33 | cs-today | `/cs/today` | **H4** | 9 | The /cs/today daily priority queue is mostly faithfully hydrated: a single client fetch to a properly tenant-scoped route (eq tenant_id on both the latest-snapshot subquery and the companies join) feeds real health scores, component breakdo |
| 36 | pricing | `/pricing` | **H4** | 5 | The /pricing page is a fully client-side static marketing page: every displayed value (tier names, prices, feature lists, CTAs, the 'Current Plan' marker) comes from a hardcoded `tiers` array with zero data fetching. A tenant-scoped subscri |
| 02 | chat | `/chat` | **H2** | 7 | The /chat page is a conversational AI surface, not a KPI dashboard, and its core data lanes are faithfully wired: thread history and live streamed turns come from real tenant/user-scoped sources (GET /api/chat/threads/[id] scoped by userId, |
| 03 | inbox | `/inbox` | **H2** | 13 | The /inbox page is a strong, near-reference-bar implementation: every data-bearing surface (conversation list, folder/split/mailbox counts, reading pane, bundles, catch-up banner, header subtitle) is wired to real data that is rigorously sc |
| 06 | account-brain | `/accounts/[id]/brain` | **H2** | 20 | The brain page is well-built: a single client fetch to GET /api/brain/[companyId] with auth-derived tenantId (never client-supplied), full loading (DetailPageSkeleton), a rendered error fallback, and a written empty state per section. Compa |
| 07 | contacts | `/contacts` | **H2** | 14 | The /contacts page is near-reference quality on data hydration: every data-bearing element traces to GET /api/contacts (or /api/import/history), both rigorously tenant-scoped via getAuthContext + eq(tenantId), with soft-delete filtering, a  |
| 08 | contact-detail | `/contacts/[id]` | **H2** | 12 | The page is broadly faithful: every data-bearing element is wired to real, tenant-scoped sources (contact, activities, buyer-intent, calls, accounts all filter by authCtx.tenantId; calls use withAuthRLS), the header/details show a load skel |
| 09 | contacts-merge | `/contacts/merge` | **H2** | 9 | The page is largely faithful: both data sources (GET /api/contacts/merge for auto-detected duplicate groups, GET /api/contacts for curated selections) are real and properly tenant-scoped (eq(tenantId) + deletedAt guards), with loading, writ |
| 10 | opportunities | `/opportunities` | **H2** | 9 | The page is largely faithful: every data-bearing lane (board, table, forecast, KPIs, risk badges, stalled count) is wired to real tenant-scoped data via /api/opportunities, /api/pipeline/analytics and /api/forecast — all of which filter by  |
| 12 | sequences | `/sequences` | **H2** | 8 | The Campaigns/sequences page is almost fully faithful: every data-bearing element (list cards, step/contact counts, sent-email stat, status badge, header count, test-mode banner, inline Start/Reject) is wired to real tenant-scoped queries w |
| 13 | sequence-detail | `/sequences/[id]` | **H2** | 13 | The page is largely faithful: sequence header, step timeline, enrolled-contacts table, and the entire Analytics tab (funnel, rates, per-step breakdown, enrollment breakdown) are all wired to real tenant-scoped data via /api/sequences/:id an |
| 16 | meetings | `/meetings` | **H2** | 12 | The /meetings page is largely faithful (H1): every data-bearing element — calendar grid, list cards, next-meeting countdown, conflict banner, show-rate chip, CRM account/contact matching, notes/transcript badges, and attendance controls — i |
| 17 | meeting-detail | `/meetings/[id]` | **H2** | 18 | The meeting detail page is near reference-bar quality: nearly every data-bearing element is wired to real tenant-scoped data from GET /api/meetings/[id]/notes (every entity query carries eq(tenantId) + isNull(deletedAt)), each section self- |
| 19 | tasks | `/tasks` | **H2** | 9 | The /tasks page is almost fully faithful: every data-bearing element (task list, title, entity badge, priority, due date, header count, pending/overdue badges, filter-tab counts, entity group headers) is wired to real tenant-scoped data fro |
| 20 | call-mode | `/call-mode` | **H2** | 21 | Call Mode is a large, genuinely data-wired cockpit: queue, brief, prospect brief, account brain, funnel KPIs, caller-ID pool, debrief and SSE call events all trace to real tenant-scoped sources (every route uses withAuthRLS / getAuthContext |
| 23 | reports | `/reports` | **H2** | 14 | The /reports page is mostly faithful: the two always-on cards (RevenueForecast, CohortInsights) and the on-demand AI report are all wired to real, tenant-scoped data via GET /api/analytics/forecast, GET /api/analytics/cohorts, and POST /api |
| 24 | insights | `/insights` | **H2** | 10 | The /insights page is wired to three real, tenant-scoped API routes (pipeline, alerts, briefs), all gated by getAuthContext() and filtered with eq(deals.tenantId)/eq(activities.tenantId)/eq(coachingInsights.tenantId). Data origin is faithfu |
| 26 | insights-pilae | `/insights/pilae` | **H2** | 11 | This page is genuinely wired to real, tenant-scoped data: a single client fetch to GET /api/insights/pilae, which runs three Drizzle queries all scoped by eq(deals.tenantId, authCtx.tenantId) / eq(tenants.id, authCtx.tenantId) against real  |
| 27 | insights-playbook | `/insights/playbook` | **H2** | 8 | The Playbook page is a faithful, near-reference-bar data-hydration implementation. Every data-bearing element is fed by real tenant-scoped data from GET /api/playbook (auth via getAuthContext, eq(playbookEntries.tenantId, authCtx.tenantId)) |
| 30 | notes | `/notes` | **H2** | 4 | The /notes page is mostly faithful: every data-bearing element (note rows, header count, entity badges) is wired to real tenant-scoped data via GET /api/notes, which filters by eq(notes.tenantId) + isNull(deletedAt). It has a loading skelet |
| 31 | graph | `/graph` | **H2** | 8 | The /graph (Context Graph) page is largely faithful: every data-bearing element (header counts, filter type breakdown, nodes, edges, detail-panel facts with confidence and bi-temporal validity) is wired to real, tenant-scoped Drizzle querie |
| 32 | voice-of-customer | `/voice-of-customer` | **H2** | 6 | The page is wired to a real, fully tenant-scoped data source: GET /api/voice-of-customer queries activities, notes, companies, and contacts all filtered by authCtx.tenantId (and isNull(deletedAt)), then runs an LLM (claude-sonnet-4-6) to ex |
| 35 | tam-review | `/tam/review` | **H2** | 3 | The /tam/review page is well-wired to real tenant-scoped data: both the proposal list and the pending count come from listProposals (eq tenantId, status filter, newest-first) behind withAuthRLS, and the page has a proper loading spinner plu |
| 04 | accounts | `/accounts` | **H1** | 14 | The /accounts page is broadly faithful (H1): every data-bearing element traces to a real, tenant-scoped data source. The primary list, counts, facets and per-row intelligence all go through /api/accounts and sibling routes that scope on eq( |
| 15 | proposals | `/proposals` | **H1** | 13 | The /proposals page is a faithfully data-hydrated workspace. Every data-bearing element traces to a real, tenant-scoped source: the template list and detail (proposalTemplates with eq(tenantId)+isNull(deletedAt) under withAuthRLS), the deal |
| 18 | meeting-upload | `/meetings/upload` | **H1** | 4 | This is a user-action-driven upload form, not a data dashboard, so it has no on-mount tenant-data fetch to hydrate. Every data-bearing element (matched-contact count, meeting-notes summary) is rendered only after submission from the real, a |
| 21 | outbound-mode | `/outbound-mode` | **H1** | 7 | The "Outbound du jour" cockpit is genuinely data-hydrated: a single client fetch to GET /api/outbound/queue feeds every element with real, tenant-scoped data (replies, sequence touches, pending drafts), and the page handles loading, empty,  |
| 25 | insights-hot-to-call | `/insights/hot-to-call` | **H1** | 14 | This page is faithfully hydrated. Every data-bearing element (name, company, title, phone, hotness, headline signal, signal chips, speed-window badge, refresh meta) traces to real tenant-scoped data from GET /api/dashboard/hot-to-call, whic |
| 28 | knowledge | `/knowledge` | **H1** | 9 | The /knowledge page is essentially faithful: every data-bearing element (sidebar list, section counts, entry rows, detail fields, scope/stale badges, timestamps, edit affordances) is wired to real tenant-scoped data via GET /api/settings/kn |
| 34 | objects | `/objects/[type]` | **H1** | 5 | This page is essentially faithful (H1): every data-bearing element (header title/icon, record count, the dynamically-built records table, detail modal fields, timestamps) is wired to real tenant-scoped data via GET /api/custom-objects/[type |
| 14 | sequence-review | `/sequences/[id]/review` | **H0** | 1 | This route is a pure server-side redirect, not a rendering page. The entry file is a Next.js server component whose only behavior is `redirect('/sequences/review?sequenceId=...')` — the legacy per-sequence review surface was retired in favo |

## Défauts P0 — pages H5 (cassé) et H4 (non câblé)

### 05 — account-detail (`/accounts/[id]`) — H5

The account-detail page is largely high-fidelity: header, targeting/suppression, AI brief, AI summary, meeting/call intel, deals, score, and the editable right panel are all wired to real tenant-and-company-scoped data with their own loading/empty/error degradation. The one real data defect is the "Contacts at this account" lane: the page fetches /api/contacts?companyId=<id> but that GET handler never reads the companyId param, so it returns the first 50 of ALL tenant contacts instead of contacts at this account — and the correctly-scoped contacts already present in the main account payload are discarded. The dossier lane is H2 because a 500 from buildDossier is silently rendered as "no dossier / generate" rather than an error.

- Contacts list is account-agnostic: page.tsx:90 calls /api/contacts?companyId=accountId, but contacts/route.ts (GET, lines 29-52) never reads searchParams.get('companyId') — so 'Contacts (N)' at api/contacts/route.ts returns the first 50 of ALL tenant contacts, not this account's. The properly-scoped set is already returned by api/accounts/[id]/route.ts:54-69 and thrown away (page.tsx:91-92).
- Research Dossier masks server errors: a 500 from GET /api/research/dossier (research/dossier/route.ts:27-31) is caught as a generic non-ok and rendered as the 'No research dossier / Generate' CTA (company-dossier.tsx:129-131), so a backend failure looks like an empty state.
- Silent error degradation on several mutate/fetch paths: contacts fetch only console.warn (page.tsx:93), inline field-save errors swallowed on Enter path (page.tsx:585-588), owner reassign errors swallowed (page.tsx:128-130) — no user-visible error state on these lanes.

### 22 — deliverability (`/deliverability`) — H5

The /deliverability page is largely faithfully hydrated: KPIs (Sent/Open/Reply/Bounce/Spam/Replied), week-over-week trend arrows, mailbox health cards, recommendations, and the DNS auth checker all trace to real, tenant-scoped data from /api/deliverability and /api/deliverability/verify with loading skeleton + empty state + null-data fallback handled. The single meaningful defect is a TENANT LEAK: the "Sequence Enrollments" panel's enrollmentsByStatus is queried across ALL tenants (no eq(tenantId)) on default page load, so it shows other tenants' enrollment counts. Secondary: the page has no per-element error degradation (one fetch failure blanks the whole page) and freshness is fetch-once-on-mount with no refresh.

- TENANT LEAK: Sequence Enrollments panel — enrollmentsByStatus query at app/apps/web/src/app/api/deliverability/route.ts:99-101 selects from sequenceEnrollments with NO tenantId filter on default load (only filters by sequenceId when provided). sequenceEnrollments.tenantId exists (db/schema/outbound.ts:133) but is ignored, so the panel at page.tsx:594-610 renders cross-tenant enrollment counts.
- No independent/per-element error degradation: a single /api/deliverability failure sets data=null and replaces the ENTIRE page with 'Failed to load deliverability data.' (page.tsx:344-353, 287-292) — unlike the Home reference where each lane degrades independently.
- Stale/no-refresh freshness: deliverability data is fetched once on mount with no polling/refetch (page.tsx:286-292); connectedMailboxes.sentToday/healthScore/bounceCount7d are shown as-is with no 'as of' timestamp, so the mailbox cards (page.tsx:548-588) can silently show stale capacity.

### 11 — opportunity-detail (`/opportunities/[id]`) — H4

The deal-detail page is largely faithful: header, timeline, health, win-probability, stall-risk, narrative, MEDDPICC, stakeholder map and win/loss all pull real tenant-scoped data (every route filters eq(deals.tenantId)/eq(activities.tenantId)) and most lanes self-hide or have written empty states. The page-level loading skeleton and deal-not-found error are handled. The one structural defect is the right-rail deal amounts: the page renders a project-bookings / platform-ARR split via getDealAmountDisplay, but /api/opportunities/[id] never returns projectAmount or platformArr (only value), so isSplit is permanently false and the split lines are dead — the Deal interface advertises fields the source omits. Secondary gaps: most intel lanes silently swallow fetch errors (console.warn only) so a 500 leaves a blank lane with no message, and several lanes never show a loading state.

- Deal-amounts split is permanently dead UI: page.tsx:831-852 renders Project bookings / Platform ARR / Total via getDealAmountDisplay, but app/api/opportunities/[id]/route.ts:82-98 returns only `value` (no projectAmount/platformArr), so isSplit is always false — the split (the documented bookings≠ARR feature) never shows on this page (H4)
- Intel lanes swallow fetch errors as console.warn only (page.tsx:234,248,261 for score/at-risk/win-loss; 221 for timeline/health/auto-progress) — a 500 from any of these leaves the lane silently blank with no written error or retry, below the Home-page bar of independent degradation
- Several data lanes have no per-lane loading state (win-prob, health, stall-risk, narrative) — they pop in after the page skeleton resolves with no intermediate skeleton/spinner, so on slow networks the right rail and banners appear empty before populating

### 29 — skills (`/skills`) — H4

The custom-skills lanes (Workspace, Personal) are genuinely H1: real tenant- and user-scoped DB reads from customSkillTemplates with eq(tenantId), a written 'No skills yet' empty state, and a page-level loading spinner. The System skills lane — which is the bulk of the page and the sole content of the Explore tab — is effectively H4: it depends on the in-memory SKILL_REGISTRY Map being populated by registerAllSkills(), but that function is only ever called from a DIFFERENT route (/api/skills/[slug]), never from the GET /api/settings/skills handler this page calls. So on a cold server the System section renders empty and Explore shows 'No skills available'; population is a non-deterministic side-effect of whether the other route warmed the process first. Additionally, even when system skills do appear, the GET route maps them with only 9 fields (hasSteps:false, no steps/constraints/parameters/guidelines/cost, useCount:0), so the detail panel for any system skill is structurally thin (H2).

- System skills are unreliable/unwired: GET /api/settings/skills calls listSkills() (settings/skills/route.ts:19) against an in-memory Map that is only populated by registerAllSkills() called exclusively in api/skills/[slug]/route.ts:8 — never in this route. Cold process => System section + entire Explore tab render empty (registry.ts:15-17).
- System skill detail is structurally incomplete: the route maps system skills with hasSteps:false and omits steps/constraints/parameters/guidelines/costEstimate (settings/skills/route.ts:19-30), so SkillDetail never shows those sections for system skills despite the registry SkillDefinition containing them (skill-detail.tsx:160-266).
- System skill usage stats are hardcoded useCount:0 / lastUsedAt:null (settings/skills/route.ts:26-28); usage is only ever incremented for custom skills (executor.ts:170-178), so the usage block silently hides for all system skills rather than reflecting real run counts.

### 33 — cs-today (`/cs/today`) — H4

The /cs/today daily priority queue is mostly faithfully hydrated: a single client fetch to a properly tenant-scoped route (eq tenant_id on both the latest-snapshot subquery and the companies join) feeds real health scores, component breakdowns, and risk levels computed from live activities/deals by a registered daily Inngest cron, with real loading/empty/error states matching the Home bar. The page's worst defect is the ARR exposure: the column exists in schema and is consumed by both the badge and the route's sort tie-breaker, but the cron insert never writes arrExposureUsd, so it is permanently null — the badge never shows and the header's promised 'risk × ARR' ranking is dead (H4). Secondary issues: the 'AI suggested action' is a static template (data-driven axis selection but never the promised LLM enrichment), and the queue can be silently up to 24h stale with no freshness indicator.

- ARR exposure is unwired end-to-end: the cron never sets arrExposureUsd (cs-health-cron.ts:192-201 insert omits it) yet the page badge (page.tsx:156-158,203-213) and the route sort tie-breaker (route.ts:91-94,105) both depend on it — badge always hidden and the advertised 'rank by ARR' ordering never takes effect.
- Header copy overstates behavior: subtitle says accounts are 'ranked by risk × ARR' (page.tsx:89) but ARR is always null, so ranking degenerates to risk-then-healthScore only (route.ts:101-109) — misleading.
- Stale-without-signal: snapshots come from a once-daily 04:00 UTC cron that does not run under local dev (project note), and the list polls only on mount/refresh with no max-age/staleness indicator (computed_at relative text at page.tsx:261 is the only hint) — queue can silently lag real account state by ~24h.

### 36 — pricing (`/pricing`) — H4

The /pricing page is a fully client-side static marketing page: every displayed value (tier names, prices, feature lists, CTAs, the 'Current Plan' marker) comes from a hardcoded `tiers` array with zero data fetching. A tenant-scoped subscription endpoint (/api/billing/subscription, returns the real tenant.plan via authCtx.tenantId) and plan-limits.ts both exist, yet the page never calls them. The result: the one element that should reflect tenant state — which plan the tenant is on — is unwired and wrong for any paying tenant (it always labels Free Trial as 'Current Plan' and shows active upgrade buttons for plans they may already own). Far below the Home-page bar; only the checkout action touches the backend, not the rendered data.

- Current-plan state is unwired: page never calls the existing tenant-scoped /api/billing/subscription (route.ts:36-44 returns tenant.plan); 'Current Plan' is hardcoded to the Free Trial tier (page.tsx:25,138), so a Starter/Pro tenant sees the wrong current-plan marker and upgrade CTAs for tiers they already own.
- No loading/empty/error states for any data — the page renders the same static cards regardless of subscription fetch outcome; checkout failure is swallowed to console.warn (page.tsx:84) with no user-facing error.
- Prices and feature lists are hardcoded (page.tsx:19-62) instead of being sourced from Stripe products or lib/billing/plan-limits.ts, so displayed entitlements can silently drift from the limits actually enforced.

## CORRECTION (2026-06-25) — H1 ratings revised after hostile re-verification

A re-verification of the 7 "H1" pages against current code (workflow
`verify-h1-product-pages`) found this table was **over-generous on 4 of them** — they
carry the same error-as-empty / swallowed-save class the H2 pages did:

| # | Page | Was | Actually | Status |
|---|------|-----|----------|--------|
| 04 | accounts | H1 | **H2** | FIXED (loadError + retry; refetch partial-overwrite guard) — commit 0d647ff1 |
| 15 | proposals | H1 | **H2** | FIXED (loadList setNotice on failure) |
| 28 | knowledge | H1 | **H2** | FIXED (loadError + retry) |
| 34 | objects | H1 | **H2** | FIXED (500≠"not found" + mutation toasts) |

Genuinely H1 (re-confirmed): 18 meeting-upload · 21 outbound-mode · 25 hot-to-call.
Detail in `_specs/hydration-fidelity/tasks.md` ("H1 re-verification"). Lesson: an
LLM-generated audit can be over-generous; verify H1 claims against code, don't trust them.
