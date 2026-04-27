# Requirement: CI/CD pipeline + eval gate at merge

> Lie a : FINDING-001
> Pilier : 4.18 Org, process & change management + 4.7 Evals
> Severite originale : P0

## User Story

As a **founding engineer deploying to production**,
I want **every PR to pass lint, typecheck, tests, and agent eval gates before merge**,
so that **no regression reaches production undetected, and the DD audit shows mature engineering process**.

## Contexte

Zero CI/CD pipeline exists. Deploys go to prod via Vercel auto-deploy on merge to main with no gates. Agent evals (13 grader types, 100+ tests) exist but never block a deploy. This is the #1 process maturity signal for any investor.

## Acceptance Criteria (EARS)

1. **WHEN** a PR is opened against `main`, **THE SYSTEM SHALL** run a GitHub Actions workflow that executes: pnpm lint, pnpm tsc, pnpm test, and pnpm eval:run within 10 minutes.

2. **WHEN** any of lint/typecheck/test/eval steps fail, **THE SYSTEM SHALL** block the PR merge via GitHub branch protection required status checks.

3. **WHEN** eval scores on golden test cases regress by >5% compared to the baseline stored in `evals/baseline.json`, **THE SYSTEM SHALL** fail the eval step and comment on the PR with the specific regressions.

4. **IF** the eval step cannot run (e.g., missing API key in CI secrets), **THEN THE SYSTEM SHALL** fail the check with a clear error message rather than skip silently.

5. **WHERE** a PR modifies files in `lib/prompts/`, **THE SYSTEM SHALL** additionally run the full eval suite (not just affected tests) and require manual approval from CODEOWNERS.

## Non-functional requirements

| Critere | Valeur cible | Methode de mesure |
|---------|-------------|-------------------|
| CI pipeline duration | < 10 min | GitHub Actions timing |
| Eval gate accuracy | 0 false negatives on golden set | Manual review of first 20 PRs |
| Flakiness rate | < 2% | Track reruns over 30 days |

## Out of scope

- Canary deployment (FINDING-002 concern, separate spec)
- Performance/load testing in CI
- Visual regression testing

## Dependencies

- GitHub Actions secrets: ANTHROPIC_API_KEY for eval runs
- FINDING-005 (llm_judge implementation) should ship first so evals are meaningful

## Acceptance gate

- [ ] All Acceptance Criteria pass
- [ ] Branch protection enabled on main with required checks
- [ ] 10 consecutive PRs pass through the pipeline without false failures
- [ ] Pipeline runs in < 10 minutes consistently
