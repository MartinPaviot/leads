# F3.3: TAM Builder — Requirements

## User Story
As a founder, I want to describe my ideal customer in plain English and have the system auto-generate a scored, ranked list of target accounts so I can start selling on Day 1 without manual research.

## Acceptance Criteria

### AC1: ICP description input
GIVEN the Settings page or chat
WHEN I describe my ICP (e.g. "B2B SaaS companies, 50-500 employees, Series A+, in fintech or healthcare")
THEN the system stores the ICP and begins TAM generation

### AC2: TAM auto-generation
GIVEN an ICP description
WHEN TAM generation runs
THEN the LLM generates a list of 20-50 companies matching the ICP with firmographic data

### AC3: Scored and ranked output
GIVEN a generated TAM
WHEN I view the Accounts page
THEN companies are scored and sorted by fit, with explanations for each score

### AC4: TAM refresh
GIVEN an existing TAM
WHEN I update my ICP or click "Rebuild TAM"
THEN the TAM is regenerated with the new criteria

### AC5: Chat-based TAM
GIVEN the chat
WHEN I say "build my TAM for crypto companies hiring engineers"
THEN the system generates matching accounts and enriches them

## Edge Cases
- Empty ICP description → error message
- Very broad ICP ("all companies") → LLM returns diverse mix, score lower
- Very narrow ICP ("companies using Haskell for embedded systems") → fewer results, high score
- ICP in non-English → handle gracefully
- Duplicate company names → skip or merge

## Evaluation Steps
1. Enter ICP: "B2B SaaS companies, 50-500 employees, in AI/ML"
2. Trigger TAM generation
3. Verify 20+ companies appear with industry, size, revenue
4. Verify scores are assigned and sorted descending
5. Verify score explanations reference ICP criteria
