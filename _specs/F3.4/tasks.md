# F3.4: ML Scoring — Tasks

## Task 1: Score All button on accounts page
- [ ] Add "Score All" button that calls POST /api/score with all account IDs
- [ ] Loading state during scoring
- [ ] Refresh accounts after scoring completes
- [ ] Verify: Click Score All → scores appear on all accounts
- [ ] Test: Score API already tested (4 tests in score-api.test.ts)

## Task 2: Auto-score after enrichment
- [ ] Chain scoring after enrichment in the enrich API
- [ ] Verify: Enriching a company also scores it
- [ ] Test: Verify score is set after enrichment

## Task 3: Contact scoring API
- [ ] Create POST /api/score-contacts route
- [ ] Score contacts based on title seniority, company fit, engagement
- [ ] Verify: Score contacts → scores appear
- [ ] Test: Auth, validation, scoring flow
