# Requirement: Correct 3 overstated marketing claims (wrapper risk)

> Lie a : FINDING-002
> Pilier : 4.13 Differenciation vs wrapper
> Severite originale : P0

## User Story

As a **prospective investor reading the Elevay landing page**,
I want **every product capability claim to match the actual codebase behavior**,
so that **due diligence finds zero dissonance between marketing and implementation, eliminating wrapper-risk objections**.

## Contexte

The landing page (`apps/web/src/app/(marketing)/page.tsx`) makes three claims the code does not support:

| CLAIM | Landing page text | Code reality |
|-------|------------------|--------------|
| CLAIM-001 | "joins your calls" (hero H1) | Recall.ai third-party bot joins; Elevay only schedules it |
| CLAIM-003 | "auto-joins, records" (foundations card + step 02 + FAQ) | 100% Recall.ai dependency; zero native recording |
| CLAIM-013 | "autonomous GTM engine" (tagline) | Default mode = `review-each`; sequence enrollment threshold = 1.1 (never auto) |

Additionally, no fallback plan exists for a Recall.ai outage, which makes the meeting-bot feature a single point of failure.

## Acceptance Criteria (EARS)

1. **WHEN** a visitor reads the hero section, **THE SYSTEM SHALL** display wording that accurately attributes meeting participation to Recall.ai integration (e.g., "Connects to your meetings via Recall.ai") instead of implying native call joining.

2. **WHEN** a visitor reads the "How it works" step 02, foundations card, or FAQ answer about the meeting bot, **THE SYSTEM SHALL** describe the feature as a Recall.ai-powered integration, not as a native Elevay capability.

3. **WHEN** a visitor reads the tagline or hero subtitle, **THE SYSTEM SHALL** describe autonomy as progressive ("Progressively autonomous — learns your preferences, you stay in control") rather than absolute.

4. **WHEN** the Recall.ai API returns an error or is unreachable during bot scheduling, **THE SYSTEM SHALL** notify the user with an actionable fallback message instead of failing silently.

5. **WHERE** the `approval-mode.ts` documents sequence-enrollment threshold = 1.1, **THE SYSTEM SHALL** include an inline code comment explaining why this value was chosen and when it will be revisited (WS-7 undo layer).

6. **IF** a new marketing claim is added to the landing page, **THEN THE SYSTEM SHALL** pass a lint rule (`no-unsubstantiated-claim`) or code review checklist that requires a pointer to the implementing code.

## Non-functional requirements

| Critere | Valeur cible | Methode de mesure |
|---------|-------------|-------------------|
| Claim accuracy | 100% claims map to code | Manual review of every assertion against implementation |
| Recall.ai fallback latency | < 5s user notification on outage | Integration test with mocked Recall.ai 500 |
| Copy tone | Professional, specific, no vaporware | Martin final review of all wording changes |

## Out of scope

- Replacing Recall.ai with a native meeting bot
- Changing the actual approval-mode defaults (that is a product decision, not a marketing fix)
- Full marketing site redesign

## Dependencies

- Martin's approval on final wording for all claim revisions
- Knowledge of Recall.ai error response format for fallback implementation

## Acceptance gate

- [ ] All 6 Acceptance Criteria pass
- [ ] Zero dissonance between landing page claims and codebase behavior
- [ ] Recall.ai outage fallback tested with mocked failure
- [ ] Martin signs off on revised copy
