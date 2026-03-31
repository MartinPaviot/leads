# F3.1: Company Enrichment — Requirements

## User Story
As a founder, I want my accounts to be automatically enriched with industry, size, revenue, and other firmographic data so I can score and prioritize them without manual research.

## Acceptance Criteria

### AC1: Enrich single company
GIVEN an account with just a name
WHEN I click "Enrich" on the account detail
THEN the LLM fills in industry, size, revenue, description

### AC2: Batch enrichment
GIVEN multiple accounts without data
WHEN I click "Enrich all" in Settings or via API
THEN all accounts are enriched in sequence

### AC3: Enrichment stored
GIVEN an enriched account
WHEN I view the Accounts page
THEN the enriched data appears in the table columns

### AC4: Chat-based enrichment
GIVEN the chat
WHEN I say "enrich Meridian Labs"
THEN the LLM researches and updates the account

## Evaluation Steps
1. Create account "Stripe" with no other data
2. Call enrichment API
3. Verify industry, size, revenue, description are filled
4. Check database for updated fields
