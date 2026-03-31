# F4.1: Sequence Builder — Requirements

## User Story
As a founder, I want to create multi-step email sequences with configurable delays so I can automate follow-up outreach without manual tracking.

## Acceptance Criteria

### AC1: Create sequence
GIVEN the Sequences page
WHEN I click "Create Sequence"
THEN I can name the sequence and add steps with templates + delays

### AC2: Sequence steps
GIVEN a sequence
WHEN I add steps
THEN each step has: step number, subject template, body template, delay (days)

### AC3: Enroll contacts
GIVEN a sequence
WHEN I enroll contacts
THEN they enter the sequence and step timers begin

### AC4: Sequence list view
GIVEN multiple sequences
WHEN I view the Sequences page
THEN I see: name, step count, enrolled count, status

### AC5: Sequence detail view
GIVEN a sequence
WHEN I click into it
THEN I see all steps, enrolled contacts, and execution status

## Edge Cases
- Empty sequence (no steps) → error on enrollment
- Duplicate enrollment → skip
- Contact without email → skip with warning

## Evaluation Steps
1. Create sequence "Cold Outreach"
2. Add 3 steps with 2-day delays
3. Enroll 5 contacts
4. Verify sequence appears in list with correct counts
