# F3.3: TAM Builder — Tasks

## Task 1: TAM generation API
- [ ] Create `POST /api/tam/generate` route
- [ ] Accept ICP string, validate non-empty
- [ ] Use Claude to generate array of 30 companies matching ICP
- [ ] Insert companies into DB with `properties.source: "tam"`
- [ ] Skip duplicates (same name already exists)
- [ ] Store ICP in tenant settings
- [ ] Verify: POST with ICP → 20+ companies created
- [ ] Test: Auth, validation, generation, duplicate handling

## Task 2: TAM status and rebuild
- [ ] Create `GET /api/tam/status` route
- [ ] Create `POST /api/tam/rebuild` route (re-generates from stored ICP)
- [ ] Verify: Status returns ICP and count, rebuild creates new companies
- [ ] Test: Status API returns correct data

## Task 3: Auto-enrich + score TAM companies
- [ ] After TAM generation, call enrich API for new companies
- [ ] After enrichment, call score API for new companies
- [ ] Verify: Generated companies have enrichment data and scores

## Task 4: Settings page ICP input
- [ ] Add ICP textarea to Settings
- [ ] Add "Generate TAM" / "Rebuild TAM" button
- [ ] Show generation status and last run date
- [ ] Loading state during generation

## Task 5: Accounts page TAM integration
- [ ] Add TAM badge to TAM-sourced companies
- [ ] Default sort by score descending
- [ ] Add filter: All / TAM / Manual
