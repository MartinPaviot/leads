# FINDING-012: Calibrate Trust Score Deltas

## User Story
As a product engineer, I want trust score deltas to be evidence-based and configurable so that the autonomy progression system behaves predictably and can be tuned from real usage data.

## Current State
- `trust-score.ts:34-40` hardcodes deltas: `approved_no_edit: +0.02`, `undone_after_send: -0.05`.
- No calibration evidence exists for why +0.02 and -0.05 were chosen.
- The 14-day redisplay window (`REDISPLAY_AFTER_DAYS = 14`) has no justification.
- At +0.02 per approval, reaching the 0.50 batch-daily threshold requires 25 clean approvals — but there is no analysis of whether this matches expected user behavior.

## Acceptance Criteria

### AC-1: Deltas sourced from configuration
**When** trust score deltas need to change  
**Then** they can be updated in a single config file or environment variable without code changes

### AC-2: Calibration documented
**When** the trust score system is reviewed  
**Then** a calibration document exists explaining the rationale for each delta value and threshold

### AC-3: Redisplay window configurable
**When** the 14-day nudge redisplay window needs adjustment  
**Then** it can be changed via configuration without a code deploy

### AC-4: Simulation test validates progression
**When** the calibration values are set  
**Then** a test simulates a realistic approval sequence and verifies the user reaches batch-daily threshold within 2-4 weeks of daily use
