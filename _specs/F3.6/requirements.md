# F3.6: AI Semantic Search — Requirements

## User Story
As a founder, I want to search my TAM with natural language queries like "crypto companies hiring RAG engineers" and get relevant, ranked results.

## Acceptance Criteria

### AC1: Natural language search
GIVEN the search bar
WHEN I type "crypto companies hiring RAG engineers"
THEN I see matching companies ranked by relevance

### AC2: Search across entity types
GIVEN a query
WHEN search runs
THEN it returns companies, contacts, and deals matching the query

### AC3: Search result details
GIVEN search results
WHEN viewing results
THEN each shows: name, type (company/contact/deal), relevance score, and a snippet

### AC4: Search from accounts page
GIVEN the accounts page
WHEN I use the search bar
THEN the table filters to matching companies

### AC5: Chat-based search
GIVEN the chat
WHEN I say "find companies in healthcare"
THEN the AI searches the TAM and returns matching accounts

## Edge Cases
- Empty query → show all / error message
- No results → "No matches found" message
- Very broad query → return top 20
- Query in non-English → attempt search

## Evaluation Steps
1. Seed TAM with 30 companies
2. Search "fintech companies"
3. Verify fintech companies rank highest
4. Search "CTOs" → verify contacts with CTO title rank high
