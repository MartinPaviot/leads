# FINDING-014: Fix 12 Documented Bugs from WS-0 Discovery

## User Story
As a user, I want the UI to accurately reflect what the product can do so that I can trust the interface and make informed decisions.

## Current State
`docs/bugs/WS-0-discovered.md` lists 12 bugs (5 at S2 severity). Key issues:
- **BUG-002** (S2): "Team" data visibility option does nothing
- **BUG-003** (S2): confidenceGaps panel is read-only dead UI
- **BUG-004** (S2): aiTone silently overwritten by LLM
- **BUG-007** (S2): find-contacts ignores user-selected seniorities
- **BUG-008** (S2): targetRoles desync when settings change
- **BUG-005** (S3): progress bar shows X/7 when only 6 steps
- **BUG-006** (S3): handleConnectSkip is dead code
- **BUG-009** (S3): DEFAULT_IGNORED_DOMAINS list diverges between files
- **BUG-010** (S3): identifyUser never called with full profile
- **BUG-011** (S3): home subtitle references non-existent feature
- **BUG-012** (S3): fullName split breaks compound names

Note: BUG-001 was already fixed in WS-0 PR 1.

## Acceptance Criteria

### AC-1: All S2 bugs resolved
**When** the S2 bugs (002, 003, 004, 007, 008) are addressed  
**Then** each either has a working implementation or the misleading UI is removed

### AC-2: S3 bugs resolved or documented as wontfix
**When** the S3 bugs (005, 006, 009, 010, 011, 012) are reviewed  
**Then** each is either fixed or has a documented reason for deferral

### AC-3: No regressions
**When** bug fixes are applied  
**Then** existing test suite passes and no new visual regressions appear

### AC-4: Bug tracking updated
**When** each bug is resolved  
**Then** `docs/bugs/WS-0-discovered.md` is updated with status and PR link
