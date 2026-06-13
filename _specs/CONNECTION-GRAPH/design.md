# Design — CONNECTION-GRAPH (dormant infra)

## Layering (vendor-neutral, IO-injected — the elegance is the seams)

```
provider/ (port)      domain (pure)            persistence (declared, not applied)
─────────────────     ──────────────────       ───────────────────────────────────
LinkedInGraphProvider  network-distance.ts      schema/connection-graph.ts
 ├ mock.ts  (tests)    company-resolution.ts      linkedin_accounts
 ├ unipile.ts (dormant) icp-overlay.ts             connection_edges
 └ index.ts (resolver)  warm-path.ts               warm_paths
        │                     │                  drizzle/manual/0002_connection_graph.sql
        └──── ingest.ts ──────┘  (orchestration, all IO injected)
                  │
        inngest/connection-graph-sync.ts  (NOT registered, flag-gated, throws if reached unwired)
```

The domain never imports a provider; the provider never imports the domain except shared `types.ts`. `ingest.ts` takes its IO as injected deps, so the whole pipeline is tested with the mock + in-memory maps — no DB, no network.

## Gating (three independent locks, any one keeps prod safe)
1. `LINKEDIN_GRAPH_ENABLED` env (default off) → `resolveGraphProvider()` returns null.
2. `connectionGraphSync` is NOT in the Inngest route registry → cannot be invoked in prod.
3. Its handler early-returns when disabled, then throws (DB deps unwired) → can never make a live call by accident.
Plus: branch unmerged (main = prod auto-deploy), migration in `drizzle/manual/` (deliberate apply only).

## Domain decisions
- **Network distance** normalised once; unknown → out_of_network (a malformed value is never a warm signal).
- **Company resolution** fail-closed: domain → exact normalised name → null. A wrong resolution mis-routes a warm path (worse than unresolved). Reuses ICP `norm()` so francophone names reconcile.
- **ICP overlay** = first-degree ∧ resolved ∧ fit ≥ 0.5, ranked by fit. The cheap, high-value product.
- **Warm path** splits by data source: `insider` from edges alone (cheap, comes with the relations list); `intro_path` needs per-target shared connections (expensive, Sales-Nav, high-priority targets only). Strengths: insider 0.8→1.0, intro 0.3→0.6 cap — insider always wins. Simple and documented over falsely precise.

## Data model
Personal scope (owner_user_id everywhere), mirrors connected_mailboxes. `connection_edges` unique on (owner, person) for idempotent upsert. `resolved_company_id` ON DELETE SET NULL (a deleted company shouldn't drop the edge). `warm_paths` is a recomputable materialisation for cheap priorityScore/routing joins later.

## Rate-limit architecture
`ingestRelations` drips: page budget + provider `rateLimited` flag both stop it, cursor persisted each page. A 3000-connection founder ingests over several runs/days, not one call. This is why the cursor lives on `linkedin_accounts.sync_cursor`.

## RGPD note (for integration, not code)
We would process personal data of the founder's connections (no opt-in with us). Reading via the founder's authenticated session is legitimate toward LinkedIn, but storage needs a lawful basis + minimisation + DPA mention. Flag before enabling.

## Integration checklist (when Unipile goes live)
Wire DB deps in `connection-graph-sync.ts` (resolve vs `companies`, upsert `connection_edges`, save cursor on `linkedin_accounts`); register the fn in the route; emit `linkedin/graph.sync.requested` from the connect flow + a daily cron; run the spike (relations payload shape); apply `drizzle/manual/0002`; add `LINKEDIN_GRAPH_ENABLED=true` + `LINKEDIN_GRAPH_PROVIDER=unipile` + `UNIPILE_DSN`/`UNIPILE_API_KEY`.
