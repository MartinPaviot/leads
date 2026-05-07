# Requirements: Lightfield Architectural Audit Verification

## User Story
As the founder building Elevay, I need every claim in the Lightfield
architectural audit verified against primary sources and current code,
so that implementation decisions are based on facts, not inferences.

## Acceptance Criteria

### AC1: System Prompt Source Verification
GIVEN the leaked system prompt referenced in the audit
WHEN I fetch the raw file from the GitHub repository
THEN I have the exact content, commit date, author, and can assess reliability
AND each tool name is cross-referenced against observed behavior from our teardown

### AC2: Current Elevay Tool Catalog
GIVEN the audit claims "~11 tools" and "13 tools manquants"
WHEN I read the actual chat tool definitions in the current codebase
THEN I have an exact count with exact names and capabilities
AND I know which of the "missing" tools actually exist now

### AC3: Current RAG Architecture
GIVEN the audit claims "RAG non scope par account"
WHEN I read the searchSimilar and embedding code
THEN I know exactly how retrieval works: scoped or not, embedding model, chunk strategy
AND I can state with certainty what our RAG does vs what Lightfield's does

### AC4: Current System Prompt
GIVEN the audit describes Lightfield's 3-layer context injection
WHEN I read Elevay's current system prompt code
THEN I know exactly what we inject: snapshots, entity context, Knowledge, tools
AND I can produce a precise delta between our injection and Lightfield's

### AC5: Codebase Changes Since April 1
GIVEN the audit references a gap analysis from 2026-04-01
WHEN I review the git log from April 1 to today
THEN I identify every feature/tool/capability added since the gap analysis
AND I correct every stale claim in the audit

### AC6: Schema and Data Model
GIVEN the audit describes custom fields, Knowledge table, Skills table as "missing"
WHEN I read the current Drizzle schema
THEN I know exactly which tables exist and which are actually missing
AND I verify the JSONB properties column status on each entity

### AC7: Corrections Document
GIVEN all verifications above are complete
WHEN I produce the corrections document
THEN every claim is marked: VERIFIED (correct), CORRECTED (was wrong), UNKNOWN (cannot verify)
AND the corrections document replaces the audit as the source of truth

## Edge Cases
- System prompt file may have been deleted from GitHub
- Code may have been refactored since last known structure
- Some tools may exist in code but not be registered in the chat pipeline
- Features may be partially implemented (code exists but not wired)
