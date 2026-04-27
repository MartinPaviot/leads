# Tasks — FINDING-003 Eliminate bus factor 1 via process scaffolding

> Lie a : `.kiro/specs/FINDING-003/{requirements.md,design.md}`

## Phase 1 — GitHub process artifacts

- [ ] **T1. Create .github/CODEOWNERS**
  - Eval-first: Assert `.github/CODEOWNERS` exists and contains at least 5 path rules pointing to `@MartinPaviot`. Assert paths cover `lib/prompts/`, `lib/guardrails/`, `lib/agents/`, `lib/evals/`, `db/schema.ts`, `inngest/`, and `(marketing)/page.tsx`.
  - Action: Create `.github/CODEOWNERS` per design.md section 3a. Include comments explaining each path group and where engineer #2 slots in.
  - Verification: `git diff` shows the file. GitHub renders it correctly on a test PR.
  - Estimation: 30min

- [ ] **T2. Create .github/PULL_REQUEST_TEMPLATE.md**
  - Eval-first: Assert `.github/PULL_REQUEST_TEMPLATE.md` exists and contains sections: "Summary", "Test plan", "Rollback plan", and a checkbox for "Marketing claims still match implementation".
  - Action: Create the PR template per design.md section 3b. Include the claims-verified checkbox (coordinates with FINDING-002 T7).
  - Verification: Open a draft PR on a test branch — template auto-populates the description.
  - Estimation: 30min

## Phase 2 — Incident response scaffolding

- [ ] **T3. Create docs/INCIDENT_TEMPLATE.md**
  - Eval-first: Assert `docs/INCIDENT_TEMPLATE.md` exists and contains fields: Severity, Status, Impact, Timeline table, Root cause, Remediation, Follow-up actions.
  - Action: Create the incident template per design.md section 3c. Use a standard severity scale (P0-P2) consistent with the audit findings format.
  - Verification: File exists, all required sections present, renders correctly in GitHub.
  - Estimation: 30min

- [ ] **T4. Create docs/POSTMORTEM_TEMPLATE.md**
  - Eval-first: Assert `docs/POSTMORTEM_TEMPLATE.md` exists and contains fields: Incident ref, 5 Whys, What went well, What went wrong, Action items table, Lessons learned.
  - Action: Create the postmortem template per design.md section 3d.
  - Verification: File exists, all required sections present.
  - Estimation: 30min

## Phase 3 — Hiring plan + branch protection

- [ ] **T5. Create docs/HIRING_PLAN.md**
  - Eval-first: Assert `docs/HIRING_PLAN.md` exists and contains: target hire timeline (within 30 days of close), role description, onboarding checklist referencing RUNBOOK.md, and architecture overview pointers.
  - Action: Write a hiring plan document covering: (1) role = Senior Full-Stack Engineer with AI/agent experience, (2) timeline = posted within 1 week of funding, offer within 30 days, (3) onboarding = RUNBOOK.md walkthrough + CODEOWNERS co-ownership + PR process introduction, (4) known limitation = self-review until hire, (5) architecture docs pointers for day-1 productivity.
  - Verification: Document is specific enough that an investor reads it as a plan, not a placeholder.
  - Estimation: 1h

- [ ] **T6. Enable branch protection with CODEOWNERS enforcement**
  - Eval-first: Attempt to merge a PR that modifies `lib/prompts/` without a CODEOWNERS review — should be blocked.
  - Action: In GitHub repo settings, enable branch protection on `main`: (1) require status checks from FINDING-001 CI, (2) require review from code owners, (3) allow admin bypass for Martin's solo workflow. Note: this task depends on FINDING-001 T7 for the status checks portion. If FINDING-001 is not yet shipped, enable CODEOWNERS review requirement only and add status checks later.
  - Verification: PR to `lib/prompts/` shows "Review required" badge. Martin can still merge via admin bypass.
  - Estimation: 30min

## Acceptance gate

- [ ] All 6 tasks completed
- [ ] CODEOWNERS renders correctly on GitHub and shows required reviewers
- [ ] PR template auto-populates on new PRs
- [ ] Incident + postmortem templates committed to `docs/`
- [ ] Hiring plan committed and suitable for data room
- [ ] Branch protection active on main with CODEOWNERS enforcement
