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
