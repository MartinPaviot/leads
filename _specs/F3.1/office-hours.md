# F3.1 Company Enrichment — Office Hours

## Problem statement
Companies in the CRM have just a name (from CSV import or manual creation). To score accounts, build TAM, and personalize outreach, we need firmographic data: industry, size, revenue, tech stack, funding stage, location.

## Premise challenge
**Assumption**: We need third-party data providers (Apollo, PDL, etc.) for enrichment.
**Challenge**: Can we use the LLM + web search instead?
- LLMs have training data about many companies but it's dated and may hallucinate
- Web search (via LLM tool use) can find current data but is slower and more expensive
- Data providers have structured, verified data at scale

**Verdict**: For M3 MVP, use the LLM to enrich from its training data + web search as a tool. This avoids API key management for data providers and is fast to build. Add data provider APIs in a later sprint.

## Completeness target: 7/10
- 10: Multi-provider waterfall, real-time verification, confidence scoring
- 7: LLM-based enrichment from training data, batch processing, stored in DB
- What's missing for 7: Real-time data provider APIs, accuracy verification
