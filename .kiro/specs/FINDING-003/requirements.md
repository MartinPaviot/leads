# Requirement: Eliminate bus factor 1 via process scaffolding

> Lie a : FINDING-003
> Pilier : 4.18 Org, process & change management
> Severite originale : P0

## User Story

As an **a16z partner conducting due diligence on Elevay**,
I want **evidence of engineering process maturity beyond a single contributor**,
so that **the investment risk of a solo founder codebase is mitigated by visible process, documentation, and a credible hiring plan**.

## Contexte

The codebase has 534 commits from a single contributor (Martin Paviot) over 6 months. There is no CODEOWNERS file, no PR template, no incident response documentation, no postmortem process, and no on-call rotation. A RUNBOOK.md already exists, which is a positive signal, but it is insufficient alone. The fix is not hiring (that requires funding) — it is scaffolding the processes that a second engineer would slot into on day 1.

## Acceptance Criteria (EARS)

1. **WHEN** a PR is opened in the repository, **THE SYSTEM SHALL** pre-populate a PR description template containing sections for: summary, test plan, claims-verified checkbox, and rollback plan.

2. **WHEN** a file in `lib/prompts/`, `lib/guardrails/`, or `lib/agents/` is modified in a PR, **THE SYSTEM SHALL** require review from a designated code owner before merge is allowed (via GitHub CODEOWNERS + branch protection).

3. **WHEN** a production incident occurs, **THE SYSTEM SHALL** provide an incident response template (`INCIDENT_TEMPLATE.md`) with structured fields: severity, timeline, impact, root cause, remediation, and follow-up actions.

4. **WHEN** an incident is resolved, **THE SYSTEM SHALL** provide a postmortem template (`POSTMORTEM_TEMPLATE.md`) with structured fields: incident reference, 5-whys analysis, action items with owners and due dates.

5. **WHERE** the investor pitch deck or data room references team risk, **THE SYSTEM SHALL** include a documented hiring plan showing the first engineering hire is planned within 30 days of funding close, with a defined onboarding checklist pointing to RUNBOOK.md and the codebase architecture docs.

## Non-functional requirements

| Critere | Valeur cible | Methode de mesure |
|---------|-------------|-------------------|
| PR template adoption | 100% of new PRs use the template | GitHub PR audit after 2 weeks |
| CODEOWNERS coverage | All critical paths (prompts, guardrails, agents) covered | File review |
| Onboarding time for engineer #2 | < 1 week to first PR | Estimated from RUNBOOK.md + architecture docs completeness |

## Out of scope

- Actually hiring engineer #2 (requires funding)
- Setting up PagerDuty or on-call rotation (premature for a solo founder)
- SOC 2 certification process
- Full change management board or CAB process

## Dependencies

- FINDING-001 (CI/CD pipeline) should ship first or in parallel — branch protection for CODEOWNERS requires status checks to be meaningful
- Martin's input on which directories are critical enough for CODEOWNERS

## Acceptance gate

- [ ] All 5 Acceptance Criteria pass
- [ ] CODEOWNERS file active and enforced via branch protection
- [ ] PR template renders on every new PR
- [ ] Incident + postmortem templates committed
- [ ] Hiring plan document exists in data room
