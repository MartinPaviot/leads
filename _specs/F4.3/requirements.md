# F4.3: Autopilot Enrollment — Requirements

## User Story
As a founder, I want the AI to automatically decide which contacts to enroll in sequences based on their score, signals, and enrichment data.

## Acceptance Criteria

### AC1: Autopilot API
GIVEN a sequence and scoring criteria
WHEN autopilot runs
THEN it enrolls the top-scoring, un-enrolled contacts with email addresses

### AC2: Score threshold
GIVEN contacts with various scores
WHEN autopilot runs with minScore=60
THEN only contacts scoring 60+ are enrolled

### AC3: Skip already enrolled
GIVEN contacts already in the sequence
WHEN autopilot runs
THEN they are skipped

### AC4: Autopilot button on sequence page
GIVEN a sequence with steps
WHEN I click "Autopilot Enroll"
THEN the system enrolls qualifying contacts

## Edge Cases
- No qualifying contacts → 0 enrolled, no error
- Contacts without email → skipped
- Sequence without steps → error

## Evaluation Steps
1. Create sequence with steps
2. Run autopilot with minScore=50
3. Verify high-scoring contacts enrolled, low-scoring skipped
