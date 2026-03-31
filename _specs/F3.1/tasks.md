# F3.1: Company Enrichment — Tasks

## Task 1: Create enrichment API
- [ ] Create `POST /api/enrich` route
- [ ] Accept company ID or name
- [ ] Use Claude to generate firmographic data from training knowledge
- [ ] Update company record in database
- [ ] Verify: API returns enriched data
- [ ] Test: Enrich "Stripe" → industry: Fintech, etc.

## Task 2: Batch enrichment
- [ ] Add batch mode to enrichment API (accept array of IDs)
- [ ] Process sequentially with rate limiting
- [ ] Return summary (enriched count, failed count)
- [ ] Verify: Batch enrich 5 companies
- [ ] Test: All 5 have industry/description after enrichment

## Task 3: Re-embed after enrichment
- [ ] After enrichment, update the company embedding with new data
- [ ] Verify: Search finds enriched companies by industry
- [ ] Test: Search "fintech" → returns enriched fintech companies
