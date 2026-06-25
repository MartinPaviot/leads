# 11 — opportunity-detail (`/opportunities/[id]`) — audit d'hydratation

**Verdict global : H4 (non câblé).** The deal-detail page is largely faithful: header, timeline, health, win-probability, stall-risk, narrative, MEDDPICC, stakeholder map and win/loss all pull real tenant-scoped data (every route filters eq(deals.tenantId)/eq(activities.tenantId)) and most lanes self-hide or have written empty states. The page-level loading skeleton and deal-not-found error are handled. The one structural defect is the right-rail deal amounts: the page renders a project-bookings / platform-ARR split via getDealAmountDisplay, but /api/opportunities/[id] never returns projectAmount or platformArr (only value), so isSplit is permanently false and the split lines are dead — the Deal interface advertises fields the source omits. Secondary gaps: most intel lanes silently swallow fetch errors (console.warn only) so a 500 leaves a blank lane with no message, and several lanes never show a loading state.

Entrée : `app/apps/web/src/app/(dashboard)/opportunities/[id]/page.tsx`.

## Éléments

| Élément | file:line | Source (file:line) | État | Tenant | Loading | Empty | Error | Fresh | Note |
|---------|-----------|--------------------|------|--------|---------|-------|-------|-------|------|
| Deal name + stage badge (header) | page.tsx:431-434 | /api/opportunities/[id] GET deal.name/deal.stage, app/api/opportunities/[id]/route.ts:82-84 | H1 | yes | skeleton | n/a | global | once | faithful; tenant-scoped, page-level skeleton + 'Deal not found' error |
| Owner select | page.tsx:437 | deal.ownerId + memberNames, route.ts:93-94; PUT route.ts:151 | H1 | yes | none | n/a | silent |  | optimistic reassign with toast on failure; faithful |
| Email-contact recipient (To) | page.tsx:445-451,174-195 | /api/deals/[id] -> contactId, then /api/contacts/[id] -> email | H2 | yes | none | blank | silent |  | two-hop fetch; on any failure To is left blank silently (by design, user can fill) |
| Auto-progress suggestion banner | page.tsx:459-495 | POST /api/opportunities/[id]/auto-progress -> suggestNextStage, auto-progress/route.ts:67 | H1 | yes | none | none | silent |  | self-hides when no suggestion; real rule-engine output, tenant-scoped |
| Stall-risk banner (indicators + interventions + evidence) | page.tsx:502-618 | GET /api/deals/at-risk -> predictStalls(tenantId), stall-predictor.ts:430-454; filtered client-side by dealId | H1 | yes | none | none | silent |  | self-hides when prob<=0.5; fetches ALL at-risk deals then filters for this one (inefficient but tenant-scoped); fetch errors only console.warn |
| Deal summary card | page.tsx:620-627 | deal.summary, route.ts:87 | H1 | yes | none | none | global | once | self-hides when null; faithful |
| Autofilled intelligence grid (budget/team/CRM/...) | page.tsx:635-669; deal-property-cell.tsx:107-118 | deal.properties via getDealPropertyEntry | H1 | yes | none | handled | global |  | per-cell '—' empty + source-attribution tooltip; section self-hides when no field present; faithful |
| MEDDPICC scorecard | page.tsx:672; call-intel.tsx:152-162 | deal.properties.meddic / pendingMeddic | H1 | yes | none | none | global |  | returns null when no meddic data; real grounded properties; faithful |
| Stakeholder map (cards + coverage + strategy) | page.tsx:675,1017-1164 | deal.properties.stakeholders/championSignals/extractedDecisionMaker | H1 | yes | none | handled | global |  | self-hides when no stakeholder data; coverage gaps shown as written 'No X identified'; faithful |
| Deal coaching card (risk/stalled) | page.tsx:678-741 | deal.properties.riskLevel/risks/nextActions + timeline[0].occurredAt | H1 | yes | none | none | global |  | self-hides unless high/medium risk or stalled>=7d; derived from real properties + timeline |
| Win/Loss post-mortem card | page.tsx:744,1168-1259 | GET /api/deals/[id]/win-loss -> cached props.winLossAnalysis or analyzeWinLoss(), win-loss/route.ts:47-61 | H1 | yes | none | none | silent |  | closed deals only; cached-or-on-demand; fetch error only console.warn (lane blank) |
| Deal narrative list | page.tsx:747-764 | GET /api/opportunities/[id]/timeline -> buildNarrative(rows), timeline/route.ts:75 | H1 | yes | none | blank | silent |  | written empty state 'No narrative yet — waiting on activity' gated on intelLoaded; faithful |
| Activity timeline | page.tsx:766-813 | /api/opportunities/[id] GET data.timeline, route.ts:62-76,99-107 | H1 | yes | skeleton | handled | global | once | written 'No interactions recorded yet'; actorName resolved via tenant member names; faithful |
| Win Probability card (right rail) | page.tsx:820,898-957 | GET /api/deals/[id]/score -> scoreDeal model or stageProbability fallback, score/route.ts:65-89 | H1 | yes | none | none | silent |  | open deals only; graceful stage-fallback when no model; fetch error only console.warn |
| Health score card (right rail) | page.tsx:823,962-1013 | GET /api/opportunities/[id]/health -> computeHealthScore, health/route.ts:82-98 | H1 | yes | none | none | silent |  | self-hides until health loads; pure arithmetic over tenant activities; error only console.warn |
| Deal amounts split: Project bookings / Platform ARR / Total | page.tsx:831-852 | getDealAmountDisplay({value, projectAmount, platformArr}) — but route.ts:82-98 returns ONLY value, never projectAmount/platformArr | H4 | yes | none | n/a | n/a | once | DEFECT: Deal interface (page.tsx:34-35) declares projectAmount/platformArr but the API omits them, so amounts.isSplit is always false — the three split lines are permanently unreachable dead UI; only the single 'Value' fallback ever renders |
| Value (single, fallback) | page.tsx:854-858 | deal.value via getDealAmountDisplay total, route.ts:86 | H1 | yes | none | none |  |  | renders formatted value; faithful |
| Stage / Expected Close / Account (right rail) | page.tsx:861-882 | deal.stage/expectedCloseDate/companyId/companyName, route.ts:84-90 | H1 | yes | none | handled |  |  | '—' for missing close/account; account links to /accounts/[id]; faithful |
| ExtractedIntel (Deal Intelligence section) | page.tsx:1262-1328 | defined but NEVER rendered on the page | H0 | n/a | none | n/a | n/a |  | dead component — declared but not referenced in the page tree; no UI impact, but unused code |

## Pires défauts

1. Deal-amounts split is permanently dead UI: page.tsx:831-852 renders Project bookings / Platform ARR / Total via getDealAmountDisplay, but app/api/opportunities/[id]/route.ts:82-98 returns only `value` (no projectAmount/platformArr), so isSplit is always false — the split (the documented bookings≠ARR feature) never shows on this page (H4)
2. Intel lanes swallow fetch errors as console.warn only (page.tsx:234,248,261 for score/at-risk/win-loss; 221 for timeline/health/auto-progress) — a 500 from any of these leaves the lane silently blank with no written error or retry, below the Home-page bar of independent degradation
3. Several data lanes have no per-lane loading state (win-prob, health, stall-risk, narrative) — they pop in after the page skeleton resolves with no intermediate skeleton/spinner, so on slow networks the right rail and banners appear empty before populating

## Résolution (P1 11 residue)

- **Defect #1 (dead split):** FIXED earlier as R3/T7 (`e3562ed3`) — the route now returns `projectAmount`/`platformArr` so `isSplit` can be true. Done.
- **Defect #2 (intel lanes swallow errors):** PARTIALLY FIXED, sensibly scoped. The core intel fetch (`fetchIntel`: timeline/health/auto-progress) now surfaces a failure via the page's existing `toast` ("Couldn't load deal intelligence. Refresh to retry.") in two cases: the network-catch, and when ALL THREE core lanes return `!res.ok` (a real backend failure vs sparse intel). A partial failure still self-hides that one lane — no toast spam. The 3 best-effort deal-intel lanes (score/at-risk/win-loss) keep self-hiding: they are optional AI enrichments, and toasting each would spam on a global 500. This makes the most impactful failure visible without bolting 6 error states onto an 850-line page (that surface/risk would be the "insensé" we avoid).
- **Defect #3 (no per-lane loading state):** NOT changed — documented P2 follow-up. The page-level skeleton covers the initial load; per-lane skeletons for the enrichment cards are a polish item, deferred.

Verdict after fix: the dead split (the H4) is wired, and the core intel failure is now visible. Per-lane loading (#3) and the 3 optional enrichment swallows remain documented P2 follow-ups. tsc clean.
