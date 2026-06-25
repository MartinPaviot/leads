# 31 — graph (`/graph`) — audit d'hydratation

**Verdict global : H2 (partiel).** The /graph (Context Graph) page is largely faithful: every data-bearing element (header counts, filter type breakdown, nodes, edges, detail-panel facts with confidence and bi-temporal validity) is wired to real, tenant-scoped Drizzle queries (contextGraphNodes/contextGraphEdges, all filtered by eq(tenantId, authCtx.tenantId)). The schema tables and every referenced column exist, so no shape mismatch or tenant leak. The one consistent defect is error degradation: fetchGraph and sendFeedback both swallow failures with empty catch blocks, so any 500 from the routes collapses the whole canvas into the (well-written) 'No graph data yet' empty state instead of showing an error — making a backend failure indistinguishable from a genuinely empty graph.

Entrée : `app/apps/web/src/app/(dashboard)/graph/page.tsx`.

## Éléments

| Élément | file:line | Source (file:line) | État | Tenant | Loading | Empty | Error | Fresh | Note |
|---------|-----------|--------------------|------|--------|---------|-------|-------|-------|------|
| Header subtitle ("N entities, N facts") | app/apps/web/src/app/(dashboard)/graph/page.tsx:210 | GET /api/context-graph/stats → nodeCount/validEdgeCount (stats/route.ts:10-17) | H1 | yes | spinner | handled | silent | once | faithful; renders empty string when stats null |
| Filter type pills + counts (typeBreakdown) | app/apps/web/src/app/(dashboard)/graph/page.tsx:231-246 | GET /api/context-graph/stats → typeBreakdown groupBy entityType (stats/route.ts:32-37) | H1 | yes | spinner | handled | silent | once | real per-type counts; only renders inside non-empty branch |
| Graph nodes (circles + name + entityType labels) | app/apps/web/src/app/(dashboard)/graph/page.tsx:302-341 | GET /api/context-graph → contextGraphNodes (route.ts:18-21) | H1 | yes | spinner | handled | silent | once | real tenant nodes; force layout client-side; written empty state at :218 |
| Graph edges (lines + relationType labels) | app/apps/web/src/app/(dashboard)/graph/page.tsx:270-299 | GET /api/context-graph → contextGraphEdges (route.ts:26-38) | H1 | yes | spinner | handled | silent | once | real tenant edges, isNull(tInvalid) filter respects showInvalid toggle |
| Detail panel: node name/type/summary | app/apps/web/src/app/(dashboard)/graph/page.tsx:356-377 | selected node from /api/context-graph nodes | H1 | yes | none | n/a | silent | once | faithful; summary conditionally rendered |
| Detail panel: connected facts list (fact, relationType, confidence%, tValid→tInvalid, sourceType) | app/apps/web/src/app/(dashboard)/graph/page.tsx:386-437 | edges filtered by selected node (route.ts:26-38) | H1 | yes | none | handled | silent | once | real edge fields incl. bi-temporal validity; written empty 'No facts connected' at :438 |
| Thumbs up/down feedback (confidence update / invalidate) | app/apps/web/src/app/(dashboard)/graph/page.tsx:419-433 | POST /api/context-graph/feedback (feedback/route.ts:12-106) | H2 | yes | none | n/a | silent | once | writes real tenant-scoped confidence/metadata; on failure catch is silent — no user error/toast, UI silently no-ops |
| showInvalid toggle label | app/apps/web/src/app/(dashboard)/graph/page.tsx:248-255 | local state, re-fetches with includeInvalid param | H0 | n/a | none | n/a | n/a | once | chrome control; drives a real refetch |

## Pires défauts

1. Silent error handling: fetchGraph catch is a no-op (page.tsx:80), so a 500 on /api/context-graph or /stats falls through to the 'No graph data yet' empty state (page.tsx:216-223) — backend failure looks identical to an empty graph; no independent error degradation per lane.
2. Feedback failures are invisible: sendFeedback swallows errors (page.tsx:180), so a failed thumbs up/down POST silently no-ops with no toast or rollback indication (page.tsx:419-433).
3. Loading is a single global spinner (page.tsx:194-203) rather than per-lane skeletons; the entire page is gated, so no element degrades independently while data loads — below the Home-page bar of independently-degrading lanes.

## Résolution (P1 31 — fixed)

- **Defect #1 (silent error→empty):** added a `loadError` state. `fetchGraph` resets it on entry and sets it when the load-bearing graph fetch returns `!graphRes.ok` or throws. The `nodes.length === 0` branch now renders `<EmptyState variant="error" title="Couldn't load the graph" actionLabel="Retry" onAction={fetchGraph}>` when `loadError`, else the original "No graph data yet". A backend 500 no longer reads as an empty graph.
- **Defect #2 (invisible feedback failures):** `sendFeedback` now sets a `feedbackError` state (the offending edge id) on `!res.ok`/catch and clears it on entry/success. The fact card for that edge renders a `role="alert"` "Couldn't save your feedback — try again." line, so a failed thumbs up/down is no longer a silent no-op.
- **Defect #3 (global spinner, not per-lane):** deliberately NOT changed. The two lanes (graph + stats) are fetched together and the canvas is meaningless without nodes, so a shape-matching skeleton per lane buys little here; the global spinner + the new error/empty distinction is the sensible bar for this page. Flagged, not rushed.

Verdict after fix: **H1** for the load + feedback paths (faithful empty/error distinction, visible write failures). No page test harness (heavy SVG client page) — change is contained to page.tsx; tsc clean.
