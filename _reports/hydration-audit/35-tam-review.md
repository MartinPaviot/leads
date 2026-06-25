# 35 — tam-review (`/tam/review`) — audit d'hydratation

**Verdict global : H2 (partiel).** The /tam/review page is well-wired to real tenant-scoped data: both the proposal list and the pending count come from listProposals (eq tenantId, status filter, newest-first) behind withAuthRLS, and the page has a proper loading spinner plus a written empty state that matches the Home reference bar. It falls short of H1 on one axis: the load() fetch swallows errors (returns on !res.ok, empty catch) and never surfaces a failure banner, so a 500 or shape error renders identically to the legitimate empty state — masking failure as 'No pending proposals'. Data is also fetched once on mount with no focus/interval refresh (freshness=once). The decide() action path, by contrast, degrades correctly with an explicit 'Action failed.' message.

Entrée : `app/apps/web/src/app/(dashboard)/tam/review/page.tsx`.

## Éléments

| Élément | file:line | Source (file:line) | État | Tenant | Loading | Empty | Error | Fresh | Note |
|---------|-----------|--------------------|------|--------|---------|-------|-------|-------|------|
| Header pending count badge | app/apps/web/src/app/(dashboard)/tam/review/page.tsx:104 | GET /api/tam/proposals -> listProposals(counts) app/apps/web/src/lib/tam/proposals.ts:253; route app/apps/web/src/app/api/tam/proposals/route.ts:18 | H2 | yes | none | handled | silent | once | Real tenant-scoped count (counts.pending ?? proposals.length). But on fetch !res.ok or throw the client silently returns (page.tsx:45,49) leaving 0/empty with no error surface; no loading state on the badge itself. |
| TAM proposals list (rows: kind pill, summary, reason/source) | app/apps/web/src/app/(dashboard)/tam/review/page.tsx:160 | GET /api/tam/proposals -> listProposals(proposals) app/apps/web/src/lib/tam/proposals.ts:240-251 (eq tenantId, status, desc createdAt, limit) | H2 | yes | skeleton | handled | silent | once | Real tenant-scoped rows from tam_proposals. Loading spinner (page.tsx:141) and written empty state (page.tsx:145) both present. Defect: error degradation is absent — a 500/shape error is swallowed (page.tsx:45,49) and renders as the empty 'No pending proposals' state, masking failure as success. No refetch after focus/interval (load runs once on mount, freshness=once). |
| Action result note banner | app/apps/web/src/app/(dashboard)/tam/review/page.tsx:131 | POST /api/tam/proposals/decide response (r.approved/r.rejected/r.failed) page.tsx:74-79 | H1 | yes | spinner | n/a | independent | once | Faithful: shows real decide() result counts, with per-row/all busy spinners and an explicit 'Action failed.' message on !res.ok or throw (page.tsx:70-72,81). |

## Pires défauts

1. Error masked as empty: load() returns on !res.ok and has an empty catch (app/apps/web/src/app/(dashboard)/tam/review/page.tsx:45,49), so a 500 from the proposals route renders as the 'No pending proposals' empty state with no error banner — silent failure looks like success.
2. No independent error degradation for the list/count, unlike the Home reference bar which writes an empty/error state per lane; the GET path has zero error UI (page.tsx:131-138 note banner is only fed by decide(), not load()).
3. Stale data risk: proposals load once on mount with no refetch on focus/visibility/interval (page.tsx:56-58), so approvals/refreshes enqueued by the living-TAM loops won't appear until a manual reload.

## Résolution (P1 35 — fixed)

- **Defect #1 + #2 (error masked as empty, no error UI for the GET):** added a `loadError` state. `load()` now sets it on `!res.ok` (replacing the bare `return`) and on a thrown fetch, reset on entry. The list area renders a `role="alert"` error block ("Couldn't load proposals … This is not an empty queue.") with a Retry button (`onClick={load}`) BEFORE the "No pending proposals" empty state, matching the page's bespoke card styling in the error tone. A 500 no longer reads as a cleared review queue. The `decide()` action path already degraded correctly ("Action failed.") and is unchanged.
- **Defect #3 (stale once-on-mount):** deliberately NOT changed in this pass. Proper freshness here means a focus/visibility refetch (the living-TAM loops enqueue asynchronously); that is a sensible follow-up but distinct from the error-state masking bug. Flagged, not rushed — adding a poll loop without measuring the loop cadence would be premature. The manual Retry now at least gives the operator a one-click refresh.

Verdict after fix: **H1** for the load/empty/error distinction (both the list and the count surface a real error now). Freshness (#3) remains a documented follow-up. tam-proposals lib already tested; the page change is contained to page.tsx; tsc clean.
