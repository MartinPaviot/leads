# FINDING-011: Fix Embeddings Truncation

## User Story
As a user searching my CRM, I want recent interactions to be fully embedded so that semantic search returns accurate results even for entities with long histories.

## Current State
- `embeddings.ts:31` truncates content at 6000 characters with `content.slice(0, 6000)`.
- This is a hard prefix cut: for entities with long histories, the most recent (and most relevant) context at the end is lost.
- `text-embedding-3-small` supports 8191 tokens (~32K chars), so the 6000-char limit is unnecessarily aggressive.
- Activity text (`activityToText`) already truncates `rawContent` to 2000 chars, compounding the loss.

## Acceptance Criteria

### AC-1: Recency-weighted content preserved
**When** an entity's content exceeds the embedding token limit  
**Then** the chunking strategy preserves the most recent content (last N activities/interactions) over older content

### AC-2: Token limit respected
**When** content is prepared for embedding  
**Then** the total token count stays within the `text-embedding-3-small` limit (8191 tokens)

### AC-3: Existing embeddings re-processable
**When** the new chunking logic is deployed  
**Then** a re-embedding script can update existing truncated embeddings

### AC-4: No search quality regression
**When** semantic search is performed after the fix  
**Then** results are at least as relevant as before (recent context now included)
