# F3.4: ML Scoring — Design

## System Fit
Scoring is what makes the TAM actionable. Without scores, the founder still has to manually decide who to target first. Scores combine firmographic data (industry, size, revenue) with ICP fit to produce a 0-100 score with human-readable explanations.

## Data Model
Uses existing `companies` table fields:
- `score` (real) — 0-100 ICP fit score
- `scoreReasons` (jsonb) — Array of explanation strings

Also applicable to `contacts` table (same fields).

## API Contracts
POST /api/score already exists — accepts `{ companyIds: string[] }`, returns `{ success: true, scored: number }`.

## UI Changes
### Accounts page
- "Score All" button in header (scores unenriched accounts)
- Score column already exists with color coding
- Score reasons shown as tooltip

### Auto-scoring integration
- After enrichment completes, auto-trigger scoring
- After TAM generation, scoring runs automatically (already implemented in F3.3)

## Failure Handling
- No LLM key: clear error message
- LLM timeout: skip individual companies
- Already scored: re-score (scores should be updatable)
