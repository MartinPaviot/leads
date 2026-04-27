# FINDING-010: TTL and Conflict Resolution for Agent Memory

## User Story
As a user, I want agent memories to expire when stale and to correctly prioritize user-provided facts over inferred ones so that the agent's knowledge stays accurate over time.

## Current State
- `chatMemories` table has an `expiresAt` column but it is never set by any code path.
- `memory.ts` tool's `rememberContext` and `recallMemories` do not filter on `expiresAt`.
- `memory-auto-extract.ts` inserts memories with `category='auto_extracted'` but no expiration.
- No priority system exists: if the LLM infers "Company X does consulting" but the user says "Company X does SaaS", both coexist with no resolution.

## Acceptance Criteria

### AC-1: Auto-extracted memories expire
**When** the memory-auto-extract worker creates a memory  
**Then** it sets `expiresAt` to 90 days from creation

### AC-2: User-provided memories do not expire by default
**When** a user explicitly tells the agent to remember something  
**Then** `expiresAt` is null (persists indefinitely)

### AC-3: Expired memories excluded from recall
**When** `recallMemories` is called  
**Then** memories where `expiresAt < now()` are excluded from results

### AC-4: User-provided facts override inferred facts
**When** a user-provided memory and an auto-extracted memory share the same key  
**Then** the user-provided memory takes priority in recall results, and the inferred memory is marked superseded
