# F6.4: Proactive Insights

## User Story
As a founder, I want LeadSens to proactively surface trends, patterns, and alerts about my business so I learn things I didn't think to ask about.

## Acceptance Criteria

### AC1: Insight generation API
GIVEN pipeline and activity data exists
WHEN GET /api/insights
THEN returns array of categorized insights with severity and actions

### AC2: Insight categories
GIVEN insights are generated
THEN each insight has one of: trend, pattern, alert, opportunity
AND each has: title, description, severity (critical/high/medium/info), category, suggestedAction

### AC3: Alert-type insights
GIVEN deals are stalling or contacts going cold
THEN alerts surface like "3 deals haven't progressed in 14+ days" or "5 contacts with no activity in 30 days"

### AC4: Trend-type insights
GIVEN deal history exists
THEN surface trends like "Win rate trending up/down" or "Average deal value increasing"

### AC5: Opportunity-type insights
GIVEN scored accounts exist
THEN surface "12 accounts scored 80+ have no active sequence" or "TAM coverage at 40%"

### AC6: Dashboard widget
GIVEN insights exist
WHEN user views dashboard
THEN sees "Insights" section with top 5 insights, color-coded by severity

### AC7: No data graceful
GIVEN no data
WHEN insights requested
THEN returns empty array, UI shows "Not enough data for insights yet"

## Edge Cases
- Very few deals → limit to achievable insights
- No AI key → compute rule-based insights only (no LLM)
