# F2.6: Embedding + RAG Pipeline — Requirements

## User Story
As a founder, I want to ask natural language questions about my contacts and accounts and get accurate answers with citations to the original data.

## Acceptance Criteria

### AC1: Embed contacts on import
GIVEN contacts are imported via CSV
WHEN the import completes
THEN each contact's data is embedded and stored as a vector in the database

### AC2: Embed activities
GIVEN an activity is created (email, note, meeting)
WHEN it's stored in the database
THEN its content is embedded and stored as a vector

### AC3: Semantic search
GIVEN embedded data exists
WHEN a user queries "contacts in fintech" or "who did I meet at SaaStr"
THEN relevant records are retrieved using vector similarity

### AC4: RAG context for chat
GIVEN the chat receives a query
WHEN it relates to CRM data
THEN relevant embeddings are retrieved and included as context for the LLM

## Edge Cases
- Empty content → skip embedding
- Very long content (>8000 tokens) → chunk before embedding
- Duplicate content → skip if embedding already exists
- API rate limit → queue and retry

## Evaluation Steps
1. Import contacts via CSV
2. Query "show me contacts who are CTOs" via chat
3. Verify the AI references actual contact data
4. Check pgvector table has embeddings
