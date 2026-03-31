# F3.5: Signal Overlay — Requirements

## User Story
As a founder, I want to see buying signals (job postings, funding, tech changes) overlaid on my accounts so I can time my outreach to when prospects are most likely to buy.

## Acceptance Criteria

### AC1: Signal types
GIVEN an account
WHEN signals are detected
THEN they appear as tagged indicators: hiring, funding, tech-change, news

### AC2: Signal generation via LLM
GIVEN an enriched account
WHEN I click "Detect Signals" or signals run automatically
THEN the LLM analyzes the company and generates relevant signals

### AC3: Signals visible on accounts page
GIVEN accounts with signals
WHEN viewing the Accounts page
THEN signal badges appear in a Signals column

### AC4: Signal detail
GIVEN an account with signals
WHEN I hover over a signal badge
THEN I see the signal description and relevance

### AC5: Score boost from signals
GIVEN an account with positive signals
WHEN scoring runs
THEN the score is influenced by signal strength

## Edge Cases
- Company with no detectable signals → empty, no error
- Multiple signals → show all as badges
- Stale signals → timestamp-based relevance

## Evaluation Steps
1. Enrich account "Stripe"
2. Run signal detection
3. Verify signals appear (hiring, tech-change, etc.)
4. Verify signal tooltips show descriptions
