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
- [ ] 08 contact-detail · 09 contacts-merge
  · 10 opportunities · 12 sequences · 13 sequence-detail · 16 meetings · 17 meeting-detail
  · 19 tasks · 20 call-mode · 23 reports · 24 insights · 26 insights-pilae
  · 27 insights-playbook · 30 notes · 31 graph · 32 voice-of-customer · 35 tam-review
  · then T2 H2 settings.
