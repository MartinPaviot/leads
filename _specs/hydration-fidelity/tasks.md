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

- [ ] **T4 (R6) pricing current plan**
  - Code: `pricing/page.tsx` fetches `/api/billing/subscription`, marks current tier.
  - Test: tier-derivation unit test (plan → currentTier).
  - Verify: as a non-trial tenant, "Current Plan" lands on the right tier.

- [ ] **T5 (R4) skills registry warm**
  - Code: `api/settings/skills/route.ts` warms registry before `listSkills()`;
    maps real system-skill fields.
  - Test: GET returns system skills with steps/guidelines populated.
  - Verify: fresh server → `/skills` System + Explore populated.

- [ ] **T6 (R5) cs-today ARR exposure**
  - Code: snapshot writer sets `arrExposureUsd`; soften header copy if null.
  - Test: snapshot row carries arrExposureUsd from deal value.
  - Verify: `/cs/today` badge renders + participates in sort.

- [x] **T7 (R3) opportunity deal split** — DONE. Storage confirmed: projectAmount/
  platformArr are real `deals` columns (core.ts:266-267); the route did `select()`
  (all columns) but omitted them from the response. Added both to the `deal`
  payload so getDealAmountDisplay computes the real split.
  - Test: `route-split.test.ts` — GET returns projectAmount/platformArr. 1/1 green.

- [ ] **T8 (R8) billing mailboxes meter** — LOW (dev-only). Real count into the meter.

## P1 — H2 → H1 per-lane degradation (spine order)

One task per page; scope = each page's "Pires défauts" in `_reports/hydration-audit/`.
Order: 02 chat · 03 inbox · 06 account-brain · 07 contacts · 08 contact-detail ·
09 contacts-merge · 10 opportunities · 12 sequences · 13 sequence-detail ·
16 meetings · 17 meeting-detail · 19 tasks · 20 call-mode · 23 reports · 24 insights ·
26 insights-pilae · 27 insights-playbook · 30 notes · 31 graph · 32 voice-of-customer ·
35 tam-review · then T2 H2 settings pages.

Common change per page: swallowed `console.warn` fetch failures → per-lane written
error+retry; global spinner → shape-matching skeleton where a lane loads alone.
