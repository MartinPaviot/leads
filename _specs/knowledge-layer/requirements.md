# Knowledge Layer — Requirements v2

## User Story

**As a** founder using Elevay,
**I want to** teach the AI agent about my business (ICP, competitors, objections, product, sales process) once,
**so that** every chat interaction and skill execution uses accurate, company-specific context without truncation or re-explaining.

## Context

**Current state is broken**: Knowledge is stored as flat JSON in `tenants.settings.knowledge`. The chat system prompt injects max 5 entries truncated to 300 chars each. An ICP definition of 2 pages becomes one sentence. This is not "agentic ready."

**Lightfield's standard**: Knowledge is a first-class system with categories, workspace/user scoping, full content injection via semantic retrieval, and deep integration with Skills and chat. "If you keep re-explaining the same company context, that's Knowledge."

## Acceptance Criteria

### AC-1: Knowledge CRUD on dedicated table
**GIVEN** the user navigates to Settings > Knowledge
**WHEN** they create a knowledge entry with title, category, and full markdown content
**THEN** it is stored in the `knowledge_entries` table (not tenant settings JSON)
**AND** an embedding is generated asynchronously via pgvector
**AND** the entry is immediately available for semantic search

### AC-2: Semantic retrieval in chat (replaces truncated injection)
**GIVEN** knowledge entries exist (e.g., ICP, competitor intel, objection handling)
**WHEN** the user asks "Does Acme Corp fit our ICP?" in chat
**THEN** the system embeds the user's question, runs cosine similarity against knowledge_entries
**AND** injects the TOP-3 most relevant entries IN FULL (not truncated) into the system prompt as "Business Knowledge" section
**AND** the agent cites the knowledge source in its response

### AC-3: Categories
**GIVEN** knowledge entries exist
**WHEN** they are categorized as: icp, competitors, objections, product, process, context, custom
**THEN** the settings UI groups them by category
**AND** skill execution can filter knowledge by category (e.g., only inject "icp" knowledge when qualifying leads)

### AC-4: Workspace vs user scope
**GIVEN** an admin creates workspace-level knowledge and a user creates personal knowledge
**WHEN** the agent retrieves knowledge for a query
**THEN** both workspace and user knowledge are searched
**AND** user knowledge takes precedence over workspace knowledge on the same topic
**AND** user knowledge is only visible to its creator

### AC-5: Knowledge in skill execution
**GIVEN** a skill step says "Qualify using our ICP criteria"
**AND** an ICP knowledge entry exists
**WHEN** the skill executes
**THEN** the ICP knowledge is retrieved via semantic search on the step text and injected into the skill's execution context

### AC-6: Context graph indexation
**GIVEN** a knowledge entry is created
**WHEN** it is saved
**THEN** a node of type "topic" is created in the context graph with the knowledge title/summary
**AND** the graph can surface this knowledge during BFS traversal when exploring related entities

### AC-7: Freshness indicators
**GIVEN** a knowledge entry was last updated 90+ days ago
**WHEN** the user views the knowledge list
**THEN** a "Review needed" badge appears
**AND** the agent can mention "Note: your ICP definition was last updated 3 months ago" when using stale knowledge

### AC-8: Migration from tenant settings
**GIVEN** existing tenants have knowledge in `settings.knowledge` JSON array
**WHEN** the migration runs
**THEN** all existing entries are moved to the new table with category "custom" and scope "workspace"
**AND** embeddings are generated
**AND** the `settings.knowledge` key is removed

## Edge Cases

- Empty content → reject
- Content > 50KB → chunk for embedding (8KB segments), store full in content column
- No OpenAI key for embeddings → store without embedding, use ILIKE keyword fallback
- Concurrent edits → last-write-wins with updatedAt conflict warning
- Max 200 workspace entries, 50 per user
- Knowledge entry deletion → soft delete (is_active=false), remove from graph
