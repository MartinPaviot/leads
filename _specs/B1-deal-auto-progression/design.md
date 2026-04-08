# B1: AI Auto-Progression — Design

## System Fit
Uses existing patterns: Inngest function, Claude LLM, activity queries, workflow triggers.

## New Cron Endpoint: `/api/cron/deal-progression`

GET request (called by Vercel cron or manual trigger). For each tenant:

1. Load tenant settings → pipelineStages with descriptions and aiFillModes
2. Query active deals (stage not won/lost, updated in last 30 days)
3. For each deal with stage.aiFillMode !== "off":
   a. Fetch last 10 activities for this deal
   b. Get current stage description and next stage description
   c. If activities exist in last 7 days, ask Claude:
      "Given this deal in stage '{currentStage}' ({description}),
       with these recent activities: {activities},
       should this deal progress to '{nextStage}' ({nextDescription})?
       Answer YES or NO with a one-sentence reason."
   d. If YES and mode="auto": update deal.stage, log activity, fire workflow
   e. If YES and mode="suggest": create notification with suggestion

## LLM Integration
- Model: Claude Haiku (cheapest, fast enough for batch evaluation)
- Max tokens: 100 (yes/no + reason)
- Rate: max 20 deals per cron run to control costs

## Data Model Changes
None — uses existing deals, activities, notifications tables.

## Failure Handling
- LLM timeout → skip deal, log warning
- No activities → skip deal
- Invalid stage name → skip
- Batch limit: 20 deals per run to avoid timeout
