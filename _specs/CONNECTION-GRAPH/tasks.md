# Tasks — CONNECTION-GRAPH (dormant infra)

## Done this PR (infra only, nothing in prod)
1. [x] Schema `db/schema/connection-graph.ts` (linkedin_accounts, connection_edges, warm_paths) + barrel export.
2. [x] Manual migration `drizzle/manual/0002_connection_graph.sql` (additive, NOT applied).
3. [x] Domain types `lib/connection-graph/types.ts`.
4. [x] `network-distance.ts` — pure normaliser (verify: tests, fail-safe).
5. [x] `company-resolution.ts` — domain→name→null, reuses ICP `norm()` (verify: tests).
6. [x] `icp-overlay.ts` — first-degree × ICP ranked overlay (verify: tests).
7. [x] `warm-path.ts` — insider + intro_path + bestWarmPath (verify: tests, strength bounds).
8. [x] Provider port `provider/types.ts` + `mock.ts` + dormant `unipile.ts` + gated `index.ts` resolver.
9. [x] `config.ts` — `isConnectionGraphEnabled` / `configuredGraphProviderId`.
10. [x] `ingest.ts` — IO-injected drip orchestration (verify: ingest tests w/ mock).
11. [x] `inngest/connection-graph-sync.ts` — defined, NOT registered, flag-gated, throws-if-unwired.
12. [x] Tests: domain + ingest + gating — 26 cases across 3 files, all green.
13. [x] vitest green (26/26) + tsc clean for all new code (only pre-existing stale-.next noise on an unrelated removed route).
14. [x] Commit + push + PR — NOT merged (main = prod auto-deploy).

## Deferred to integration (unblocked, not built)
- [ ] Spike: relations payload shape vs rate-limit cost against a real account.
- [ ] DB-backed Inngest deps + register fn + connect-flow event + daily drip cron.
- [ ] Per-target shared-connection fetch (intro paths), Sales-Nav-gated.
- [ ] Feed warm strength into `priorityScore` (accessibility factor) + sequence routing (`shared_connection` angle).
- [ ] UI: ICP-overlay panel + "connect Sales Navigator to unlock intro paths" graceful-degrade.
- [ ] RGPD: lawful basis + minimisation + DPA before first real ingestion.
