# F2.6: Embedding + RAG Pipeline — Tasks

## Task 1: Enable pgvector in Supabase
- [ ] Enable vector extension via SQL: `CREATE EXTENSION IF NOT EXISTS vector`
- [ ] Create embeddings table with vector(1536) column
- [ ] Create IVFFlat index for cosine similarity
- [ ] Verify: SELECT from embeddings table works
- [ ] Test: Table exists with correct schema

## Task 2: Create embedding library
- [ ] Create `src/lib/embeddings.ts`
- [ ] Function `embedText(text: string): Promise<number[]>` — calls OpenAI
- [ ] Function `embedEntity(entityType, entityId, content)` — embeds + stores
- [ ] Function `searchSimilar(query, limit)` — vector similarity search
- [ ] Verify: Can embed a test string and retrieve it
- [ ] Test: Mock OpenAI API, verify correct vector stored

## Task 3: Embed contacts on import
- [ ] After CSV import, embed each contact
- [ ] Generate text: "{firstName} {lastName}, {title} at {company}. {notes}"
- [ ] Store embedding linked to contact entity
- [ ] Verify: After import, embeddings table has entries
- [ ] Test: Import 5 contacts, verify 5 embeddings created

## Task 4: Semantic search API
- [ ] Create `POST /api/search` route
- [ ] Accept query string, embed it, do cosine similarity
- [ ] Return top-K results with entity details
- [ ] Verify: Search "CTO" returns contacts with CTO title
- [ ] Test: Verify search results are relevant

## Task 5: Enhance chat with RAG context
- [ ] In chat API route, before calling LLM:
  - Embed the user's message
  - Search for similar embeddings
  - Include top 5 results as context in system prompt
- [ ] Verify: Chat about contacts returns accurate data
- [ ] Test: Ask "who is Sarah Chen" → response references her data
