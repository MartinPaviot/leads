# MONACO-PARITY-03: 7-Phase Onboarding-as-FDAE

## User Story
As a founder signing up for Elevay, I want to be guided through a structured 7-phase onboarding that mirrors what a Monaco Forward-Deployed AE would do in a kickoff call — diagnostic → ICP & TAM → email/calendar → signals → voice & sequences → pipeline → coaching activation — with each phase having a hard validation gate so I cannot proceed until the data quality is sufficient. The end-state must satisfy a concrete checklist: TAM ≥ 100 accounts with ≥ 3 A-grade, email sync proven, ≥ 3 custom signals, ≥ 1 sequence approved and started.

Source : `_research/monaco-bilan-et-classification-2026-05-06.md` Partie 6, Partie 7 #3 (P0). Verbatim Monaco : *"Onboarding is where Monaco wins or loses."*

## Acceptance Criteria

### Phase 1 — Diagnostic (5 min)
GIVEN a new tenant with no data
WHEN the user opens the onboarding wizard
THEN the wizard asks: situation (founder solo / team / etc), # deals to date, current stack, ICP one-liner
AND validates ICP contains at least (industry, company size range, buyer persona) — surfaces inline insistence if missing
AND displays a "tu vas pouvoir tout remplacer" message when HubSpot/Attio + Apollo/Clay + Outreach/Lemlist is detected

### Phase 2 — ICP & TAM (10 min)
GIVEN Phase 1 completed
THEN the user is asked for 5 best closed-won customers (or 5 ideal prospects if blank)
AND for 3 anti-ICP companies
AND a 100-account TAM is generated and streamed live
AND validation gate: user must mark ≥ 3 A/Burning accounts as relevant; if <60% relevance, return to ICP step with hint

### Phase 3 — Email & Calendar (5 min)
GIVEN Phase 2 completed with valid TAM
WHEN the user reaches Phase 3
THEN OAuth connects for Gmail OR Outlook + Calendar (Google or Microsoft) + Recall.ai
AND validation gate: count(emails sent/received last 7d) > 0 AND count(events upcoming 7d) > 0
AND if zero, surface diagnostic ("OAuth scope missing? Empty inbox?") and let user retry

### Phase 4 — Signal Configuration (5 min)
GIVEN Phase 3 OAuth proven
THEN suggest pre-built signals based on ICP (funding_recent, hiring_intent, investor_overlap, tech_stack_change, engagement_signal)
AND guide user through 3 custom-signal questions (mature-buy signal, common-investor signal, competitor-switch signal)
AND validation gate: count(custom_signals) ≥ 3

### Phase 5 — Voice & Sequences (10 min)
GIVEN Phase 4 with ≥ 3 signals
THEN ask for 5 already-sent emails OR 1 60s loom video
AND extract tone of voice (formal/casual/direct/storytelling)
AND generate 3 ICP+voice-fit sequences in preview
AND user must approve ≥ 1 sequence and launch it in `manual` mode (per-email approval)
AND mode `ask` or `auto` is unlocked only after 20 emails reviewed without correction

### Phase 6 — Pipeline Setup (5 min)
THEN ask "How do you name your stages today?" (free input)
AND attempt auto-detection from email history if available
AND offer defaults (Discovery / Demo / Proposal / Negotiation / Closed Won|Lost)
AND validation gate: ≥ 3 stages confirmed

### Phase 7 — Coaching Activation (5 min)
THEN prompt user with "Ask me anything about your pipeline"
AND demo the quick-action menu
AND if a meeting exists, auto-generate a follow-up
AND validation gate: ≥ 1 chat query made

## Outbound checklist (gate to "Onboarding complete")
| Critère | État cible |
|---|---|
| TAM ≥ 100 accounts, ≥ 3 A/Burning | Hard |
| ICP confidence > 0.7 | Hard |
| Email sync working (>10 emails) | Hard |
| Calendar sync working (≥1 event) | Hard |
| ≥ 3 custom signals | Hard |
| ≥ 1 sequence approved + running | Hard |
| ≥ 3 pipeline stages | Hard |
| ≥ 1 coaching query | Hard |
| Voice profile captured | Soft (warning if missing) |
| Closed-won examples imported | Soft (warning if missing) |

## Edge Cases
- User abandons mid-wizard → state persisted, can resume from last completed phase.
- User connects Gmail with read-only scope (no `gmail.send`) → Phase 3 validation fails with explicit retry instructing the missing scope.
- TAM build returns < 100 accounts (small ICP) → relax bar to ≥ 30 with warning.
- LLM voice extraction fails → surface fallback "Skip voice for now, we'll learn from your sends".
- User wants to skip the wizard → show "Premium: Founder-led onboarding session ($Z one-off)" upgrade upsell, not silent skip.

## Evaluation Steps
1. New tenant signs up, lands on `/onboarding`.
2. Walks through all 7 phases with synthetic data.
3. Assert each gate fires correctly for failing inputs.
4. Assert checklist at end matches DB state.
5. Time-to-first-value (TAM built + 1st sequence sent): < 48h target (Monaco verbatim "TAM built day 2, outbound same day").
6. Onboarding completion rate: > 70% target.
