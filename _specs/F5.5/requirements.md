# F5.5: Pipeline Analytics

## User Story
As a founder tracking my deals, I want to see pipeline analytics (value by stage, win rate, velocity, conversion rates) so I can understand my sales performance at a glance.

## Acceptance Criteria

### AC1: Pipeline value by stage
GIVEN deals exist in various stages
WHEN I view the analytics
THEN I see total value per active stage (lead through negotiation) as a horizontal bar chart

### AC2: Win rate
GIVEN deals in won and lost stages
WHEN I view analytics
THEN I see win rate = won / (won + lost) as a percentage

### AC3: Average deal value
GIVEN deals with values
WHEN I view analytics
THEN I see the average deal value across all non-lost deals

### AC4: Pipeline velocity
GIVEN deals with creation dates and stage change history
WHEN I view analytics
THEN I see average days deals spend in the pipeline (created to won)

### AC5: Stage conversion funnel
GIVEN deals distributed across stages
WHEN I view analytics
THEN I see count at each stage as a funnel visualization

### AC6: At-risk summary
GIVEN deals with risk detection data
WHEN I view analytics
THEN I see count of high/medium/low risk deals

### AC7: API endpoint
GIVEN authenticated user
WHEN GET /api/pipeline/analytics
THEN returns all computed metrics as JSON

## Edge Cases
- No deals → show zeroes, "No data yet" messaging
- All deals in same stage → funnel still renders
- No values on deals → show count-based metrics only
- Mixed currencies → treat all as same (USD assumption for MVP)
