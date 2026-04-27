# Tasks — FINDING-001 CI/CD pipeline + eval gate

> Lie a : `.kiro/specs/FINDING-001/{requirements.md,design.md}`

## Phase 1 — Foundation

- [ ] **T1. Create .github/workflows/ci.yml with lint + typecheck + test**
  - Action: Create workflow file per design.md. Add pnpm cache for speed.
  - Verification: Push to a test branch, verify Actions run and pass.
  - Estimation: 1h

- [ ] **T2. Create evals/baseline.json from current eval state**
  - Action: Run `pnpm eval:run --output evals/baseline.json` locally.
  - Verification: File exists with scores for all agents.
  - Estimation: 30min

- [ ] **T3. Add eval:run --baseline --threshold script**
  - Action: Add CLI flag to eval-runner.ts that compares against baseline and exits non-zero on regression.
  - Verification: Manually degrade a golden case, run eval:run --baseline, verify it fails.
  - Estimation: 1h30

## Phase 2 — Integration

- [ ] **T4. Add eval job to ci.yml (needs: quality)**
  - Action: Add eval job per design.md workflow spec.
  - Verification: PR triggers both quality and eval jobs. Eval uses CI secrets.
  - Estimation: 30min

- [ ] **T5. Add ANTHROPIC_API_KEY and CI_DATABASE_URL to GitHub Actions secrets**
  - Action: Add secrets in GitHub repo settings.
  - Verification: Eval job can authenticate and run.
  - Estimation: 15min

- [ ] **T6. Add CODEOWNERS file**
  - Action: Create .github/CODEOWNERS requiring Martin's review for lib/prompts/, lib/agents/, lib/guardrails/.
  - Verification: PR modifying prompts shows required reviewer.
  - Estimation: 15min

## Phase 3 — Branch protection

- [ ] **T7. Enable branch protection on main**
  - Action: GitHub Settings > Branches > main > Require status checks (CI / quality, CI / eval).
  - Verification: Attempt to merge PR with failing check — blocked.
  - Estimation: 15min

- [ ] **T8. Monitor first 10 PRs through pipeline**
  - Action: Track pass/fail rate, timing, any false failures.
  - Verification: < 2% flakiness, < 10 min duration, 0 false blocks.
  - Estimation: 1 week observation

## Acceptance gate

- [ ] All 8 tasks completed
- [ ] 10 consecutive PRs pass without false failures
- [ ] Branch protection active and blocking
- [ ] Eval baseline committed and versioned
