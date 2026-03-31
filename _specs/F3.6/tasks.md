# F3.6: AI Semantic Search — Tasks

## Task 1: Enhanced search API with entity hydration
- [ ] Create POST /api/search/tam route
- [ ] Accept query, optional entityType filter, limit
- [ ] Embed query, search pgvector, hydrate results with entity data
- [ ] Verify: Search "fintech" → returns fintech companies with details
- [ ] Test: Auth, validation, search results

## Task 2: Search bar on accounts page
- [ ] Add search input above the accounts table
- [ ] Instant text filter (by name/domain/industry)
- [ ] Semantic search button for AI-powered search
- [ ] Results display with relevance scores
- [ ] Verify: Type "AI" → table filters to AI companies
